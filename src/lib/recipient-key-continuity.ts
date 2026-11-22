import type {PublicKey} from './message-crypto';

/**
 * Browser-local TOFU continuity guard, NOT an independently authenticated key
 * directory. Stored digests are public metadata, never keys or message text.
 * Clearing this browser's storage removes the continuity history.
 */
export type KeyContact={id:string,name:string,publicKey:PublicKey|null};
export type KeyChange={id:string,name:string,previous:string,current:string};
const PREFIX='carehold-recipient-key-continuity-v1:';
const UUID_SCOPE=/^[^\s]{1,200}$/;
const B64URL=/^[A-Za-z0-9_-]{43}$/;
function scopedKey(accountId:string,householdId:string,recipientId:string):string{
 if(![accountId,householdId,recipientId].every(x=>UUID_SCOPE.test(x)))
  throw new Error('Unable to verify encryption keys for this account.');
 return PREFIX+JSON.stringify([accountId,householdId,recipientId]);
}
function storage():Storage{
 if(typeof window==='undefined'||!window.localStorage)
  throw new Error('Device key verification storage is unavailable. Sending is blocked until storage is available.');
 try{const s=window.localStorage;s.getItem(PREFIX+'probe');return s;}
 catch{throw new Error('Device key verification storage is blocked. Sending is blocked until storage is available.');}
}
export async function fingerprintPublicKey(key:PublicKey):Promise<string>{
 if(!key||key.kty!=='EC'||key.crv!=='P-256'||!B64URL.test(key.x)||!B64URL.test(key.y))
  throw new Error('Invalid recipient encryption public key.');
 const bytes=new TextEncoder().encode(JSON.stringify(['Carehold recipient key v1','P-256',key.x,key.y]));
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function readableFingerprint(fingerprint:string):string{
 if(!/^[A-F0-9]{64}$/.test(fingerprint))throw new Error('Invalid encryption fingerprint.');
 return fingerprint.match(/.{1,8}/g)!.join(' ');
}
export class RecipientKeyChangedError extends Error{
 readonly changed:KeyChange[];
 constructor(changed:KeyChange[]){
  super('A participant\'s encryption key changed. Verify their new code with them outside Carehold before sending.');
  this.name='RecipientKeyChangedError';
  this.changed=changed;
 }
}
/** Fail closed if a previously observed recipient changes, including for group shares.
 * On first send, remember the recipient key; the user may separately compare the
 * digest face-to-face for first-use authentication.
 */
export async function checkRecipientKeyContinuity(accountId:string,householdId:string,contacts:readonly KeyContact[]):Promise<void>{
 const store=storage();
 const toPin:{key:string,fingerprint:string}[]=[];
 const changed:KeyChange[]=[];
 for(const contact of contacts){
  if(!contact.publicKey)throw new Error('The recipient has no registered encryption key.');
  const key=scopedKey(accountId,householdId,contact.id);
  const current=await fingerprintPublicKey(contact.publicKey);
  const previous=store.getItem(key);
  if(previous&&previous!==current)changed.push({id:contact.id,name:contact.name,previous,current});
  else if(!previous)toPin.push({key,fingerprint:current});
 }
 if(changed.length)throw new RecipientKeyChangedError(changed);
 for(const item of toPin){
  try{store.setItem(item.key,item.fingerprint);}
  catch{throw new Error('Cannot save the recipient key checkpoint. Sending is blocked on this device.');}
 }
}
/** Explicitly approved key rotation. Re-read the current record first so stale
 * dialog data cannot silently overwrite a newer (different) recipient key.
 */
export function acceptVerifiedRecipientKeys(accountId:string,householdId:string,changes:readonly KeyChange[]):void{
 const store=storage();
 if(!changes.length)throw new Error('No changed encryption keys to approve.');
 for(const change of changes){
  if(!/^[A-F0-9]{64}$/.test(change.current)||!/^[A-F0-9]{64}$/.test(change.previous))
   throw new Error('Invalid recipient key verification.');
  const key=scopedKey(accountId,householdId,change.id);
  if(store.getItem(key)!==change.previous)
   throw new Error('Recipient verification has changed since this screen opened. Refresh and review again.');
 }
 for(const change of changes)
  store.setItem(scopedKey(accountId,householdId,change.id),change.current);
}
