import type {CareEnv,SessionUser} from './types';
import {validStoredRecoveryEnvelope} from './message-recovery-policy';
import {validPublicJwk,validSealedEnvelope} from './messages-policy';
import {seal,type PublicKey} from '../src/lib/message-crypto';

const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Kind='direct'|'words';
type Stage={original_jwk:string,next_jwk:string,recovery_envelope_json:string,state:'staged'|'complete'};
class MigrationError extends Error{constructor(readonly status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new MigrationError(status,message);}
async function body(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();if(raw.length>14000)fail(413,'Migration submission too large.');
 let o:unknown;try{o=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!o||typeof o!=='object'||Array.isArray(o))fail(400,'Invalid request.');
 return o as Record<string,unknown>;
}
async function hash(value:string){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomProof(){
 const secret=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...secret)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function readStage(db:D1Database,userId:string):Promise<Stage|null>{
 return await db.prepare('SELECT original_jwk,next_jwk,recovery_envelope_json,state FROM account_key_migrations WHERE user_id=?')
  .bind(userId).first<Stage>()??null;
}
const inventorySql= [
 "SELECT legacy.kind,legacy.source_id,legacy.context_id,legacy.envelope_json,migrated.envelope_json AS new_envelope_json FROM (",
 "SELECT 'direct' kind,m.id source_id,m.thread_id context_id,c.envelope_json",
 "FROM encrypted_message_copies c JOIN encrypted_messages m ON m.id=c.message_id",
 "JOIN direct_threads t ON t.id=m.thread_id",
 "JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?",
 "JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=?",
 "WHERE c.recipient_id=? UNION ALL",
 "SELECT 'words' kind,p.id source_id,p.space_id context_id,c.envelope_json",
 "FROM shared_word_copies c JOIN shared_word_posts p ON p.id=c.post_id",
 "JOIN shared_word_spaces s ON s.id=p.space_id",
 "JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=?",
 "JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=?",
 "WHERE c.recipient_id=?) legacy LEFT JOIN account_migrated_copies migrated ON migrated.user_id=? AND migrated.source_kind=legacy.kind AND migrated.source_id=legacy.source_id ORDER BY legacy.kind,legacy.source_id LIMIT ? OFFSET ?"
].join(' ');
const missingSql=[
 "SELECT COUNT(*) missing FROM (",
 "SELECT 'direct' kind,m.id source_id FROM encrypted_message_copies c",
 "JOIN encrypted_messages m ON m.id=c.message_id JOIN direct_threads t ON t.id=m.thread_id",
 "JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?",
 "JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=? WHERE c.recipient_id=?",
 "UNION ALL SELECT 'words' kind,p.id source_id FROM shared_word_copies c",
 "JOIN shared_word_posts p ON p.id=c.post_id JOIN shared_word_spaces s ON s.id=p.space_id",
 "JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=?",
 "JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=? WHERE c.recipient_id=?",
 ") legacy WHERE NOT EXISTS (SELECT 1 FROM account_migrated_copies out",
 "WHERE out.user_id=? AND out.source_kind=legacy.kind AND out.source_id=legacy.source_id)"
].join(' ');
async function sourceAllowed(db:D1Database,kind:Kind,id:string,uid:string){
 const sql=kind==='direct'?[
  'SELECT 1 FROM encrypted_messages m JOIN encrypted_message_copies c ON c.message_id=m.id AND c.recipient_id=?',
  'JOIN direct_threads t ON t.id=m.thread_id JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?',
  'JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=? WHERE m.id=?'
 ].join(' '):[
  'SELECT 1 FROM shared_word_posts p JOIN shared_word_copies c ON c.post_id=p.id AND c.recipient_id=?',
  'JOIN shared_word_spaces s ON s.id=p.space_id JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=?',
  'JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=? WHERE p.id=?'
 ].join(' ');
 return !!(await db.prepare(sql).bind(uid,uid,uid,id).first());
}
async function route(req:Request,env:CareEnv,user:SessionUser):Promise<Response>{
 const db=env.DB,url=new URL(req.url),path=url.pathname,stage=await readStage(db,user.id);
 if(path==='/api/messages/recovery/migration/challenge'&&req.method==='POST'){
  if(stage?.state==='complete')fail(409,'Migration is already complete.');
  const registered=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?')
   .bind(user.id).first<{public_jwk:string}>();
  if(!registered)fail(409,'No legacy encryption key is registered.');
  if(stage?.state==='staged'&&stage.original_jwk!==registered.public_jwk)fail(409,'Original migration key changed unexpectedly.');
  const publicKey:unknown=JSON.parse(registered.public_jwk);
  if(!validPublicJwk(publicKey))fail(409,'Legacy encryption key is invalid.');
  const existing=await db.prepare('SELECT 1 FROM message_account_recovery WHERE user_id=?')
   .bind(user.id).first();
  if(existing)fail(409,'Account recovery is already configured.');
  const secret=randomProof(),expires=Date.now()+5*60000;
  const envelope=await seal({kind:'message',text:secret},publicKey as PublicKey,
   'carehold-legacy-proof-v1',user.id,user.id);
  await db.prepare('INSERT INTO account_key_migration_challenges(user_id,original_jwk,proof_digest,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET original_jwk=excluded.original_jwk,proof_digest=excluded.proof_digest,expires_at=excluded.expires_at')
   .bind(user.id,registered.public_jwk,await hash(secret),expires).run();
  return send({envelope,expiresAt:expires});
 }
 if(path==='/api/messages/recovery/migration'&&req.method==='GET')
  return send({state:stage?.state??'none',envelope:stage?JSON.parse(stage.recovery_envelope_json):null,
   publicKey:stage?JSON.parse(stage.next_jwk):null});
 if(path==='/api/messages/recovery/migration'&&req.method==='POST'){
  const b=await body(req);
  if(!validStoredRecoveryEnvelope(b.envelope))fail(400,'Invalid recovery envelope.');
  const encoded=JSON.stringify(b.envelope),next=JSON.stringify(b.envelope.publicKey);
  const current=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?')
   .bind(user.id).first<{public_jwk:string}>();
  if(!current)fail(409,'There is no legacy key to migrate.');
  const enrolled=await db.prepare('SELECT 1 FROM message_account_recovery WHERE user_id=?').bind(user.id).first();
  if(enrolled)fail(409,'Recovery is already configured.');
  if(stage){
   if(stage.state==='staged'&&stage.original_jwk===current.public_jwk&&stage.next_jwk===next&&stage.recovery_envelope_json===encoded)
    return send({state:'staged',replayed:true});
   fail(409,'Another migration exists. Resume with its original recovery code.');
  }
  if(next===current.public_jwk)fail(409,'Replacement key must differ from legacy key.');
  if(typeof b.proof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.proof))
   fail(403,'Prove access to the original browser key before migration.');
  const challenge=await db.prepare('SELECT 1 FROM account_key_migration_challenges WHERE user_id=? AND proof_digest=? AND original_jwk=? AND expires_at>?')
   .bind(user.id,await hash(b.proof),current.public_jwk,Date.now()).first();
  if(!challenge)fail(403,'Legacy key challenge is incorrect or expired. Request another challenge.');

  try{
   await db.batch([
    db.prepare("INSERT INTO account_key_migrations(user_id,original_jwk,next_jwk,recovery_envelope_json,state,created_at) VALUES(?,?,?,?,'staged',?)")
     .bind(user.id,current.public_jwk,next,encoded,new Date().toISOString()),
    db.prepare('DELETE FROM account_key_migration_challenges WHERE user_id=?').bind(user.id)
   ]);
  }catch{fail(409,'Another migration started. Reload without resetting keys.');}
  return send({state:'staged'},201);
 }
 if(path==='/api/messages/recovery/migration/finalize'&&req.method==='POST'&&stage?.state==='complete')
  return send({state:'complete',publicKey:JSON.parse(stage.next_jwk),replayed:true});
 if(!stage||stage.state!=='staged')fail(409,'Begin or resume a migration first.');
 const current=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?')
  .bind(user.id).first<{public_jwk:string}>();
 if(current?.public_jwk!==stage.original_jwk)fail(409,'Public key changed unexpectedly. Original records preserved.');
 if(path==='/api/messages/recovery/migration/cancel'&&req.method==='POST'){
  const b=await body(req);
  if(typeof b.proof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.proof))
   fail(403,'The original private key must authorize cancellation.');
  const checked=await db.prepare('SELECT 1 FROM account_key_migration_challenges WHERE user_id=? AND original_jwk=? AND proof_digest=? AND expires_at>?')
   .bind(user.id,stage.original_jwk,await hash(b.proof),Date.now()).first();
  if(!checked)fail(403,'Original encryption key proof is incorrect or expired.');
  try{
   const result=await db.batch([
    db.prepare("DELETE FROM account_migrated_copies WHERE user_id=? AND EXISTS(SELECT 1 FROM account_key_migrations WHERE user_id=? AND state='staged')")
     .bind(user.id,user.id),
    db.prepare("DELETE FROM account_key_migrations WHERE user_id=? AND state='staged'").bind(user.id),
    db.prepare('DELETE FROM account_key_migration_challenges WHERE user_id=?').bind(user.id)
   ]);
   if(result[1].meta.changes!==1)fail(409,'Migration changed concurrently. Refresh and preserve the original browser.');
  }catch(e){
   if(e instanceof MigrationError)throw e;
   fail(409,'Could not safely cancel migration. No original ciphertext was removed.');
  }
  return send({cancelled:true,originalKeyPreserved:true});
 }
 if(path==='/api/messages/recovery/migration/copies'&&req.method==='GET'){
  const raw=url.searchParams.get('offset')??'0';
  if(!/^(0|[1-9]\d{0,5})$/.test(raw)||Number(raw)>100000)fail(400,'Invalid page offset.');
  const offset=Number(raw),limit=100;
  const rows=await db.prepare(inventorySql).bind(user.id,user.id,user.id,user.id,user.id,user.id,user.id,limit+1,offset)
   .all<{kind:Kind,source_id:string,context_id:string,envelope_json:string,new_envelope_json:string|null}>();
  const values=rows.results||[];
  return send({copies:values.slice(0,limit).map(v=>({
   kind:v.kind,sourceId:v.source_id,contextId:v.context_id,envelope:JSON.parse(v.envelope_json),migratedEnvelope:v.new_envelope_json?JSON.parse(v.new_envelope_json):null
  })),hasMore:values.length>limit});
 }
 if(path==='/api/messages/recovery/migration/copies'&&req.method==='POST'){
  const b=await body(req),kind=b.kind,sourceId=b.sourceId;
  if((kind!=='direct'&&kind!=='words')||typeof sourceId!=='string'||!UUID.test(sourceId)||!validSealedEnvelope(b.envelope))
   fail(400,'Invalid encrypted recipient copy.');
  if(!await sourceAllowed(db,kind,sourceId,user.id))fail(404,'Recipient copy unavailable.');
  const encoded=JSON.stringify(b.envelope),ts=new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO account_migrated_copies(user_id,source_kind,source_id,envelope_json,created_at) VALUES(?,?,?,?,?)')
   .bind(user.id,kind,sourceId,encoded,ts).run();
  const row=await db.prepare('SELECT envelope_json FROM account_migrated_copies WHERE user_id=? AND source_kind=? AND source_id=?')
   .bind(user.id,kind,sourceId).first<{envelope_json:string}>();
  if(row?.envelope_json!==encoded)fail(409,'A different migrated copy exists. Do not overwrite.');
  return send({accepted:true});
 }
 if(path==='/api/messages/recovery/migration/finalize'&&req.method==='POST'){
  const b=await body(req);
  if(b.confirm!==true)fail(400,'Explicit confirmation required.');
  const left=await db.prepare(missingSql).bind(user.id,user.id,user.id,user.id,user.id,user.id,user.id)
   .first<{missing:number}>();
  if((left?.missing??0)>0)fail(409,String(left!.missing)+' encrypted copies remain unmigrated. No key was changed.');
  try{
   const stamp=new Date().toISOString();
   await db.batch([
    db.prepare('INSERT INTO message_account_recovery(user_id,public_jwk,envelope_json,created_at) VALUES(?,?,?,?)')
     .bind(user.id,stage.next_jwk,stage.recovery_envelope_json,stamp),
    db.prepare('UPDATE message_device_keys SET public_jwk=? WHERE user_id=? AND public_jwk=?')
     .bind(stage.next_jwk,user.id,stage.original_jwk),
    db.prepare("UPDATE account_key_migrations SET state='complete',completed_at=? WHERE user_id=? AND state='staged'")
     .bind(stamp,user.id)
   ]);
  }catch{fail(409,'Finalization conflicted. Original ciphertext remains.');}
  return send({state:'complete',publicKey:JSON.parse(stage.next_jwk)});
 }
 fail(404,'Migration route not found.');
}
export async function handleRecoveryMigration(req:Request,env:CareEnv,user:SessionUser):Promise<Response>{
 try{return await route(req,env,user);}catch(e){
  if(e instanceof MigrationError)return send({error:e.message},e.status);
  throw e;
 }
}
