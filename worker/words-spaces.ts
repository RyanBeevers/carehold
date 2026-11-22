import {sendPushNotification} from '@mmmike/web-push/send';
import {pushConfigured} from './push-config';
import type {CareEnv,SessionUser} from './types';
import {exactParticipants,matchesKeyRoster,validSealedEnvelope} from './messages-policy';

/** Experimental encrypted, explicitly shared fictional Words spaces.
 * No plaintext journal data, no implicit owner/caregiver access, no read receipts.
 */
const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
class WordsError extends Error{constructor(public status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new WordsError(status,message);}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value:unknown):string{
 if(typeof value!=='string'||!uuid.test(value))fail(400,'Invalid identifier.');
 return value as string;
}
function householdId(value:unknown):string{
 if(typeof value!=='string'||value.length<1||value.length>140)fail(400,'Invalid care circle.');
 return value as string;
}
async function body(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();
 if(raw.length>115000)fail(413,'Encrypted request is too large.');
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'Invalid payload.');
 return parsed as Record<string,unknown>;
}
async function member(db:D1Database,hid:string,uid:string){
 const row=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?').bind(hid,uid).first();
 if(!row)fail(403,'Care circle membership required.');
}
async function spaceFor(db:D1Database,spaceId:string,uid:string){
 const row=await db.prepare(`SELECT s.id,s.household_id,s.initial_kind,s.created_by FROM shared_word_spaces s
 JOIN shared_word_participants p ON p.space_id=s.id AND p.user_id=?
 JOIN household_members h ON h.household_id=s.household_id AND h.user_id=?
 WHERE s.id=? AND s.deleted_at IS NULL AND p.left_at IS NULL`).bind(uid,uid,spaceId).first<{id:string,household_id:string,initial_kind:'prompt'|'journal',created_by:string}>();
 if(!row)fail(404,'Shared space unavailable.');
 return row!;
}
async function participants(db:D1Database,spaceId:string){
 const result=await db.prepare(`SELECT p.user_id id,u.name,k.public_jwk FROM shared_word_participants p
 JOIN user u ON u.id=p.user_id
 JOIN shared_word_spaces s ON s.id=p.space_id
 JOIN household_members h ON h.household_id=s.household_id AND h.user_id=p.user_id
 LEFT JOIN message_device_keys k ON k.user_id=p.user_id
 WHERE p.space_id=? AND p.left_at IS NULL ORDER BY p.joined_at,p.user_id`).bind(spaceId).all<{id:string,name:string,public_jwk:string|null}>();
 return (result.results||[]).map(p=>({id:p.id,name:p.name,publicKey:p.public_jwk?JSON.parse(p.public_jwk):null}));
}
async function digest(value:string){
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
}
function checkCopies(value:unknown,people:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Encrypted participant copies required.');
 const copies=value as Record<string,unknown>;
 if(!exactParticipants(Object.keys(copies),people)||!people.every(uid=>validSealedEnvelope(copies[uid])))
  fail(400,'Every selected participant needs exactly one valid encrypted copy.');
 return copies;
}
function postStatements(db:D1Database,postId:string,spaceId:string,uid:string,kind:string,copies:Record<string,unknown>,people:string[],createdAt:string,hash:string){
 return [
  db.prepare('INSERT INTO shared_word_posts(id,space_id,author_id,kind,body_hash,created_at) VALUES(?,?,?,?,?,?)').bind(postId,spaceId,uid,kind,hash,createdAt),
  ...people.map(person=>db.prepare('INSERT INTO shared_word_copies(post_id,recipient_id,envelope_json) VALUES(?,?,?)').bind(postId,person,JSON.stringify(copies[person])))
 ];
}
function activityStatements(db:D1Database,people:string[],sender:string,hid:string,sourceId:string,postId:string,kind:'shared'|'reply',time:string){
 return people.filter(uid=>uid!==sender).map(uid=>db.prepare(`INSERT INTO private_word_activity
  (id,user_id,household_id,source_kind,source_id,post_id,event_kind,created_at) VALUES(?,?,?,'words',?,?,?,?)`)
  .bind(crypto.randomUUID(),uid,hid,sourceId,postId,kind,time));
}

