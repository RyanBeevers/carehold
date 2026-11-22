import type {CareEnv,SessionUser} from './types';
import {notifyPrivateRecipients} from './words-spaces';
import {exactParticipants,matchesKeyRoster,mayStartDirectMessage,pairKey,validPublicJwk,validSealedEnvelope} from './messages-policy';
import {validStoredRecoveryEnvelope} from './message-recovery-policy';
/** Fictional text only: TOFU public key registry, not reviewed E2EE.
 * Fresh-account recovery wraps a stable account key; legacy keys stay intact.
 * Staged key migration and ciphertext-only journal sync are experimental.
 * Independent per-device cryptographic revocation is not supported.
 * API never receives plaintext or recovery codes. No read receipts. */
const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
class MessageError extends Error{constructor(public status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new MessageError(status,message);}
function required(v:unknown,max=140){if(typeof v!=='string'||!v||v.length>max)fail(400,'Missing or invalid field.');return v as string;}
async function read(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();if(raw.length>15000)fail(413,'Message request too large.');
 let data:unknown;try{data=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Invalid JSON object.');
 return data as Record<string,unknown>;
}
type Role='owner'|'caregiver'|'member';
async function membership(db:D1Database,hid:string,uid:string):Promise<Role>{
 const row=await db.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?').bind(hid,uid).first<{role:Role}>();
 if(!row)fail(403,'Household membership required.');return row!.role;
}
async function accessibleThread(db:D1Database,id:string,uid:string){
 const row=await db.prepare(`SELECT t.id,t.household_id FROM direct_threads t
 JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?
 JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=?
 WHERE t.id=?`).bind(uid,uid,id).first<{id:string,household_id:string}>();
 if(!row)fail(404,'Conversation unavailable.');return row!;
}
async function people(db:D1Database,id:string){
 const x=await db.prepare(`SELECT u.id,u.name,k.public_jwk FROM direct_thread_members tm
 JOIN user u ON u.id=tm.user_id LEFT JOIN message_device_keys k ON k.user_id=u.id
 WHERE tm.thread_id=? ORDER BY u.id`).bind(id).all<{id:string,name:string,public_jwk:string|null}>();
 return (x.results||[]).map(r=>({id:r.id,name:r.name,publicKey:r.public_jwk?JSON.parse(r.public_jwk) as JsonWebKey:null}));
}
async function hash(value:string){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
}
async function route(req:Request,env:CareEnv,user:SessionUser,ctx:ExecutionContext){
 const db=env.DB,url=new URL(req.url),path=url.pathname;
 if(path==='/api/messages/keys/me'){
  if(req.method==='GET'){
   const r=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?').bind(user.id).first<{public_jwk:string}>();
   return respond({publicKey:r?JSON.parse(r.public_jwk):null});
  }
  if(req.method==='POST'){
   const b=await read(req);if(!validPublicJwk(b.publicKey))fail(400,'Invalid device key.');
   const encoded=JSON.stringify(b.publicKey);
   await db.prepare('INSERT OR IGNORE INTO message_device_keys(user_id,public_jwk,created_at) VALUES(?,?,?)')
    .bind(user.id,encoded,new Date().toISOString()).run();
   const r=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?').bind(user.id).first<{public_jwk:string}>();
   if(r?.public_jwk!==encoded)fail(409,'This account has another message device. Recovery is not available; do not clear browser data.');
   return respond({registered:true});
  }
 }
 if(path==='/api/messages/recovery'){
  if(req.method==='GET'){
   const row=await db.prepare('SELECT envelope_json,public_jwk FROM message_account_recovery WHERE user_id=?')
    .bind(user.id).first<{envelope_json:string,public_jwk:string}>();
   return respond({configured:!!row,envelope:row?JSON.parse(row.envelope_json):null});
  }
  if(req.method==='POST'){
   const b=await read(req);
   if(!validStoredRecoveryEnvelope(b.envelope))fail(400,'Invalid recovery ciphertext.');
   const payload=b.envelope,encoded=JSON.stringify(payload.publicKey);
   // Never replace a legacy key or silently rotate an account's identity.
   const existing=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?')
    .bind(user.id).first<{public_jwk:string}>();
   if(existing)fail(409,'This account already has an encryption identity. Legacy migration requires its original key; no keys were changed.');
   const wrapped=JSON.stringify(payload),now=new Date().toISOString();
   try{
    await db.batch([
     db.prepare('INSERT INTO message_device_keys(user_id,public_jwk,created_at) VALUES(?,?,?)')
      .bind(user.id,encoded,now),
     db.prepare('INSERT INTO message_account_recovery(user_id,public_jwk,envelope_json,created_at) VALUES(?,?,?,?)')
      .bind(user.id,encoded,wrapped,now)
    ]);
   }catch{
    fail(409,'Another enrollment was completed or the recovery database is unavailable. Reload and verify keys before proceeding.');
   }
   return respond({configured:true,publicKey:payload.publicKey},201);
  }
 }
 if(path==='/api/messages/contacts'&&req.method==='GET'){
  const hid=required(url.searchParams.get('householdId')),role=await membership(db,hid,user.id);
  const rows=await db.prepare(`SELECT u.id,u.name,k.public_jwk FROM household_members m
   JOIN user u ON u.id=m.user_id LEFT JOIN message_device_keys k ON k.user_id=u.id
   WHERE m.household_id=? AND m.user_id<>? AND (?='owner' OR m.role='owner')
   AND NOT EXISTS(SELECT 1 FROM profiles archived WHERE archived.household_id=m.household_id
     AND archived.linked_user_id=m.user_id AND archived.archived_at IS NOT NULL)
   ORDER BY u.name LIMIT 50`).bind(hid,user.id,role).all<{id:string,name:string,public_jwk:string|null}>();
  return respond({contacts:(rows.results||[]).map(r=>({id:r.id,name:r.name,publicKey:r.public_jwk?JSON.parse(r.public_jwk):null}))});
 }
 if(path==='/api/messages/conversations'&&req.method==='GET'){
  const hid=required(url.searchParams.get('householdId'));await membership(db,hid,user.id);
  const rows=await db.prepare(`SELECT t.id,t.created_at FROM direct_threads t
   JOIN direct_thread_members m ON m.thread_id=t.id AND m.user_id=?
   WHERE t.household_id=? ORDER BY t.created_at DESC LIMIT 100`).bind(user.id,hid).all<{id:string,created_at:string}>();
  const conversations=[];
  for(const r of rows.results||[]){
   const participants=await people(db,r.id);
   if(participants.length!==2)continue;
   const active=await db.prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id=? AND user_id IN (?,?)')
    .bind(hid,participants[0].id,participants[1].id).first<{n:number}>();
   if(active?.n===2)conversations.push({id:r.id,createdAt:r.created_at,participants});
  }
  return respond({conversations});
 }
 if(path==='/api/messages/conversations'&&req.method==='POST'){
  const b=await read(req),hid=required(b.householdId),to=required(b.recipientId),role=await membership(db,hid,user.id);
  if(to===user.id)fail(400,'Select another account.');
  const other=await membership(db,hid,to);
  if(!mayStartDirectMessage(role,other))fail(403,'This recipient is not available to start a conversation.');
  const archived=await db.prepare('SELECT COUNT(*) n FROM profiles WHERE household_id=? AND archived_at IS NOT NULL AND linked_user_id IN (?,?)')
   .bind(hid,user.id,to).first<{n:number}>();
  if(archived?.n)fail(409,'An archived linked profile prevents starting a new conversation. Existing history remains readable.');
  const keys=await db.prepare('SELECT COUNT(*) AS n FROM message_device_keys WHERE user_id IN (?,?)')
   .bind(user.id,to).first<{n:number}>();
  if(keys?.n!==2)fail(409,'Both accounts must open Messages on their own devices first.');
  const id=crypto.randomUUID(),ts=new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO direct_threads(id,household_id,pair_key,created_by,created_at) VALUES(?,?,?,?,?)')
   .bind(id,hid,pairKey(user.id,to),user.id,ts).run();
  const row=await db.prepare('SELECT id FROM direct_threads WHERE household_id=? AND pair_key=?')
   .bind(hid,pairKey(user.id,to)).first<{id:string}>();
  if(!row)fail(500,'Could not create conversation.');
  await db.batch([user.id,to].map(uid=>db.prepare('INSERT OR IGNORE INTO direct_thread_members(thread_id,user_id,joined_at) VALUES(?,?,?)')
   .bind(row!.id,uid,ts)));
  return respond({id:row.id,participants:await people(db,row.id)},201);
 }
 const match=path.match(/^\/api\/messages\/threads\/([0-9a-f-]{36})$/i);
 if(match){
  const id=match[1],thread=await accessibleThread(db,id,user.id),participants=await people(db,id);
  if(participants.length!==2)fail(409,'Conversation participants are invalid.');
  for(const p of participants)await membership(db,thread.household_id,p.id);
  if(req.method==='GET'){
   const rows=await db.prepare(`SELECT m.id,m.sender_id,m.created_at,COALESCE(rc.envelope_json,mc.envelope_json,c.envelope_json) envelope_json FROM encrypted_messages m
    JOIN encrypted_message_copies c ON c.message_id=m.id AND c.recipient_id=?
    LEFT JOIN account_migrated_copies mc ON mc.source_kind='direct' AND mc.source_id=m.id AND mc.user_id=c.recipient_id AND EXISTS(SELECT 1 FROM account_key_migrations mig WHERE mig.user_id=c.recipient_id AND mig.state='complete')
    LEFT JOIN account_recovery_rotation_copies rc ON rc.source_kind='direct' AND rc.source_id=m.id
     AND rc.rotation_id=(SELECT rotation_id FROM account_recovery_rotations WHERE user_id=c.recipient_id AND state='complete' ORDER BY completed_at DESC,rowid DESC LIMIT 1)
    WHERE m.thread_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 100`)
    .bind(user.id,id).all<{id:string,sender_id:string,created_at:string,envelope_json:string}>();
   return respond({messages:(rows.results||[]).reverse().map(r=>({id:r.id,senderId:r.sender_id,createdAt:r.created_at,envelope:JSON.parse(r.envelope_json)}))});
  }
  if(req.method==='POST'){
   const migrating=await db.prepare("SELECT 1 FROM account_key_migrations WHERE state='staged' AND user_id IN (?,?) LIMIT 1")
    .bind(participants[0].id,participants[1].id).first();
   if(migrating)fail(409,'A participant is upgrading encryption. Retry after migration.');
   const b=await read(req),msgId=required(b.id,36);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msgId))
    fail(400,'Invalid message identifier.');
   if(!b.copies||typeof b.copies!=='object'||Array.isArray(b.copies))fail(400,'Missing encrypted copies.');
   if(!matchesKeyRoster(b.publicKeys,participants))
    fail(409,'A participant encryption key changed. Refresh recipients and re-encrypt before sending.');
   const copies=b.copies as Record<string,unknown>,ids=participants.map(p=>p.id);
   if(!exactParticipants(Object.keys(copies),ids)||!ids.every(uid=>validSealedEnvelope(copies[uid])))
    fail(400,'Exactly two valid participant ciphertext copies required.');
   const digest=await hash(id+':'+user.id+':'+JSON.stringify(ids.sort().map(uid=>[uid,copies[uid]])));
   const recipient=ids.find(uid=>uid!==user.id)!;
   const existing=await db.prepare('SELECT thread_id,sender_id,body_hash FROM encrypted_messages WHERE id=?')
    .bind(msgId).first<{thread_id:string,sender_id:string,body_hash:string}>();
   if(existing){
    if(existing.thread_id!==id||existing.sender_id!==user.id||existing.body_hash!==digest)
     fail(409,'Message identifier belongs to another submission.');
    return respond({id:msgId,accepted:true,replayed:true});
   }
   try{
    const ts=new Date().toISOString();
    await db.batch([
     db.prepare('INSERT INTO encrypted_messages(id,thread_id,sender_id,body_hash,created_at) VALUES(?,?,?,?,?)')
      .bind(msgId,id,user.id,digest,ts),
     ...ids.map(uid=>db.prepare('INSERT INTO encrypted_message_copies(message_id,recipient_id,envelope_json) VALUES(?,?,?)')
      .bind(msgId,uid,JSON.stringify(copies[uid]))),
     db.prepare("INSERT INTO private_word_activity(id,user_id,household_id,source_kind,source_id,event_kind,created_at) VALUES(?,?,?,'direct',?,'message',?)")
      .bind(crypto.randomUUID(),recipient,thread.household_id,id,ts)
    ]);
   }catch{
    const replay=await db.prepare('SELECT thread_id,sender_id,body_hash FROM encrypted_messages WHERE id=?')
     .bind(msgId).first<{thread_id:string,sender_id:string,body_hash:string}>();
    if(replay?.thread_id!==id||replay?.sender_id!==user.id||replay?.body_hash!==digest)
      fail(409,'Encrypted message not accepted.');
   }
   notifyPrivateRecipients(env,ctx,thread.household_id,[recipient]);
   return respond({id:msgId,accepted:true},201);
  }
 }
 fail(404,'Messaging route not found.');
}
export async function handleMessages(req:Request,env:CareEnv,user:SessionUser,ctx:ExecutionContext):Promise<Response>{
 try{return await route(req,env,user,ctx);}catch(e){if(e instanceof MessageError)return respond({error:e.message},e.status);throw e;}
}
