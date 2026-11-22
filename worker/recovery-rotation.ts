import type {CareEnv,SessionUser} from './types';
import {validStoredRecoveryEnvelope} from './message-recovery-policy';
import {validPublicJwk,validSealedEnvelope} from './messages-policy';
import {seal,type PublicKey} from '../src/lib/message-crypto';

const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const send=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const IV=/^[A-Za-z0-9_-]{16}$/;
const CIPHER=/^[A-Za-z0-9_-]{25,9000}$/;
type CopyKind='direct'|'words';
type Rotation={rotation_id:string,original_jwk:string,next_jwk:string,next_envelope_json:string,state:'staged'|'complete'};
class RotationError extends Error{constructor(readonly status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new RotationError(status,message);}
async function body(req:Request){
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();if(raw.length>15000)fail(413,'Rotation request too large.');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'Invalid payload.');
 return parsed as Record<string,unknown>;
}
async function digest(text:string){
 const result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(result)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomProof(){
 const random=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...random)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function stageFor(db:D1Database,uid:string){
 return await db.prepare("SELECT rotation_id,original_jwk,next_jwk,next_envelope_json,state FROM account_recovery_rotations WHERE user_id=? AND state='staged'")
  .bind(uid).first<Rotation>()??null;
}
async function currentPublic(db:D1Database,uid:string){
 return (await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?').bind(uid)
  .first<{public_jwk:string}>())?.public_jwk??null;
}
async function originalProof(db:D1Database,uid:string,publicJwk:string,proof:unknown){
 if(typeof proof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(proof))
  fail(403,'Original device private key proof required.');
 const row=await db.prepare('SELECT 1 FROM account_recovery_rotation_challenges WHERE user_id=? AND original_jwk=? AND proof_digest=? AND expires_at>?')
  .bind(uid,publicJwk,await digest(proof),Date.now()).first();
 if(!row)fail(403,'Original device proof expired or does not match. Request a new challenge.');
}
async function member(db:D1Database,hid:string,uid:string){
 if(!UUID.test(hid))fail(400,'Invalid care circle.');
 const row=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?')
  .bind(hid,uid).first();
 if(!row)fail(404,'Care circle unavailable.');
}
async function copyAllowed(db:D1Database,kind:CopyKind,id:string,uid:string){
 const sql=kind==='direct'
  ? `SELECT 1 FROM encrypted_message_copies c JOIN encrypted_messages m ON m.id=c.message_id
    JOIN direct_threads t ON t.id=m.thread_id
    JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?
    JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=?
    WHERE c.recipient_id=? AND m.id=?`
  : `SELECT 1 FROM shared_word_copies c JOIN shared_word_posts p ON p.id=c.post_id
    JOIN shared_word_spaces s ON s.id=p.space_id
    JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=?
    JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=?
    WHERE c.recipient_id=? AND p.id=?`;
 return !!(await db.prepare(sql).bind(uid,uid,uid,id).first());
}
const messageInventory=`
 SELECT b.kind,b.source_id,b.context_id,
  COALESCE(rc.envelope_json,mc.envelope_json,b.envelope_json) AS envelope_json,
  staged.envelope_json AS staged_envelope
 FROM (
  SELECT 'direct' AS kind,m.id AS source_id,m.thread_id AS context_id,c.envelope_json
  FROM encrypted_message_copies c JOIN encrypted_messages m ON m.id=c.message_id
  JOIN direct_threads t ON t.id=m.thread_id
  JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?
  JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=?
  WHERE c.recipient_id=?
  UNION ALL
  SELECT 'words' AS kind,p.id AS source_id,p.space_id AS context_id,c.envelope_json
  FROM shared_word_copies c JOIN shared_word_posts p ON p.id=c.post_id
  JOIN shared_word_spaces s ON s.id=p.space_id
  JOIN shared_word_participants sp ON sp.space_id=s.id AND sp.user_id=?
  JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=?
  WHERE c.recipient_id=?
 ) b
 LEFT JOIN account_recovery_rotation_copies rc ON rc.rotation_id=(
  SELECT rotation_id FROM account_recovery_rotations WHERE user_id=? AND state='complete'
  ORDER BY completed_at DESC,rowid DESC LIMIT 1
 ) AND rc.source_kind=b.kind AND rc.source_id=b.source_id
 LEFT JOIN account_migrated_copies mc ON mc.user_id=? AND mc.source_kind=b.kind AND mc.source_id=b.source_id
  AND EXISTS(SELECT 1 FROM account_key_migrations WHERE user_id=? AND state='complete')
 LEFT JOIN account_recovery_rotation_copies staged ON staged.rotation_id=? AND staged.source_kind=b.kind AND staged.source_id=b.source_id
 ORDER BY b.kind,b.source_id LIMIT ? OFFSET ?`;
const journalInventory=`
 SELECT j.household_id,j.entry_id,j.revision,j.iv,j.ciphertext,j.created_at,j.updated_at,
  s.iv AS staged_iv,s.ciphertext AS staged_ciphertext,s.expected_revision AS staged_revision
 FROM private_journal_sync j JOIN household_members hm ON hm.household_id=j.household_id AND hm.user_id=j.user_id
 LEFT JOIN account_recovery_rotation_journals s ON s.rotation_id=? AND s.household_id=j.household_id AND s.entry_id=j.entry_id
 WHERE j.user_id=? AND j.deleted_at IS NULL ORDER BY j.household_id,j.entry_id LIMIT ? OFFSET ?`;
const draftInventory=`
 SELECT d.household_id,d.scope_id,d.revision,d.iv,d.ciphertext,d.updated_at,
  s.iv AS staged_iv,s.ciphertext AS staged_ciphertext,s.expected_revision AS staged_revision
 FROM private_draft_sync d JOIN household_members hm ON hm.household_id=d.household_id AND hm.user_id=d.user_id
 LEFT JOIN account_recovery_rotation_drafts s ON s.rotation_id=? AND s.household_id=d.household_id AND s.scope_id=d.scope_id
 WHERE d.user_id=? AND d.deleted_at IS NULL ORDER BY d.household_id,d.scope_id LIMIT ? OFFSET ?`;
async function route(req:Request,env:CareEnv,user:SessionUser){
 const db=env.DB,url=new URL(req.url),path=url.pathname,stage=await stageFor(db,user.id);
 if(path==='/api/recovery-rotation/status'&&req.method==='GET')
  return send({state:stage?'staged':'none',rotationId:stage?.rotation_id??null,
   envelope:stage?JSON.parse(stage.next_envelope_json):null,
   publicKey:stage?JSON.parse(stage.next_jwk):null});
 if(path==='/api/recovery-rotation/challenge'&&req.method==='POST'){
  const registered=await currentPublic(db,user.id);
  if(!registered)fail(409,'No encryption key enrolled.');
  if(stage&&stage.original_jwk!==registered)fail(409,'Account encryption key changed during rotation.');
  const recovered=await db.prepare('SELECT 1 FROM message_account_recovery WHERE user_id=? AND public_jwk=?')
   .bind(user.id,registered).first();
  if(!recovered)fail(409,'This key has no recovery envelope. Use the original legacy migration instead.');
  const legacyStaged=await db.prepare("SELECT 1 FROM account_key_migrations WHERE user_id=? AND state='staged'")
   .bind(user.id).first();
  if(legacyStaged)fail(409,'Finish or cancel the older migration first.');
  const publicKey=JSON.parse(registered) as PublicKey;
  if(!validPublicJwk(publicKey))fail(409,'Invalid registered encryption key.');
  const proof=randomProof();
  const envelope=await seal({kind:'message',text:proof},publicKey,'carehold-legacy-proof-v1',user.id,user.id);
  await db.prepare(`INSERT INTO account_recovery_rotation_challenges(user_id,original_jwk,proof_digest,expires_at)
   VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET original_jwk=excluded.original_jwk,proof_digest=excluded.proof_digest,expires_at=excluded.expires_at`)
   .bind(user.id,registered,await digest(proof),Date.now()+300000).run();
  return send({envelope});
 }
 if(path==='/api/recovery-rotation/start'&&req.method==='POST'){
  const b=await body(req);
  if(!validStoredRecoveryEnvelope(b.envelope))fail(400,'Invalid replacement encryption envelope.');
  const newJwk=JSON.stringify(b.envelope.publicKey),oldJwk=await currentPublic(db,user.id);
  if(!oldJwk||newJwk===oldJwk)fail(409,'Replacement key must differ from the current enrolled key.');
  if(stage)fail(409,'Resume or safely cancel the existing replacement before starting another.');
  if(!await db.prepare('SELECT 1 FROM message_account_recovery WHERE user_id=? AND public_jwk=?')
   .bind(user.id,oldJwk).first())fail(409,'Account does not have completed recovery enrollment.');
  await originalProof(db,user.id,oldJwk,b.proof);
  const id=crypto.randomUUID(),now=Date.now();
  try{await db.batch([
   db.prepare(`INSERT INTO account_recovery_rotations(rotation_id,user_id,original_jwk,next_jwk,next_envelope_json,state,created_at)
    VALUES(?,?,?,?,?,'staged',?)`).bind(id,user.id,oldJwk,newJwk,JSON.stringify(b.envelope),now),
   db.prepare('DELETE FROM account_recovery_rotation_challenges WHERE user_id=?').bind(user.id)
  ]);}catch{fail(409,'Another replacement started, no keys were changed. Reload and resume.');}
  return send({state:'staged',rotationId:id},201);
 }
 if(path==='/api/recovery-rotation/cancel'&&req.method==='POST'){
  if(!stage)fail(409,'No staged replacement to cancel.');
  const b=await body(req),oldJwk=await currentPublic(db,user.id);
  if(oldJwk!==stage.original_jwk)fail(409,'Current encryption key changed. No records were deleted.');
  await originalProof(db,user.id,oldJwk,b.proof);
  await db.batch([
   db.prepare('DELETE FROM account_recovery_rotation_copies WHERE rotation_id=?').bind(stage.rotation_id),
   db.prepare('DELETE FROM account_recovery_rotation_journals WHERE rotation_id=?').bind(stage.rotation_id),
   db.prepare('DELETE FROM account_recovery_rotation_drafts WHERE rotation_id=?').bind(stage.rotation_id),
   db.prepare("DELETE FROM account_recovery_rotations WHERE rotation_id=? AND state='staged'").bind(stage.rotation_id),
   db.prepare('DELETE FROM account_recovery_rotation_challenges WHERE user_id=?').bind(user.id)
  ]);
  return send({cancelled:true,oldIdentityPreserved:true});
 }
 if(!stage)fail(409,'Begin replacement and verify your saved recovery code first.');
 if(path==='/api/recovery-rotation/scopes'&&req.method==='GET'){
  const [households,threads,spaces]=await Promise.all([
   db.prepare('SELECT household_id id FROM household_members WHERE user_id=?').bind(user.id).all<{id:string}>(),
   db.prepare(`SELECT t.id,t.household_id householdId FROM direct_threads t
    JOIN direct_thread_members tm ON tm.thread_id=t.id AND tm.user_id=?
    JOIN household_members hm ON hm.household_id=t.household_id AND hm.user_id=?`).bind(user.id,user.id).all<{id:string,householdId:string}>(),
   db.prepare(`SELECT s.id,s.household_id householdId FROM shared_word_spaces s
    JOIN shared_word_participants p ON p.space_id=s.id AND p.user_id=?
    JOIN household_members hm ON hm.household_id=s.household_id AND hm.user_id=?`).bind(user.id,user.id).all<{id:string,householdId:string}>()
  ]);
  return send({households:households.results??[],threads:threads.results??[],spaces:spaces.results??[]});
 }
 if(path==='/api/recovery-rotation/inventory'&&req.method==='GET'){
  const kind=url.searchParams.get('kind'),raw=url.searchParams.get('offset')??'0';
  if(!/^(0|[1-9]\d{0,4})$/.test(raw)||Number(raw)>10000)fail(400,'Invalid page offset.');
  const offset=Number(raw),limit=50;
  if(kind==='copies'){
   const rows=await db.prepare(messageInventory)
    .bind(user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,stage.rotation_id,limit+1,offset)
    .all<{kind:CopyKind,source_id:string,context_id:string,envelope_json:string,staged_envelope:string|null}>();
   const values=rows.results??[];
   return send({items:values.slice(0,limit).map(v=>({kind:v.kind,sourceId:v.source_id,contextId:v.context_id,
    envelope:JSON.parse(v.envelope_json),staged:v.staged_envelope?JSON.parse(v.staged_envelope):null})),hasMore:values.length>limit});
  }
  if(kind==='journals'){
   const rows=await db.prepare(journalInventory).bind(stage.rotation_id,user.id,limit+1,offset)
    .all<{household_id:string,entry_id:string,revision:number,iv:string,ciphertext:string,created_at:number,updated_at:number,staged_iv:string|null,staged_ciphertext:string|null,staged_revision:number|null}>();
   const values=rows.results??[];
   return send({items:values.slice(0,limit).map(v=>({householdId:v.household_id,id:v.entry_id,revision:v.revision,iv:v.iv,ciphertext:v.ciphertext,createdAt:v.created_at,updatedAt:v.updated_at,
    staged:v.staged_iv?{iv:v.staged_iv,ciphertext:v.staged_ciphertext,expectedRevision:v.staged_revision}:null})),hasMore:values.length>limit});
  }
  if(kind==='drafts'){
   const rows=await db.prepare(draftInventory).bind(stage.rotation_id,user.id,limit+1,offset)
    .all<{household_id:string,scope_id:string,revision:number,iv:string,ciphertext:string,updated_at:number,staged_iv:string|null,staged_ciphertext:string|null,staged_revision:number|null}>();
   const values=rows.results??[];
   return send({items:values.slice(0,limit).map(v=>({householdId:v.household_id,scopeId:v.scope_id,revision:v.revision,iv:v.iv,ciphertext:v.ciphertext,updatedAt:v.updated_at,
    staged:v.staged_iv?{iv:v.staged_iv,ciphertext:v.staged_ciphertext,expectedRevision:v.staged_revision}:null})),hasMore:values.length>limit});
  }
  fail(400,'Invalid rotation inventory kind.');
 }
 if(path==='/api/recovery-rotation/stage'&&req.method==='POST'){
  const b=await body(req),kind=b.kind;
  if((kind==='direct'||kind==='words')&&typeof b.sourceId==='string'&&UUID.test(b.sourceId)&&validSealedEnvelope(b.envelope)){
   if(!await copyAllowed(db,kind,b.sourceId,user.id))fail(404,'Recipient copy unavailable.');
   const json=JSON.stringify(b.envelope);
   await db.prepare('INSERT OR IGNORE INTO account_recovery_rotation_copies(rotation_id,source_kind,source_id,envelope_json) VALUES(?,?,?,?)')
    .bind(stage.rotation_id,kind,b.sourceId,json).run();
   const saved=await db.prepare('SELECT envelope_json FROM account_recovery_rotation_copies WHERE rotation_id=? AND source_kind=? AND source_id=?')
    .bind(stage.rotation_id,kind,b.sourceId).first<{envelope_json:string}>();
   if(saved?.envelope_json!==json)fail(409,'Different staged encrypted copy exists. Resume its original saved recovery code.');
   return send({staged:true});
  }
  if(kind==='journal'||kind==='draft'){
   const hid=b.householdId,id=b.sourceId,revision=b.expectedRevision,iv=b.iv,ct=b.ciphertext;
   if(typeof hid!=='string'||typeof id!=='string'||!UUID.test(hid)||
    !(kind==='journal'?UUID.test(id):HASH.test(id))||
    !Number.isSafeInteger(revision)||revision<1||!IV.test(iv)||!CIPHER.test(ct))
    fail(400,'Invalid encrypted migration record.');
   await member(db,hid,user.id);
   const table=kind==='journal'?'private_journal_sync':'private_draft_sync';
   const idcol=kind==='journal'?'entry_id':'scope_id';
   const old=await db.prepare(`SELECT 1 FROM ${table} WHERE user_id=? AND household_id=? AND ${idcol}=? AND revision=? AND deleted_at IS NULL`)
    .bind(user.id,hid,id,revision).first();
   if(!old)fail(409,'Encrypted content changed or was deleted during rotation. Preserve original browser and retry.');
   const target=kind==='journal'?'account_recovery_rotation_journals':'account_recovery_rotation_drafts';
   await db.prepare(`INSERT OR IGNORE INTO ${target}(rotation_id,household_id,${idcol},expected_revision,iv,ciphertext) VALUES(?,?,?,?,?,?)`)
    .bind(stage.rotation_id,hid,id,revision,iv,ct).run();
   const saved=await db.prepare(`SELECT expected_revision,iv,ciphertext FROM ${target} WHERE rotation_id=? AND household_id=? AND ${idcol}=?`)
    .bind(stage.rotation_id,hid,id).first<{expected_revision:number,iv:string,ciphertext:string}>();
   if(saved?.expected_revision!==revision||saved.iv!==iv||saved.ciphertext!==ct)
    fail(409,'A different staged revision exists. Do not overwrite.');
   return send({staged:true});
  }
  fail(400,'Invalid staged rotation copy.');
 }
 if(path==='/api/recovery-rotation/finalize'&&req.method==='POST'){
  const b=await body(req);
  if(b.confirm!==true)fail(400,'Confirm the saved code and all encrypted copies before finalizing.');
  if(await currentPublic(db,user.id)!==stage.original_jwk)
   fail(409,'Original encryption identity changed; nothing was rotated.');
  const [journalRows,draftRows]=await Promise.all([
   db.prepare('SELECT household_id,entry_id,expected_revision,iv,ciphertext FROM account_recovery_rotation_journals WHERE rotation_id=?').bind(stage.rotation_id)
    .all<{household_id:string,entry_id:string,expected_revision:number,iv:string,ciphertext:string}>(),
   db.prepare('SELECT household_id,scope_id,expected_revision,iv,ciphertext FROM account_recovery_rotation_drafts WHERE rotation_id=?').bind(stage.rotation_id)
    .all<{household_id:string,scope_id:string,expected_revision:number,iv:string,ciphertext:string}>()
  ]);
  // Batch commits atomically; the SQLite trigger refuses the final transition
  // unless every authorized recipient copy and owned active journal/draft is
  // migrated with the exact current revision and expected ciphertext.
  const operations=[
   ...(journalRows.results??[]).map(v=>db.prepare(`UPDATE private_journal_sync SET revision=revision+1,iv=?,ciphertext=?
    WHERE user_id=? AND household_id=? AND entry_id=? AND revision=? AND deleted_at IS NULL`)
    .bind(v.iv,v.ciphertext,user.id,v.household_id,v.entry_id,v.expected_revision)),
   ...(draftRows.results??[]).map(v=>db.prepare(`UPDATE private_draft_sync SET revision=revision+1,iv=?,ciphertext=?
    WHERE user_id=? AND household_id=? AND scope_id=? AND revision=? AND deleted_at IS NULL`)
    .bind(v.iv,v.ciphertext,user.id,v.household_id,v.scope_id,v.expected_revision)),
   db.prepare('UPDATE message_device_keys SET public_jwk=? WHERE user_id=? AND public_jwk=?')
    .bind(stage.next_jwk,user.id,stage.original_jwk),
   db.prepare('UPDATE message_account_recovery SET public_jwk=?,envelope_json=? WHERE user_id=? AND public_jwk=?')
    .bind(stage.next_jwk,stage.next_envelope_json,user.id,stage.original_jwk),
   db.prepare("UPDATE account_recovery_rotations SET state='complete',completed_at=? WHERE rotation_id=? AND user_id=? AND state='staged'")
    .bind(Date.now(),stage.rotation_id,user.id)
  ];
  if(operations.length>800)fail(409,'Too many encrypted records for one atomic replacement. Preserve the browser; contact support for a chunked migration.');
  try{
   const results=await db.batch(operations);
   if(results.at(-1)?.meta.changes!==1)fail(409,'Rotation was not confirmed; inspect status before retrying.');
  }catch(e){
   if(e instanceof RotationError)throw e;
   fail(409,'Encrypted rotation verification failed. Original encryption key and staged ciphertext are preserved. No partial replacement was committed.');
  }
  return send({state:'complete',publicKey:JSON.parse(stage.next_jwk)});
 }
 fail(404,'Unknown recovery rotation operation.');
}
export async function handleRecoveryRotation(req:Request,env:CareEnv,user:SessionUser):Promise<Response>{
 try{return await route(req,env,user);}catch(e){
  if(e instanceof RotationError)return send({error:e.message},e.status);
  throw e;
 }
}
