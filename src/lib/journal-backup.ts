import type {JournalDraft,JournalEntry} from './private-journal';

/**
 * Manual, passphrase-encrypted transfer for a private journal shelf.
 * No server calls. This restores ONLY saved private journal entries;
 * shared-space decryption keys and medication data are not included.
 */
const VERSION=1;
const KIND='carehold.private-journal.backup';
const ITERATIONS=400000;
const MAX_ENTRIES=1500;
const MAX_CIPHERTEXT_LENGTH=9_000_000;
const MAX_JSON_LENGTH=6_000_000;
const aad=new TextEncoder().encode('carehold:private-journal:backup:v1');
const encoder=new TextEncoder(),decoder=new TextDecoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function b64(bytes:Uint8Array){
 let value='';
 for(const b of bytes)value+=String.fromCharCode(b);
 return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(value:unknown,expectedLength?:number){
 if(typeof value!=='string'||value.length>MAX_CIPHERTEXT_LENGTH||!(/^[A-Za-z0-9_-]+$/).test(value))throw new Error('Invalid backup format.');
 const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(expectedLength!==undefined&&bytes.length!==expectedLength)throw new Error('Invalid backup format.');
 return bytes;
}
function validatePassphrase(passphrase:string){
 if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)
  throw new Error('Use a backup passphrase of at least 12 characters.');
}
async function key(passphrase:string,salt:Uint8Array<ArrayBuffer>){
 const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey(
  {name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},
  material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
 );
}
function validateEntries(value:unknown):JournalDraft[]{
 if(!Array.isArray(value)||value.length>MAX_ENTRIES)throw new Error('Too many entries in this backup.');
 const ids=new Set<string>();
 return value.map(entry=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('Invalid journal backup entry.');
  const item=entry as Record<string,unknown>;
  if(typeof item.id!=='string'||!UUID.test(item.id)||ids.has(item.id)||
   typeof item.text!=='string'||item.text.length>3000||!item.text.trim()||
   !(item.prompt===null||typeof item.prompt==='string'&&item.prompt.length<=600))
   throw new Error('Invalid or repeated journal backup entry.');
  ids.add(item.id);
  return {id:item.id,text:item.text,prompt:item.prompt as string|null};
 });
}
export async function createEncryptedJournalBackup(
 userId:string,householdId:string,entries:readonly JournalEntry[],passphrase:string
):Promise<string>{
 validatePassphrase(passphrase);
 if(!userId||!householdId)throw new Error('Select a care circle first.');
 const payload=JSON.stringify({version:VERSION,userId,householdId,entries:validateEntries(entries)});
 if(payload.length>MAX_JSON_LENGTH)throw new Error('This journal backup exceeds the supported size.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const privateKey=await key(passphrase,salt);
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},privateKey,encoder.encode(payload));
 return JSON.stringify({kind:KIND,version:VERSION,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,
  salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))});
}
export async function openEncryptedJournalBackup(
 text:string,userId:string,householdId:string,passphrase:string
):Promise<JournalDraft[]>{
 validatePassphrase(passphrase);
 if(typeof text!=='string'||text.length>MAX_JSON_LENGTH+1_000_000)
  throw new Error('This backup file is too large.');
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{throw new Error('This file is not a Carehold journal backup.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid backup format.');
 const head=parsed as Record<string,unknown>;
 if(head.kind!==KIND||head.version!==VERSION||head.kdf!=='PBKDF2-SHA256'||head.iterations!==ITERATIONS)
  throw new Error('Unsupported journal backup format.');
 const salt=unb64(head.salt,16),iv=unb64(head.iv,12),cipher=unb64(head.ciphertext);
 const privateKey=await key(passphrase,salt);
 let contents:unknown;
 try{
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},privateKey,cipher);
  contents=JSON.parse(decoder.decode(bytes));
 }catch{throw new Error('Could not decrypt this backup. Check the passphrase and file.');}
 if(!contents||typeof contents!=='object'||Array.isArray(contents))
  throw new Error('Invalid decrypted backup.');
 const inner=contents as Record<string,unknown>;
 if(inner.version!==VERSION||inner.userId!==userId||inner.householdId!==householdId)
  throw new Error('This backup belongs to another Carehold account or care circle.');
 return validateEntries(inner.entries);
}
