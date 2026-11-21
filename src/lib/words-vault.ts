/**
 * EXPERIMENTAL device-local encrypted draft vault.
 *
 * This is NOT E2EE and not an independently reviewed privacy solution:
 * non-exportable AES CryptoKeys are persisted by this same-origin IndexedDB,
 * and can be invoked by scripts running on this origin. No device recovery,
 * cross-device sync, or shared messaging is implemented. Fictional test text
 * only until the separate key-management and minors/consent gates are met.
 */
export const WORDS_VAULT_DB='carehold-words-local-v1';
export const WORDS_VAULT_VERSION=1;
export const WORDS_RETENTION_MS=90*24*60*60*1000;
const MAX_DRAFT_LENGTH=3000;
const MAX_PROMPT_LENGTH=600;

export type DraftDocument={text:string,prompt:string|null};
export type VaultStatus={enabled:boolean,document:DraftDocument|null,revision:number,savedAt:number|null};
export type CipherEnvelope={version:1,iv:number[],ciphertext:ArrayBuffer};
type VaultKeyRow={scope:string,key:CryptoKey};
type VaultDraftRow=CipherEnvelope&{scope:string,revision:number,savedAt:number};

export class DraftConflictError extends Error {
 constructor(){super('Another tab saved a newer draft. Your unsaved writing is still on this screen.');this.name='DraftConflictError';}
}
function scopeFor(userId:string,householdId:string):string{
 if(!userId||!householdId||userId.length>200||householdId.length>200)throw new Error('A signed-in account and care circle are required.');
 return 'v1:'+userId+':'+householdId;
}
function associatedData(scope:string):Uint8Array<ArrayBuffer>{
 return new TextEncoder().encode('carehold-words-draft-v1:'+scope);
}
function validDocument(value:unknown):value is DraftDocument{
 if(!value||typeof value!=='object')return false;
 const x=value as Partial<DraftDocument>;
 return typeof x.text==='string'&&x.text.length<=MAX_DRAFT_LENGTH
  &&(x.prompt===null||(typeof x.prompt==='string'&&x.prompt.length<=MAX_PROMPT_LENGTH));
}
export async function createDeviceKey():Promise<CryptoKey>{
 return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']) as Promise<CryptoKey>;
}
export async function encryptDraft(key:CryptoKey,scope:string,document:DraftDocument):Promise<CipherEnvelope>{
 if(!validDocument(document))throw new Error('Invalid draft data.');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encoded=new TextEncoder().encode(JSON.stringify(document));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associatedData(scope)},key,encoded);
 return {version:1,iv:[...iv],ciphertext};
}
export async function decryptDraft(key:CryptoKey,scope:string,envelope:CipherEnvelope):Promise<DraftDocument>{
 if(envelope.version!==1||!Array.isArray(envelope.iv)||envelope.iv.length!==12||!(envelope.ciphertext instanceof ArrayBuffer)){
  throw new Error('Encrypted draft is invalid or incompatible.');
 }
 const iv=new Uint8Array(envelope.iv);
 const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:associatedData(scope)},key,envelope.ciphertext);
 const parsed:unknown=JSON.parse(new TextDecoder().decode(plaintext));
 if(!validDocument(parsed))throw new Error('Decrypted draft format is invalid.');
 return parsed;
}
function request<T>(req:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error??new Error('IndexedDB request failed.'));
 });
}
function txFinished(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error??new Error('Local storage transaction aborted.'));
  tx.onerror=()=>reject(tx.error??new Error('Local storage transaction failed.'));
 });
}
function openVault():Promise<IDBDatabase>{
 if(!('indexedDB' in globalThis)||!crypto?.subtle)throw new Error('Encrypted local drafts are unavailable in this browser.');
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(WORDS_VAULT_DB,WORDS_VAULT_VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('keys'))db.createObjectStore('keys',{keyPath:'scope'});
   if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'scope'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error??new Error('Cannot open encrypted local draft storage.'));
  req.onblocked=()=>reject(new Error('Another Carehold tab is blocking the local draft database.'));
 });
}
async function readRow<T>(db:IDBDatabase,storeName:'keys'|'drafts',scope:string):Promise<T|undefined>{
 const tx=db.transaction(storeName,'readonly');
 const finished=txFinished(tx); // Subscribe before the transaction can complete.
 const row=await request(tx.objectStore(storeName).get(scope)) as T|undefined;
 await finished;
 return row;
}
export async function enableDeviceVault(userId:string,householdId:string):Promise<void>{
 const scope=scopeFor(userId,householdId),db=await openVault();
 try{
  if(await readRow<VaultKeyRow>(db,'keys',scope))return;
  const key=await createDeviceKey();
  const tx=db.transaction('keys','readwrite');
  // add() never overwrites a key from another tab. A concurrent create can
  // fail safely; the other tab's original key remains authoritative.
  const add=request(tx.objectStore('keys').add({scope,key} satisfies VaultKeyRow));
  const finished=txFinished(tx);
  try{await Promise.all([add,finished]);}
  catch(error){
   if((error as DOMException)?.name==='ConstraintError'){
    if(await readRow<VaultKeyRow>(db,'keys',scope))return;
   }
   throw error;
  }
 }finally{db.close();}
}
export async function inspectDeviceVault(userId:string,householdId:string):Promise<VaultStatus>{
 const scope=scopeFor(userId,householdId),db=await openVault();
 try{
  const key=await readRow<VaultKeyRow>(db,'keys',scope);
  if(!key)return {enabled:false,document:null,revision:0,savedAt:null};
  const row=await readRow<VaultDraftRow>(db,'drafts',scope);
  if(!row)return {enabled:true,document:null,revision:0,savedAt:null};
  if(Date.now()-row.savedAt>WORDS_RETENTION_MS){
   // Expiry is explicit and applies to only this account + circle.
   const tx=db.transaction('drafts','readwrite');
   const del=request(tx.objectStore('drafts').delete(scope));
   await Promise.all([del,txFinished(tx)]);
   return {enabled:true,document:null,revision:0,savedAt:null};
  }
  const document=await decryptDraft(key.key,scope,row);
  return {enabled:true,document,revision:row.revision,savedAt:row.savedAt};
 }finally{db.close();}
}
/**
 * Encrypt before opening the write transaction. Optimistic revision checking
 * and put() execute inside the same transaction to avoid silent tab clobbering.
 */
