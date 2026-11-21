/**
 * Fictional-data pilot, NOT reviewed E2EE. Legacy device keys are non-exportable
 * and browser-bound; a separate explicit recovery-code flow now exists for
 * NEW accounts. This module preserves legacy keys on all enrollment paths.
 * Public key discovery remains unverified TOFU. The staged original-browser
 * migration is experimental. Per-device crypto revocation is NOT supported.
 */
export type PublicKey={kty:'EC',crv:'P-256',x:string,y:string};
export type Identity={privateKey:CryptoKey,publicKey:PublicKey,journalKey?:CryptoKey};
export type Content={kind:'prompt'|'message',text:string};
export type Envelope={v:1,epk:PublicKey,iv:string,salt:string,ct:string};
const enc=new TextEncoder(),dec=new TextDecoder();
import type {MessageRecoveryEnvelope} from './message-recovery.ts';
const dbName='carehold-direct-message-keys-v1';
export type RecoverySetupFlow='fresh'|'legacy';
type PendingRecovery={scope:string,createdAt:number,envelope:MessageRecoveryEnvelope};
function committed(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error??new Error('Encrypted recovery setup could not be saved.'));
  tx.onabort=()=>reject(tx.error??new Error('Encrypted recovery setup was interrupted.'));
 });
}
const pendingScope=(userId:string,flow:RecoverySetupFlow)=>{
 if(!userId||userId.length>200||!['fresh','legacy'].includes(flow))throw new Error('Sign in to preserve encrypted setup.');
 return flow+':'+userId;
};
const algorithm={name:'ECDH',namedCurve:'P-256'} as const;
function clean(jwk:JsonWebKey):PublicKey{
 if(jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.x||!jwk.y)throw new Error('Unsupported public key.');
 return {kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
}
export function samePublicKey(a:PublicKey,b:PublicKey):boolean{
 return a.kty===b.kty&&a.crv===b.crv&&a.x===b.x&&a.y===b.y;
}
function b64(value:Uint8Array):string{
 let raw='';for(const byte of value)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(value:string):Uint8Array<ArrayBuffer>{
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encrypted data.');
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function getDb():Promise<IDBDatabase>{
 if(!('indexedDB' in globalThis)||!crypto.subtle)throw new Error('This browser cannot store encrypted message keys.');
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(dbName,3);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains('identities'))
    request.result.createObjectStore('identities',{keyPath:'userId'});
   // Never replace the old non-extractable private key during recovery.
   if(!request.result.objectStoreNames.contains('recoveredIdentities'))
    request.result.createObjectStore('recoveredIdentities',{keyPath:'userId'});
   if(!request.result.objectStoreNames.contains('pendingRecoveries'))
    request.result.createObjectStore('pendingRecoveries',{keyPath:'scope'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('Cannot open device key store.'));
 });
}
function requestValue<T>(request:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
type Row={userId:string,privateKey:CryptoKey,publicKey:PublicKey,journalKey?:CryptoKey};
async function readIdentity(db:IDBDatabase,userId:string):Promise<Row|undefined>{
 const tx=db.transaction('identities','readonly');
 return requestValue(tx.objectStore('identities').get(userId)) as Promise<Row|undefined>;
}
async function readRecovered(db:IDBDatabase,userId:string):Promise<Row|undefined>{
 const tx=db.transaction('recoveredIdentities','readonly');
 return requestValue(tx.objectStore('recoveredIdentities').get(userId)) as Promise<Row|undefined>;
}

/** Holds only a *wrapped* enrollment envelope, never the CH1 recovery secret.
 * Keeps a setup attempt resumable after iOS Safari/PWA background locking. */
export async function storedPendingRecoveryEnvelope(userId:string,flow:RecoverySetupFlow):Promise<MessageRecoveryEnvelope|null>{
 const scope=pendingScope(userId,flow),db=await getDb();
 try{
  const row=await requestValue<PendingRecovery|undefined>(db.transaction('pendingRecoveries','readonly').objectStore('pendingRecoveries').get(scope));
  if(!row)return null;
  if(row.scope!==scope||row.envelope?.v!==2)throw new Error('An incompatible pending recovery setup exists. No data was erased.');
  return row.envelope;
 }finally{db.close();}
}
export async function storePendingRecoveryEnvelope(userId:string,flow:RecoverySetupFlow,envelope:MessageRecoveryEnvelope):Promise<void>{
 const scope=pendingScope(userId,flow);
 const expected='alg,ct,iv,kdf,publicKey,salt,v';
 if(envelope?.v!==2||Object.keys(envelope).sort().join(',')!==expected||JSON.stringify(envelope).length>5000)
  throw new Error('Refusing to store unexpected recovery setup data.');
 const db=await getDb();
 try{
  const existing=await requestValue<PendingRecovery|undefined>(db.transaction('pendingRecoveries','readonly').objectStore('pendingRecoveries').get(scope));
  if(existing){
   if(JSON.stringify(existing.envelope)===JSON.stringify(envelope))return;
   throw new Error('An unfinished recovery enrollment already exists. Resume or discard it before generating a new key.');
  }
  try{
   const tx=db.transaction('pendingRecoveries','readwrite'),done=committed(tx);
   await Promise.all([requestValue(tx.objectStore('pendingRecoveries').add({
    scope,createdAt:Date.now(),envelope
   } satisfies PendingRecovery)),done]);
  }catch(e){
   const competing=await requestValue<PendingRecovery|undefined>(db.transaction('pendingRecoveries','readonly').objectStore('pendingRecoveries').get(scope));
   if(competing&&JSON.stringify(competing.envelope)===JSON.stringify(envelope))return;
   throw e;
  }
 }finally{db.close();}
}
export async function clearPendingRecoveryEnvelope(userId:string,flow:RecoverySetupFlow):Promise<void>{
 const scope=pendingScope(userId,flow),db=await getDb();
 try{
  const tx=db.transaction('pendingRecoveries','readwrite'),done=committed(tx);
  await Promise.all([requestValue(tx.objectStore('pendingRecoveries').delete(scope)),done]);
 }finally{db.close();}
}

/** Read legacy identity even after a v2 key is installed, for safe verification. */
export async function storedLegacyMessageIdentity(userId:string):Promise<Identity|null>{
 if(!userId||userId.length>200)throw new Error('Sign in before accessing encrypted data.');
 const db=await getDb();
 try{
  const row=await readIdentity(db,userId);
  return row?{privateKey:row.privateKey,publicKey:row.publicKey}:null;
 }finally{db.close();}
}
/** Read without generating a new key; critical when opening an account on a new device. */
export async function storedMessageIdentity(userId:string):Promise<Identity|null>{
 if(!userId||userId.length>200)throw new Error('Sign in before using encrypted messages.');
 const db=await getDb();
 try{
  const row=(await readRecovered(db,userId))??(await readIdentity(db,userId));
  return row?{privateKey:row.privateKey,publicKey:row.publicKey,journalKey:row.journalKey}:null;
 }finally{db.close();}
}
/** Add an explicitly recovered key without deleting or overwriting a legacy key. */
export async function storeRecoveredMessageIdentity(userId:string,identity:Identity):Promise<void>{
 if(!userId||userId.length>200||identity.privateKey.extractable)
  throw new Error('Refusing to store an extractable or unscoped private key.');
 const db=await getDb();
 try{
  const existing=await readRecovered(db,userId);
  if(existing){
   if(!samePublicKey(existing.publicKey,identity.publicKey)||Boolean(existing.journalKey)!==Boolean(identity.journalKey))
    throw new Error('A different or incomplete recovered identity is already enrolled on this browser.');
   return;
  }
  try{
   const tx=db.transaction('recoveredIdentities','readwrite');
   await requestValue(tx.objectStore('recoveredIdentities').add({userId,...identity}));
  }catch(e){
   const concurrent=await readRecovered(db,userId);
   if(concurrent&&samePublicKey(concurrent.publicKey,identity.publicKey)&&Boolean(concurrent.journalKey)===Boolean(identity.journalKey))return;
   throw e;
  }
 }finally{db.close();}
}
export async function deviceIdentity(userId:string):Promise<Identity>{
 if(!userId||userId.length>200)throw new Error('Sign in before enrolling a message device.');
 const db=await getDb();
 try{
  const current=(await readRecovered(db,userId))??(await readIdentity(db,userId));
  if(current)return {privateKey:current.privateKey,publicKey:current.publicKey,journalKey:current.journalKey};
  const keys=await crypto.subtle.generateKey(algorithm,false,['deriveBits']) as CryptoKeyPair;
  const publicKey=clean(await crypto.subtle.exportKey('jwk',keys.publicKey));
  try{
   const tx=db.transaction('identities','readwrite');
   await requestValue(tx.objectStore('identities').add({userId,privateKey:keys.privateKey,publicKey}));
  }catch{
   // Concurrent tabs: keep the first enrolled identity, never rotate silently.
   const other=await readIdentity(db,userId);if(other)return {privateKey:other.privateKey,publicKey:other.publicKey};
   throw new Error('Could not safely store the message device key.');
  }
  return {privateKey:keys.privateKey,publicKey};
 }finally{db.close();}
}
async function derive(privateKey:CryptoKey,other:PublicKey,salt:Uint8Array<ArrayBuffer>,info:Uint8Array<ArrayBuffer>){
 const peer=await crypto.subtle.importKey('jwk',other,algorithm,false,[]);
 const bits=await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256);
 const material=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function context(threadId:string,messageId:string,recipientId:string){
 return enc.encode('carehold-message-v1:'+threadId+':'+messageId+':'+recipientId);
}
export async function seal(content:Content,publicKey:PublicKey,threadId:string,messageId:string,recipientId:string):Promise<Envelope>{
 if(content.text.length<1||content.text.length>3000||!['prompt','message'].includes(content.kind))throw new Error('Message must contain 1–3,000 characters.');
 const ephemeral=await crypto.subtle.generateKey(algorithm,false,['deriveBits']) as CryptoKeyPair;
 const epk=clean(await crypto.subtle.exportKey('jwk',ephemeral.publicKey));
 const iv=crypto.getRandomValues(new Uint8Array(12)),salt=crypto.getRandomValues(new Uint8Array(16));
 const info=context(threadId,messageId,recipientId);
 const key=await derive(ephemeral.privateKey,publicKey,salt,info);
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:info},key,enc.encode(JSON.stringify(content)));
 return {v:1,epk,iv:b64(iv),salt:b64(salt),ct:b64(new Uint8Array(bytes))};
}
export async function unseal(envelope:Envelope,privateKey:CryptoKey,threadId:string,messageId:string,recipientId:string):Promise<Content>{
 if(envelope.v!==1)throw new Error('Unsupported message format.');
 const info=context(threadId,messageId,recipientId);
 const salt=unb64(envelope.salt),iv=unb64(envelope.iv);
 if(salt.length!==16||iv.length!==12)throw new Error('Invalid message envelope.');
 const key=await derive(privateKey,envelope.epk,salt,info);
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:info},key,unb64(envelope.ct));
 const parsed:unknown=JSON.parse(dec.decode(bytes));
 if(!parsed||typeof parsed!=='object')throw new Error('Invalid decrypted message.');
 const value=parsed as Partial<Content>;
 if((value.kind!=='prompt'&&value.kind!=='message')||typeof value.text!=='string'||value.text.length>3000)throw new Error('Invalid decrypted content.');
 return value as Content;
}
