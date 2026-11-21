/**
 * Device-only encrypted journal shelf for fictional pilot content.
 * Nonexportable AES-GCM CryptoKey and ciphertext live on the SAME origin,
 * not reviewed E2EE, not synced or recoverable after clearing browser data.
 */
export type JournalEntry={id:string,prompt:string|null,text:string,createdAt:number,updatedAt:number,revision:number};
export type JournalDraft=Pick<JournalEntry,'id'|'text'|'prompt'>;
export class JournalConflict extends Error{
 constructor(){super('Another tab updated this journal entry. Reopen it before overwriting.');}
}
const NAME='carehold-journal-shelf-v1';
const enc=new TextEncoder(),dec=new TextDecoder();
type KeyRow={scope:string,key:CryptoKey};
type CipherRow={key:string,scope:string,id:string,iv:number[],ciphertext:ArrayBuffer,createdAt:number,updatedAt:number,revision:number};
const scopeFor=(user:string,household:string)=>{
 if(!user||!household||user.length>200||household.length>200)throw new Error('Sign in to a care circle first.');
 return 'v1:'+user+':'+household;
};
function open():Promise<IDBDatabase>{
 if(!('indexedDB' in globalThis)||!crypto.subtle)throw new Error('Encrypted journal storage is not available.');
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(NAME,1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains('keys'))req.result.createObjectStore('keys',{keyPath:'scope'});
   if(!req.result.objectStoreNames.contains('entries')){
    const entries=req.result.createObjectStore('entries',{keyPath:'key'});
    entries.createIndex('scope','scope',{unique:false});
   }
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error??new Error('Could not open the local journal.'));
  req.onblocked=()=>reject(new Error('Another tab is blocking journal storage.'));
 });
}
function request<T>(r:IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error??new Error('Journal storage request failed.'));
 });
}
function settled(tx:IDBTransaction):Promise<void>{
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error??new Error('Journal transaction failed.'));
  tx.onabort=()=>reject(tx.error??new Error('Journal transaction cancelled.'));
 });
}
async function keyRow(db:IDBDatabase,scope:string):Promise<KeyRow|undefined>{
 const tx=db.transaction('keys','readonly'),done=settled(tx);
 const result=await request(tx.objectStore('keys').get(scope)) as KeyRow|undefined;
 await done;
 return result;
}
async function keyFor(db:IDBDatabase,scope:string,create:boolean):Promise<CryptoKey|undefined>{
 const existing=await keyRow(db,scope);
 if(existing)return existing.key;
 if(!create)return undefined;
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const tx=db.transaction('keys','readwrite'),done=settled(tx);
 try{
  await Promise.all([request(tx.objectStore('keys').add({scope,key} satisfies KeyRow)),done]);
  return key;
 }catch(e){
  if((e as DOMException).name==='ConstraintError'){
   const concurrent=await keyRow(db,scope);if(concurrent)return concurrent.key;
  }
  throw e;
 }
}
const aad=(scope:string,id:string)=>enc.encode('carehold-journal-shelf-v1:'+scope+':'+id);
async function decrypt(row:CipherRow,key:CryptoKey,scope:string):Promise<JournalEntry>{
 if(row.scope!==scope||row.iv.length!==12)throw new Error('Invalid local journal record.');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(row.iv),additionalData:aad(scope,row.id)},key,row.ciphertext);
 const parsed:unknown=JSON.parse(dec.decode(plain));
 if(!parsed||typeof parsed!=='object')throw new Error('Invalid journal entry.');
 const value=parsed as {text?:unknown,prompt?:unknown};
 if(typeof value.text!=='string'||value.text.length>3000||!(value.prompt===null||typeof value.prompt==='string'))throw new Error('Invalid decrypted journal.');
 return {id:row.id,text:value.text,prompt:value.prompt as string|null,createdAt:row.createdAt,updatedAt:row.updatedAt,revision:row.revision};
}
export async function listPrivateJournal(userId:string,householdId:string):Promise<JournalEntry[]>{
 const scope=scopeFor(userId,householdId),db=await open();
 try{
  const key=await keyFor(db,scope,false);
  if(!key)return [];
  const tx=db.transaction('entries','readonly'),done=settled(tx);
  const rows=await request(tx.objectStore('entries').index('scope').getAll(IDBKeyRange.only(scope))) as CipherRow[];
  await done;
  const items=await Promise.all(rows.map(row=>decrypt(row,key,scope)));
  return items.sort((a,b)=>b.updatedAt-a.updatedAt);
 }finally{db.close();}
}
export async function savePrivateJournal(userId:string,householdId:string,entry:JournalDraft,revision=0):Promise<JournalEntry>{
 const scope=scopeFor(userId,householdId);
 if(!/^[0-9a-f-]{36}$/i.test(entry.id)||!entry.text.trim()||entry.text.length>3000||
   (entry.prompt!==null&&(typeof entry.prompt!=='string'||entry.prompt.length>600)))
  throw new Error('Write a journal entry of up to 3,000 characters.');
 const db=await open();
 try{
  const cryptoKey=await keyFor(db,scope,true);
  if(!cryptoKey)throw new Error('Cannot create journal encryption key.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(scope,entry.id)},
   cryptoKey,enc.encode(JSON.stringify({text:entry.text,prompt:entry.prompt})));
  const rowKey=scope+':'+entry.id;
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries');
   const get=store.get(rowKey);
   let conflict=false,next:JournalEntry|null=null;
   get.onsuccess=()=>{
    const previous=get.result as CipherRow|undefined;
    if((previous?.revision??0)!==revision){conflict=true;tx.abort();return;}
    const time=Date.now();
    next={...entry,createdAt:previous?.createdAt??time,updatedAt:time,revision:revision+1};
    store.put({key:rowKey,scope,id:entry.id,iv:[...iv],ciphertext:cipher,
     createdAt:next.createdAt,updatedAt:time,revision:revision+1} satisfies CipherRow);
   };
   tx.oncomplete=()=>resolve(next!);
   tx.onerror=()=>reject(tx.error??new Error('Could not save journal entry.'));
   tx.onabort=()=>reject(conflict?new JournalConflict():tx.error??new Error('Journal save cancelled.'));
  });
 }finally{db.close();}
}
export async function deletePrivateJournal(userId:string,householdId:string,entryId:string):Promise<void>{
 if(!/^[0-9a-f-]{36}$/i.test(entryId))throw new Error('Invalid entry.');
 const scope=scopeFor(userId,householdId),db=await open();
 try{
  const tx=db.transaction('entries','readwrite'),done=settled(tx);
  await Promise.all([request(tx.objectStore('entries').delete(scope+':'+entryId)),done]);
 }finally{db.close();}
}