export async function saveDeviceDraft(
 userId:string,householdId:string,document:DraftDocument,expectedRevision:number,force=false
):Promise<{revision:number,savedAt:number}>{
 const scope=scopeFor(userId,householdId),db=await openVault();
 try{
  const key=await readRow<VaultKeyRow>(db,'keys',scope);
  if(!key)throw new Error('Enable encrypted local drafts first.');
  const envelope=await encryptDraft(key.key,scope,document);
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');
   const get=store.get(scope);
   let conflict=false,revision=0,savedAt=0;
   get.onsuccess=()=>{
    const current=get.result as VaultDraftRow|undefined;
    const actual=current?.revision??0;
    if(!force&&actual!==expectedRevision){conflict=true;tx.abort();return;}
    revision=actual+1;savedAt=Date.now();
    store.put({...envelope,scope,revision,savedAt} satisfies VaultDraftRow);
   };
   tx.oncomplete=()=>resolve({revision,savedAt});
   tx.onerror=()=>reject(tx.error??new Error('Failed to save encrypted draft.'));
   tx.onabort=()=>reject(conflict?new DraftConflictError():tx.error??new Error('Encrypted draft save aborted.'));
  });
 }finally{db.close();}
}
export async function discardDeviceDraft(userId:string,householdId:string):Promise<void>{
 const scope=scopeFor(userId,householdId),db=await openVault();
 try{
  const tx=db.transaction('drafts','readwrite');
  const deleted=request(tx.objectStore('drafts').delete(scope));
  await Promise.all([deleted,txFinished(tx)]);
 }finally{db.close();}
}
