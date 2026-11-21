/**
 * Fictional-data pilot, NOT reviewed E2EE. Device ECDH private key is
 * nonexportable but stored on the same browser origin as the app. The server
 * is trusted for key discovery (TOFU); multi-device/recovery is NOT supported.
 */
export type PublicKey={kty:'EC',crv:'P-256',x:string,y:string};
export type Identity={privateKey:CryptoKey,publicKey:PublicKey};
export type Content={kind:'prompt'|'message',text:string};
export type Envelope={v:1,epk:PublicKey,iv:string,salt:string,ct:string};
const enc=new TextEncoder(),dec=new TextDecoder();
const dbName='carehold-direct-message-keys-v1';
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
  const request=indexedDB.open(dbName,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('identities'))
   request.result.createObjectStore('identities',{keyPath:'userId'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error??new Error('Cannot open device key store.'));
 });
}
function requestValue<T>(request:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
type Row={userId:string,privateKey:CryptoKey,publicKey:PublicKey};
async function readIdentity(db:IDBDatabase,userId:string):Promise<Row|undefined>{
 const tx=db.transaction('identities','readonly');
 return requestValue(tx.objectStore('identities').get(userId)) as Promise<Row|undefined>;
}
export async function deviceIdentity(userId:string):Promise<Identity>{
 if(!userId||userId.length>200)throw new Error('Sign in before enrolling a message device.');
 const db=await getDb();
 try{
  const current=await readIdentity(db,userId);
  if(current)return {privateKey:current.privateKey,publicKey:current.publicKey};
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