/** Generic opt-in push only. Neither journal text nor person/prompt names leave the server. */
export function notifyPrivateRecipients(env:CareEnv,ctx:ExecutionContext,hid:string,recipients:readonly string[]){
 if(!pushConfigured(env)||!recipients.length)return;
 const ids=[...new Set(recipients)].slice(0,12);
 ctx.waitUntil((async()=>{
  for(const uid of ids){
   try{
    const pref=await env.DB.prepare(`SELECT enabled FROM private_word_push_preferences WHERE user_id=? AND household_id=?
     AND EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=?)`)
     .bind(uid,hid,uid,hid).first<{enabled:number}>();
    if(pref?.enabled!==1)continue;
    const devices=await env.DB.prepare('SELECT endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=? LIMIT 10')
     .bind(uid).all<{endpoint:string,p256dh:string,auth_secret:string}>();
    for(const sub of devices.results||[]){
     try{const accepted=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}},
      {title:'A moment for care',body:'Something new is waiting in Carehold.',url:'/words',tag:'carehold-private-activity'},
      {publicKey:env.VAPID_PUBLIC_KEY!,privateKey:env.VAPID_PRIVATE_KEY!,subject:env.VAPID_SUBJECT!});
      if(!accepted)await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').bind(sub.endpoint,uid).run();
     }catch{/* Push is best-effort; the private activity inbox remains authoritative. */}
    }
   }catch{/* Never let a push failure leak into or roll back a successful send. */}
  }
 })());
}
async function route(req:Request,env:CareEnv,user:SessionUser,ctx:ExecutionContext):Promise<Response>{
 const db=env.DB,path=new URL(req.url).pathname,url=new URL(req.url);
 if(path==='/api/words/push-preference'){
  const b=req.method==='POST'?await body(req):null;
  const hid=householdId(b?.householdId??url.searchParams.get('householdId'));
  await member(db,hid,user.id);
  if(req.method==='GET'){
   const r=await db.prepare('SELECT enabled FROM private_word_push_preferences WHERE user_id=? AND household_id=?').bind(user.id,hid).first<{enabled:number}>();
   return respond({enabled:r?.enabled===1});
  }
  if(req.method==='POST'){
   if(typeof b?.enabled!=='boolean')fail(400,'Choose whether to enable notifications.');
   await db.prepare(`INSERT INTO private_word_push_preferences(user_id,household_id,enabled) VALUES(?,?,?)
    ON CONFLICT(user_id,household_id) DO UPDATE SET enabled=excluded.enabled`).bind(user.id,hid,b?.enabled===true?1:0).run();
   return respond({enabled:b?.enabled===true});
  }
 }
 if(path==='/api/words/push/test'&&req.method==='POST'){
  const b=await body(req),hid=householdId(b.householdId);await member(db,hid,user.id);
  if(!pushConfigured(env))fail(503,'Words device notifications are not configured on this server.');
  const preference=await db.prepare('SELECT enabled FROM private_word_push_preferences WHERE user_id=? AND household_id=?')
   .bind(user.id,hid).first<{enabled:number}>();
  if(preference?.enabled!==1)fail(409,'Enable Words notifications before testing.');
  const devices=await db.prepare('SELECT id,endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=? LIMIT 10')
   .bind(user.id).all<{id:string,endpoint:string,p256dh:string,auth_secret:string}>();
  if(!devices.results.length)fail(409,'No registered notification device. Enable notifications on this device first.');
  const cutoff=new Date(Date.now()-60_000).toISOString();
  const claim=await db.prepare(`INSERT INTO push_test_rate_limits(user_id,last_sent_at) VALUES(?,?)
    ON CONFLICT(user_id) DO UPDATE SET last_sent_at=excluded.last_sent_at
    WHERE push_test_rate_limits.last_sent_at<? RETURNING last_sent_at`)
   .bind(user.id,new Date().toISOString(),cutoff).first();
  if(!claim)fail(429,'Wait one minute before sending another notification test.');
  let accepted=0;
  const testId=crypto.randomUUID();
  for(const sub of devices.results){
   try{
    const sent=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}},
     {title:'A moment for care',body:'Your Carehold Words notification test arrived.',url:'/words',tag:'carehold-words-test-'+testId},
     {publicKey:env.VAPID_PUBLIC_KEY!,privateKey:env.VAPID_PRIVATE_KEY!,subject:env.VAPID_SUBJECT!});
    if(sent)accepted++;
    else await db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').bind(sub.id,user.id).run();
   }catch{/* Push service details remain private. */}
  }
  if(!accepted)fail(502,'The push service rejected the test. Re-enable notifications on this device and try again.');
  return respond({accepted,attempted:devices.results.length});
 }
 if(path==='/api/words/people'&&req.method==='GET'){
  const hid=householdId(url.searchParams.get('householdId'));await member(db,hid,user.id);
  const result=await db.prepare(`SELECT u.id,u.name,k.public_jwk FROM household_members hm
   JOIN user u ON u.id=hm.user_id LEFT JOIN message_device_keys k ON k.user_id=u.id
   WHERE hm.household_id=? AND hm.user_id<>?
    AND NOT EXISTS(SELECT 1 FROM profiles archived WHERE archived.household_id=hm.household_id
     AND archived.linked_user_id=hm.user_id AND archived.archived_at IS NOT NULL)
    ORDER BY u.name LIMIT 40`)
   .bind(hid,user.id).all<{id:string,name:string,public_jwk:string|null}>();
  return respond({people:(result.results||[]).map(r=>({id:r.id,name:r.name,publicKey:r.public_jwk?JSON.parse(r.public_jwk):null}))});
 }
 if(path==='/api/words/spaces'&&req.method==='GET'){
  const hid=householdId(url.searchParams.get('householdId'));await member(db,hid,user.id);
  const result=await db.prepare(`SELECT s.id,s.initial_kind,s.created_by,s.created_at,u.name creator_name,
   p.id initial_post_id,COALESCE(rc.envelope_json,mc.envelope_json,c.envelope_json) envelope_json FROM shared_word_spaces s
   JOIN shared_word_participants own ON own.space_id=s.id AND own.user_id=? AND own.left_at IS NULL
   JOIN user u ON u.id=s.created_by
   JOIN shared_word_posts p ON p.space_id=s.id AND p.kind IN ('prompt','journal') AND p.deleted_at IS NULL
   JOIN shared_word_copies c ON c.post_id=p.id AND c.recipient_id=?
   LEFT JOIN account_migrated_copies mc ON mc.source_kind='words' AND mc.source_id=p.id AND mc.user_id=c.recipient_id AND EXISTS(SELECT 1 FROM account_key_migrations mig WHERE mig.user_id=c.recipient_id AND mig.state='complete')
    LEFT JOIN account_recovery_rotation_copies rc ON rc.source_kind='words' AND rc.source_id=p.id
     AND rc.rotation_id=(SELECT rotation_id FROM account_recovery_rotations WHERE user_id=c.recipient_id AND state='complete' ORDER BY completed_at DESC,rowid DESC LIMIT 1)
   WHERE s.household_id=? AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 100`)
   .bind(user.id,user.id,hid).all<{id:string,initial_kind:string,created_by:string,created_at:string,creator_name:string,initial_post_id:string,envelope_json:string}>();
  return respond({spaces:(result.results||[]).map(r=>({id:r.id,kind:r.initial_kind,createdBy:r.created_by,createdAt:r.created_at,creatorName:r.creator_name,
   initialPostId:r.initial_post_id,initialEnvelope:JSON.parse(r.envelope_json)}))});
 }
 if(path==='/api/words/spaces'&&req.method==='POST'){
  const b=await body(req),hid=householdId(b.householdId),sid=id(b.id),postId=id(b.postId);
  if(sid===postId)fail(400,'Space and post identifiers must differ.');
  await member(db,hid,user.id);
  const kind=b.kind;
  if(kind!=='prompt'&&kind!=='journal')fail(400,'Select a prompt or journal entry.');
  if(!Array.isArray(b.recipientIds)||b.recipientIds.length<1||b.recipientIds.length>10
   ||b.recipientIds.some(x=>typeof x!=='string'||!x||x.length>140)||new Set(b.recipientIds).size!==b.recipientIds.length
   ||b.recipientIds.includes(user.id))fail(400,'Select 1–10 distinct other participants.');
  const selected=[user.id,...b.recipientIds as string[]].sort();
  const frozen=await db.prepare("SELECT 1 FROM account_key_migrations WHERE state='staged' AND user_id IN ("+selected.map(()=>'?').join(',')+") LIMIT 1")
   .bind(...selected).first();
  if(frozen)fail(409,'A recipient is upgrading encryption. Retry after migration.');
  const copies=checkCopies(b.copies,selected);
  const placeholders=selected.map(()=>'?').join(',');
  const members=await db.prepare(`SELECT COUNT(*) n FROM household_members WHERE household_id=? AND user_id IN (${placeholders})`)
   .bind(hid,...selected).first<{n:number}>();
  if(members?.n!==selected.length)fail(403,'A selected person is no longer in this care circle.');
  const retired=await db.prepare(`SELECT COUNT(*) n FROM profiles
   WHERE household_id=? AND archived_at IS NOT NULL AND linked_user_id IN (${placeholders})`)
   .bind(hid,...selected).first<{n:number}>();
  if(retired?.n)fail(409,'An archived profile is linked to this account. Restore it before starting a new shared space.');
  const keys=await db.prepare(`SELECT user_id,public_jwk FROM message_device_keys WHERE user_id IN (${placeholders})`)
   .bind(...selected).all<{user_id:string,public_jwk:string}>();
  if(keys.results.length!==selected.length||!matchesKeyRoster(b.publicKeys,keys.results.map(k=>({id:k.user_id,publicKey:JSON.parse(k.public_jwk)}))))
   fail(409,'A recipient key changed or is missing. Refresh people and re-encrypt.');
  const hash=await digest(sid+':'+user.id+':'+kind+':'+JSON.stringify(selected.map(uid=>[uid,copies[uid]])));
  // A successful request may lose its HTTP response. Retry with identical
  // ciphertext/IDs rather than silently creating a duplicate shared space.
  const exists=await db.prepare(`SELECT s.household_id,s.created_by,s.initial_kind,s.deleted_at,
   p.id post_id,p.body_hash FROM shared_word_spaces s
   JOIN shared_word_posts p ON p.space_id=s.id AND p.kind=s.initial_kind
   WHERE s.id=?`).bind(sid)
   .first<{household_id:string,created_by:string,initial_kind:string,deleted_at:string|null,post_id:string,body_hash:string}>();
  if(exists){
   if(exists.deleted_at)fail(409,'This shared space was removed and cannot be recreated with the same identifier.');
   if(exists.household_id===hid&&exists.created_by===user.id&&exists.initial_kind===kind&&exists.post_id===postId&&exists.body_hash===hash)
    return respond({id:sid,created:true,replayed:true});
   fail(409,'This identifier belongs to another shared space.');
  }
  const time=new Date().toISOString();
  try{await db.batch([
   db.prepare('INSERT INTO shared_word_spaces(id,household_id,created_by,initial_kind,created_at) VALUES(?,?,?,?,?)').bind(sid,hid,user.id,kind,time),
   ...selected.map(uid=>db.prepare('INSERT INTO shared_word_participants(space_id,user_id,joined_at) VALUES(?,?,?)').bind(sid,uid,time)),
   ...postStatements(db,postId,sid,user.id,kind,copies,selected,time,hash),
   ...activityStatements(db,selected,user.id,hid,sid,postId,'shared',time)
  ]);}catch{fail(409,'Could not create shared space. Refresh and retry.');}
  notifyPrivateRecipients(env,ctx,hid,selected.filter(uid=>uid!==user.id));
  return respond({id:sid,created:true},201);
 }
 // Completed encrypted recovery history is intentionally immutable.
 // A removed post is inaccessible in live Words, not cryptographically erased.
 const deletePost=path.match(/^\/api\/words\/spaces\/([0-9a-f-]{36})\/posts\/([0-9a-f-]{36})$/i);
 if(deletePost&&req.method==='DELETE'){
  const sid=id(deletePost[1]),pid=id(deletePost[2]);
  await spaceFor(db,sid,user.id);
  const post=await db.prepare('SELECT author_id,kind,deleted_at FROM shared_word_posts WHERE space_id=? AND id=?')
   .bind(sid,pid).first<{author_id:string,kind:string,deleted_at:string|null}>();
  if(!post||post.deleted_at)fail(404,'Shared reply unavailable.');
  if(post.author_id!==user.id)fail(403,'Only the author can remove their reply.');
  if(post.kind!=='reflection'&&post.kind!=='discussion')fail(403,'Remove the original shared entry by removing its entire space.');
  const when=new Date().toISOString();
  await db.batch([
   db.prepare('UPDATE shared_word_posts SET deleted_at=? WHERE id=? AND deleted_at IS NULL').bind(when,pid),
   db.prepare("DELETE FROM private_word_activity WHERE source_kind='words' AND source_id=? AND post_id=?").bind(sid,pid)
  ]);
  return respond({removed:true,retainedEncryptedHistory:true});
 }
 const leave=path.match(/^\/api\/words\/spaces\/([0-9a-f-]{36})\/leave$/i);
 if(leave&&req.method==='POST'){
  const sid=id(leave[1]),space=await spaceFor(db,sid,user.id);
  if(space.created_by===user.id)fail(403,'Creators must remove their shared space for everyone.');
  const when=new Date().toISOString();
  await db.batch([
   db.prepare('UPDATE shared_word_participants SET left_at=? WHERE space_id=? AND user_id=? AND left_at IS NULL').bind(when,sid,user.id),
   db.prepare("DELETE FROM private_word_activity WHERE user_id=? AND household_id=? AND source_kind='words' AND source_id=?")
    .bind(user.id,space.household_id,sid)
  ]);
  return respond({left:true,retainedEncryptedHistory:true});
 }
 const match=path.match(/^\/api\/words\/spaces\/([0-9a-f-]{36})(?:\/posts)?$/i);
 if(match){
  const sid=id(match[1]),space=await spaceFor(db,sid,user.id);
  if(!path.endsWith('/posts')&&req.method==='DELETE'){
   if(space.created_by!==user.id)fail(403,'Only the creator can remove this space for everyone. You can leave it instead.');
   const b=await body(req);
   if(b.confirmation!=='DELETE SHARED SPACE')fail(400,'Confirm removal of the shared space.');
   const when=new Date().toISOString();
   await db.batch([
    db.prepare('UPDATE shared_word_spaces SET deleted_at=? WHERE id=? AND deleted_at IS NULL').bind(when,sid),
    db.prepare("DELETE FROM private_word_activity WHERE household_id=? AND source_kind='words' AND source_id=?")
     .bind(space.household_id,sid)
   ]);
   return respond({removed:true,retainedEncryptedHistory:true});
  }
  const people=await participants(db,sid),ids=people.map(p=>p.id).sort();
  if(path.endsWith('/posts')&&req.method==='POST'){
   const b=await body(req),postId=id(b.id),kind=b.kind;
   if(kind!=='reflection'&&kind!=='discussion')fail(400,'Choose a journal response or discussion reply.');
   if(ids.length<2||!ids.includes(user.id)||people.some(p=>!p.publicKey))fail(409,'A participant is unavailable for this shared space.');
   const frozen=await db.prepare("SELECT 1 FROM account_key_migrations WHERE state='staged' AND user_id IN ("+ids.map(()=>'?').join(',')+") LIMIT 1")
    .bind(...ids).first();
   if(frozen)fail(409,'A participant is upgrading encryption. Retry after migration.');
   if(!matchesKeyRoster(b.publicKeys,people))
    fail(409,'A participant key changed. Refresh this shared space before replying.');
   const copies=checkCopies(b.copies,ids);
   const hash=await digest(sid+':'+user.id+':'+kind+':'+JSON.stringify(ids.map(uid=>[uid,copies[uid]])));
   const prior=await db.prepare('SELECT space_id,author_id,kind,body_hash,deleted_at FROM shared_word_posts WHERE id=?')
    .bind(postId).first<{space_id:string,author_id:string,kind:string,body_hash:string,deleted_at:string|null}>();
   if(prior){
    if(prior.deleted_at)fail(409,'This reply was removed and cannot be reposted.');
    if(prior.space_id!==sid||prior.author_id!==user.id||prior.kind!==kind||prior.body_hash!==hash)fail(409,'Entry identifier belongs to another submission.');
    return respond({id:postId,accepted:true,replayed:true});
   }
   const time=new Date().toISOString();
   try{await db.batch([
    ...postStatements(db,postId,sid,user.id,kind,copies,ids,time,hash),
    ...activityStatements(db,ids,user.id,space.household_id,sid,postId,'reply',time)
   ]);}catch{fail(409,'Could not post to this space. Refresh before retrying.');}
   notifyPrivateRecipients(env,ctx,space.household_id,ids.filter(uid=>uid!==user.id));
   return respond({id:postId,accepted:true},201);
  }
  if(!path.endsWith('/posts')&&req.method==='GET'){
   const result=await db.prepare(`SELECT p.id,p.author_id,p.kind,p.created_at,COALESCE(rc.envelope_json,mc.envelope_json,c.envelope_json) envelope_json FROM shared_word_posts p
    JOIN shared_word_copies c ON c.post_id=p.id AND c.recipient_id=?
    LEFT JOIN account_migrated_copies mc ON mc.source_kind='words' AND mc.source_id=p.id AND mc.user_id=c.recipient_id AND EXISTS(SELECT 1 FROM account_key_migrations mig WHERE mig.user_id=c.recipient_id AND mig.state='complete')
    LEFT JOIN account_recovery_rotation_copies rc ON rc.source_kind='words' AND rc.source_id=p.id
     AND rc.rotation_id=(SELECT rotation_id FROM account_recovery_rotations WHERE user_id=c.recipient_id AND state='complete' ORDER BY completed_at DESC,rowid DESC LIMIT 1)
    WHERE p.space_id=? AND p.deleted_at IS NULL ORDER BY p.created_at,p.id LIMIT 300`).bind(user.id,sid)
    .all<{id:string,author_id:string,kind:string,created_at:string,envelope_json:string}>();
   return respond({id:sid,kind:space.initial_kind,createdBy:space.created_by,participants:people,
    posts:(result.results||[]).map(p=>({id:p.id,authorId:p.author_id,kind:p.kind,createdAt:p.created_at,envelope:JSON.parse(p.envelope_json)}))});
  }
 }
 if(path==='/api/activity'&&req.method==='GET'){
  const hid=householdId(url.searchParams.get('householdId'));await member(db,hid,user.id);
  const rows=await db.prepare(`SELECT id,source_kind,source_id,event_kind,created_at FROM private_word_activity
   WHERE user_id=? AND household_id=? AND seen_at IS NULL ORDER BY created_at DESC LIMIT 100`)
   .bind(user.id,hid).all<{id:string,source_kind:string,source_id:string,event_kind:string,created_at:string}>();
  const count=await db.prepare(`SELECT source_kind,COUNT(*) n FROM private_word_activity
   WHERE user_id=? AND household_id=? AND seen_at IS NULL GROUP BY source_kind`)
   .bind(user.id,hid).all<{source_kind:'words'|'direct',n:number}>();
  const counts={words:0,direct:0};
  for(const r of count.results||[])counts[r.source_kind]=r.n;
  return respond({events:(rows.results||[]).map(r=>({id:r.id,sourceKind:r.source_kind,sourceId:r.source_id,eventKind:r.event_kind,createdAt:r.created_at})),counts});
 }
 if(path==='/api/activity/seen'&&req.method==='POST'){
  const b=await body(req),hid=householdId(b.householdId),sid=id(b.sourceId);
  if(b.sourceKind!=='words'&&b.sourceKind!=='direct')fail(400,'Invalid source.');
  await member(db,hid,user.id);
  if(b.sourceKind==='words')await spaceFor(db,sid,user.id);
  else{
   const row=await db.prepare(`SELECT 1 FROM direct_threads t
    JOIN direct_thread_members m ON m.thread_id=t.id AND m.user_id=?
    WHERE t.id=? AND t.household_id=?`).bind(user.id,sid,hid).first();
   if(!row)fail(404,'Conversation unavailable.');
  }
  await db.prepare(`UPDATE private_word_activity SET seen_at=? WHERE user_id=? AND household_id=?
   AND source_kind=? AND source_id=? AND seen_at IS NULL`)
   .bind(new Date().toISOString(),user.id,hid,b.sourceKind,sid).run();
  return respond({acknowledged:true});
 }
 fail(404,'Words route unavailable.');
}
export async function handleWordSpaces(req:Request,env:CareEnv,user:SessionUser,ctx:ExecutionContext):Promise<Response>{
 try{return await route(req,env,user,ctx);}
 catch(e){if(e instanceof WordsError)return respond({error:e.message},e.status);throw e;}
}
