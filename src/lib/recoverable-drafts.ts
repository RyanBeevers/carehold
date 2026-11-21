import {api} from './api';
import type {DraftDocument} from './words-vault';

/** Recovery-key-backed account-owned draft sync; no plaintext enters the Worker. */
const encoder=new TextEncoder(),decoder=new TextDecoder();
const b64=(bytes:Uint8Array)=>{
 let v='';for(const byte of bytes)v+=String.fromCharCode(byte);
 return btoa(v).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64=(value:string):Uint8Array<ArrayBuffer>=>{
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encrypted draft.');
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
};
function scopeFor(uid:string,scope:string,key:CryptoKey){
 if(!uid||!scope||uid.length>200||scope.length>240||key.algorithm.name!=='AES-GCM'||key.extractable)
  throw new Error('Encrypted account recovery is required for draft sync.');
 const household=scope.split(':',1)[0];
 if(!household||household.length>140)throw new Error('Choose a valid household.');
 return household;
}
const associated=(uid:string,scope:string,rev:number)=>
 encoder.encode('carehold-recoverable-draft-v1:'+uid+':'+scope+':'+rev);
async function locator(uid:string,scope:string,key:CryptoKey){
 const hid=scopeFor(uid,scope,key);
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode('carehold-draft-locator-v1:'+uid+':'+scope));
 const token=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {url:'/private-drafts/'+token+'?householdId='+encodeURIComponent(hid),hid};
}
function validate(value:unknown):value is DraftDocument{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const d=value as Record<string,unknown>;
 return Object.keys(d).every(x=>['text','prompt','title'].includes(x))&&
  typeof d.text==='string'&&d.text.length<=3000&&
  (d.prompt===null||typeof d.prompt==='string'&&d.prompt.length<=600)&&
  (d.title===undefined||typeof d.title==='string'&&d.title.length<=120);
}
export type SyncedDraft={document:DraftDocument|null,revision:number,savedAt:number|null,deleted:boolean,expired?:boolean};
export async function readSyncedDraft(uid:string,scope:string,key:CryptoKey):Promise<SyncedDraft>{
 const {url}=await locator(uid,scope,key);
 const remote=await api<{revision:number,document:{iv:string,ciphertext:string}|null,deleted:boolean,savedAt:number|null,expired?:boolean}>(url);
 if(!Number.isSafeInteger(remote.revision)||remote.revision<0)throw new Error('Invalid draft sync revision.');
 if(!remote.document)return {...remote,document:null};
 const iv=unb64(remote.document.iv),ciphertext=unb64(remote.document.ciphertext);
 if(iv.length!==12||ciphertext.length>9000)throw new Error('Invalid encrypted draft.');
 const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:associated(uid,scope,remote.revision)},key,ciphertext);
 let decoded:unknown;
 try{decoded=JSON.parse(decoder.decode(raw));}catch{throw new Error('Synced draft has invalid content.');}
 if(!validate(decoded))throw new Error('Synced draft content is invalid.');
 return {document:decoded,revision:remote.revision,savedAt:remote.savedAt,deleted:remote.deleted,expired:remote.expired};
}
export async function saveSyncedDraft(
 uid:string,scope:string,key:CryptoKey,document:DraftDocument,expectedRevision:number
):Promise<{revision:number,savedAt:number}>{
 if(!validate(document)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid draft sync request.');
 const {url}=await locator(uid,scope,key);
 const iv=crypto.getRandomValues(new Uint8Array(12)),revision=expectedRevision+1;
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:associated(uid,scope,revision)},key,encoder.encode(JSON.stringify(document)));
 const result=await api<{revision:number,savedAt:number}>(url,'PUT',{
  expectedRevision,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))
 });
 if(result.revision!==revision)throw new Error('Draft sync revision was not confirmed.');
 return result;
}
export async function deleteSyncedDraft(uid:string,scope:string,key:CryptoKey,expectedRevision:number):Promise<number>{
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid remote draft revision.');
 const {url}=await locator(uid,scope,key);
 const result=await api<{deleted:boolean,revision:number}>(url,'DELETE',{expectedRevision});
 if(!result.deleted||result.revision!==expectedRevision+(expectedRevision>0?1:0))
  throw new Error('Remote draft deletion was not confirmed.');
 return result.revision;
}
