import {samePublicKey,storedMessageIdentity,type PublicKey} from './message-crypto.ts';
import {openMessageRecoveryIdentity,type MessageRecoveryEnvelope} from './message-recovery.ts';
import type {TransferKeyPair} from './trusted-device-crypto.ts';

const NAME='carehold-trusted-devices-v1';
const encoder=new TextEncoder();
const validUser=(id:string)=>{if(!id||id.length>200)throw new Error('Sign in before using trusted devices.');};
const encoded=(bytes:Uint8Array)=>{let x='';for(const b of bytes)x+=String.fromCharCode(b);return btoa(x).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const decoded=(x:string)=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export type LocalTrustedDevice={userId:string,id:string,name:string,recoveryPublicKey?:PublicKey,recoveryKey?:CryptoKey,iv?:string,ct?:string};
export type PendingDeviceTransfer={userId:string,id:string,privateKey:CryptoKey,publicKey:PublicKey,createdAt:number};
function openDb():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined'||!crypto.subtle)throw new Error('This browser cannot keep trusted-device credentials.');
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(NAME,1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains('devices'))req.result.createObjectStore('devices',{keyPath:'userId'});
   if(!req.result.objectStoreNames.contains('pending'))req.result.createObjectStore('pending',{keyPath:'userId'});
  };
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(req.error??new Error('Unable to open trusted-device storage.'));
  req.onblocked=()=>reject(new Error('Close any older Carehold tabs and retry device setup.'));
 });
}
function result<T>(req:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
function committed(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
}
const associated=(userId:string,id:string,publicKey:PublicKey)=>
 encoder.encode(JSON.stringify(['carehold-local-recovery-escrow-v1',userId,id,publicKey]));
export async function localTrustedDevice(userId:string):Promise<LocalTrustedDevice>{
 validUser(userId);
 const db=await openDb();
 try{
  const existing=await result<LocalTrustedDevice|undefined>(db.transaction('devices','readonly').objectStore('devices').get(userId));
  if(existing)return existing;
  const fresh:LocalTrustedDevice={userId,id:crypto.randomUUID(),name:'This device'};
  try{
   const tx=db.transaction('devices','readwrite'),done=committed(tx);
   tx.objectStore('devices').add(fresh);
   await done;
  }catch{
   const winner=await result<LocalTrustedDevice|undefined>(db.transaction('devices','readonly').objectStore('devices').get(userId));
   if(winner)return winner;
   throw new Error('Could not store this device identifier.');
  }
  return fresh;
 }finally{db.close();}
}
/** Store only ciphertext and a non-exportable device-local AES CryptoKey.
 * Before writing, verify the CH1 code decrypts the CURRENT account envelope.
 * Existing browser keys cannot be exported or reconstructed from sign-in alone.
 */
export async function saveTrustedRecoveryCode(userId:string,code:string,envelope:MessageRecoveryEnvelope):Promise<void>{
 validUser(userId);
 const restored=await openMessageRecoveryIdentity(userId,code,envelope);
 const local=await storedMessageIdentity(userId);
 if(!local||!samePublicKey(local.publicKey,restored.publicKey)||!local.journalKey)
  throw new Error('The backup code does not match the encryption key on this device.');
 const device=await localTrustedDevice(userId);
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']) as CryptoKey;
 const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=encoder.encode(code);
 let ct:string;
 try{ct=encoded(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associated(userId,device.id,envelope.publicKey)},key,bytes)));}
 finally{bytes.fill(0);}
 const db=await openDb();
 try{
  const tx=db.transaction('devices','readwrite'),done=committed(tx);
  const store=tx.objectStore('devices');
  const current=await result<LocalTrustedDevice|undefined>(store.get(userId));
  if(!current||current.id!==device.id)throw new Error('Trusted-device information changed during backup.');
  store.put({...current,recoveryPublicKey:envelope.publicKey,recoveryKey:key,iv:encoded(iv),ct});
  await done;
 }finally{db.close();}
}
export async function readTrustedRecoveryCode(userId:string,currentPublic:PublicKey):Promise<string|null>{
 const device=await localTrustedDevice(userId);
 if(!device.recoveryKey||!device.ct||!device.iv||!device.recoveryPublicKey)return null;
 if(!samePublicKey(currentPublic,device.recoveryPublicKey))return null;
 try{
  const clear=new Uint8Array(await crypto.subtle.decrypt(
   {name:'AES-GCM',iv:decoded(device.iv),additionalData:associated(userId,device.id,device.recoveryPublicKey)},
   device.recoveryKey,decoded(device.ct)));
  try{
   const code=new TextDecoder().decode(clear);
   return /^CH1-[A-Za-z0-9_-]{43}$/.test(code)?code:null;
  }finally{clear.fill(0);}
 }catch{return null;}
}
export async function savePendingTransfer(userId:string,id:string,pair:TransferKeyPair):Promise<void>{
 validUser(userId);
 if(!/^[0-9a-f-]{36}$/i.test(id)||pair.privateKey.extractable)throw new Error('Invalid device-approval request.');
 const db=await openDb();
 try{
  const existing=await result<PendingDeviceTransfer|undefined>(db.transaction('pending','readonly').objectStore('pending').get(userId));
  if(existing&&existing.id!==id)throw new Error('Another device approval is in progress. Cancel it first.');
  const tx=db.transaction('pending','readwrite'),done=committed(tx);
  tx.objectStore('pending').put({userId,id,privateKey:pair.privateKey,publicKey:pair.publicKey,createdAt:Date.now()});
  await done;
 }finally{db.close();}
}
export async function pendingTransfer(userId:string):Promise<PendingDeviceTransfer|null>{
 validUser(userId);
 const db=await openDb();
 try{return await result<PendingDeviceTransfer|undefined>(db.transaction('pending','readonly').objectStore('pending').get(userId))??null;}
 finally{db.close();}
}
export async function discardPendingTransfer(userId:string):Promise<void>{
 validUser(userId);
 const db=await openDb();
 try{
  const tx=db.transaction('pending','readwrite'),done=committed(tx);
  tx.objectStore('pending').delete(userId);
  await done;
 }finally{db.close();}
}
