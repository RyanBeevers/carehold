import {api} from './api.ts';
import type {JournalDraft,JournalEntry} from './private-journal';

/** Owner-only encrypted sync: backend stores ciphertext, never journal text. */
const enc=new TextEncoder(),dec=new TextDecoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CipherEntry={id:string,revision:number,iv:string,ciphertext:string,createdAt:number,updatedAt:number};
const b64=(value:Uint8Array)=>{
 let raw='';for(const byte of value)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64=(value:string):Uint8Array<ArrayBuffer>=>{
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encrypted journal.');
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),v=>v.charCodeAt(0));
};
const aad=(uid:string,hid:string,id:string,version:number)=>
 enc.encode('carehold-synced-private-journal-v1:'+uid+':'+hid+':'+id+':'+version);
function checkScope(uid:string,hid:string,key:CryptoKey){
 if(!uid||!hid||uid.length>200||hid.length>200||key.algorithm.name!=='AES-GCM'||key.extractable)
  throw new Error('Journal recovery is not configured for this account.');
}
function validate(entry:JournalDraft):void{
 if(!UUID.test(entry.id)||typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>3000||
 !(entry.prompt===null||typeof entry.prompt==='string'&&entry.prompt.length<=600)||
 !(entry.title===undefined||typeof entry.title==='string'&&entry.title.length<=120)||
 !(entry.sharedAt===undefined||entry.sharedAt===null||typeof entry.sharedAt==='number'&&Number.isFinite(entry.sharedAt)&&entry.sharedAt>=0)||
 !(entry.spaceId===undefined||entry.spaceId===null||typeof entry.spaceId==='string'&&UUID.test(entry.spaceId)))
  throw new Error('Invalid private journal entry.');
}
async function seal(uid:string,hid:string,entry:JournalDraft,revision:number,key:CryptoKey){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const message=enc.encode(JSON.stringify({
  text:entry.text,prompt:entry.prompt,title:entry.title??'',
  sharedAt:entry.sharedAt??null,spaceId:entry.spaceId??null
 }));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(uid,hid,entry.id,revision)},key,message);
 return {iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
async function unseal(uid:string,hid:string,row:CipherEntry,key:CryptoKey):Promise<JournalEntry>{
 if(!UUID.test(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1)throw new Error('Invalid journal record.');
 const iv=unb64(row.iv),ciphertext=unb64(row.ciphertext);
 if(iv.length!==12||ciphertext.length>9000)throw new Error('Invalid encrypted journal.');
 const raw=await crypto.subtle.decrypt(
  {name:'AES-GCM',iv,additionalData:aad(uid,hid,row.id,row.revision)},key,ciphertext
 );
 let payload:unknown;
 try{payload=JSON.parse(dec.decode(raw));}catch{throw new Error('Private journal ciphertext is invalid.');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid journal content.');
 const item=payload as Record<string,unknown>;
 const draft:JournalDraft={
  id:row.id,text:item.text as string,prompt:item.prompt as string|null,
  title:item.title as string|undefined,sharedAt:item.sharedAt as number|null|undefined,
  spaceId:item.spaceId as string|null|undefined
 };
 validate(draft);
 return {...draft,createdAt:row.createdAt,updatedAt:row.updatedAt,revision:row.revision};
}
export async function listSyncedPrivateJournal(uid:string,hid:string,key:CryptoKey):Promise<JournalEntry[]>{
 checkScope(uid,hid,key);
 const entries:JournalEntry[]=[];
 let offset=0,hasMore=true;
 while(hasMore){
  if(offset>10000)throw new Error('The journal contains too many entries to load safely.');
  const url='/private-journal?householdId='+encodeURIComponent(hid)+'&accountId='+encodeURIComponent(uid)+'&offset='+offset;
  const page=await api<{entries:CipherEntry[],hasMore:boolean}>(url);
  const decrypted=await Promise.all(page.entries.map(row=>unseal(uid,hid,row,key)));
  entries.push(...decrypted);
  offset+=page.entries.length;
  hasMore=page.hasMore;
  if(hasMore&&page.entries.length===0)throw new Error('Invalid journal pagination response.');
 }
 return entries.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
}
export async function saveSyncedPrivateJournal(
 uid:string,hid:string,key:CryptoKey,entry:JournalDraft,expectedRevision=0
):Promise<JournalEntry>{
 checkScope(uid,hid,key);validate(entry);
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid expected revision.');
 const sealed=await seal(uid,hid,entry,expectedRevision+1,key);
 const url='/private-journal/'+encodeURIComponent(entry.id)+'?householdId='+encodeURIComponent(hid)+'&accountId='+encodeURIComponent(uid);
 const saved=await api<{id:string,revision:number,createdAt:number,updatedAt:number}>(
  url,'PUT',{...sealed,expectedRevision}
 );
 if(saved.id!==entry.id||saved.revision!==expectedRevision+1)throw new Error('Unexpected journal save response.');
 return {...entry,revision:saved.revision,createdAt:saved.createdAt,updatedAt:saved.updatedAt};
}
export async function deleteSyncedPrivateJournal(
 uid:string,hid:string,key:CryptoKey,id:string,expectedRevision:number
):Promise<void>{
 checkScope(uid,hid,key);
 if(!UUID.test(id)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
  throw new Error('Invalid journal deletion.');
 const url='/private-journal/'+encodeURIComponent(id)+'?householdId='+encodeURIComponent(hid)+'&accountId='+encodeURIComponent(uid);
 await api(url,'DELETE',{expectedRevision});
}


/**
 * Verify an exact ciphertext-only re-encryption before a recovery key rotation
 * can stage it. Revision advances by one only on the eventual atomic commit.
 * Do not send plaintext to the Worker or discard the old ciphertext.
 */
export async function reencryptSyncedJournalEntry(
 uid:string,hid:string,row:CipherEntry,oldKey:CryptoKey,nextKey:CryptoKey
):Promise<{sourceId:string,householdId:string,expectedRevision:number,iv:string,ciphertext:string}>{
 checkScope(uid,hid,oldKey);checkScope(uid,hid,nextKey);
 const plain=await unseal(uid,hid,row,oldKey);
 const staged=await seal(uid,hid,plain,row.revision+1,nextKey);
 const verified=await unseal(uid,hid,{...row,...staged,revision:row.revision+1},nextKey);
 if(verified.text!==plain.text||verified.prompt!==plain.prompt||verified.title!==plain.title||
  verified.sharedAt!==plain.sharedAt||verified.spaceId!==plain.spaceId)
  throw new Error('Encrypted journal verification failed. No key was changed.');
 return {sourceId:row.id,householdId:hid,expectedRevision:row.revision,...staged};
}


/** Resume safety: existing staged ciphertext must decrypt to EXACTLY the old entry. */
export async function verifyStagedSyncedJournalEntry(
 uid:string,hid:string,row:CipherEntry,
 staged:{expectedRevision:number,iv:string,ciphertext:string},
 oldKey:CryptoKey,nextKey:CryptoKey
):Promise<void>{
 checkScope(uid,hid,oldKey);checkScope(uid,hid,nextKey);
 if(staged.expectedRevision!==row.revision)throw new Error('Journal changed during key replacement.');
 const before=await unseal(uid,hid,row,oldKey);
 const after=await unseal(uid,hid,{...row,iv:staged.iv,ciphertext:staged.ciphertext,revision:row.revision+1},nextKey);
 if(before.id!==after.id||before.text!==after.text||before.prompt!==after.prompt||
  before.title!==after.title||before.sharedAt!==after.sharedAt||before.spaceId!==after.spaceId)
  throw new Error('Existing staged journal ciphertext differs from the original. No key was changed.');
}
