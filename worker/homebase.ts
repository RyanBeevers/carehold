// Narrow, read-only bridge. No Carehold session bearer, key or clinical record is exported.
const valid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const identity=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export const LINK_MS=600_000;
type Session={userId:string;sessionId:string};
type Summary={scheduled:number;unrecordedDue:number};
type Today={entries:{event:unknown;dueAt:string|null}[]};
export function summarizeCare(today:Today,at:number):Summary{
 return {scheduled:today.entries.length,unrecordedDue:today.entries.filter(e=>e.event===null&&e.dueAt!==null&&Date.parse(e.dueAt)<=at).length};
}
type Statement={bind(...v:unknown[]):Statement;first<T>():Promise<T|null>;run():Promise<unknown>};
export type CareBridgeDb={prepare(sql:string):Statement};
async function permitted(db:CareBridgeDb,householdId:string,userId:string,sessionId:string,at:number){
 // Source session is checked without extending it; automatic source-tab locks
 // are separate from browser-wide session revocation. This is an explicit
 // short-lived summary grant, not an unlocked Carehold session.
 const row=await db.prepare(`SELECT s.expiresAt AS expiresAt FROM session s JOIN household_members m ON m.user_id=s.userId
 JOIN household_member_classes c ON c.household_id=m.household_id AND c.user_id=m.user_id
 WHERE s.id=? AND s.userId=? AND m.household_id=? AND c.classification='adult'
 AND EXISTS(SELECT 1 FROM passkey p WHERE p.userId=s.userId)
 AND NOT EXISTS(SELECT 1 FROM household_member_classes c2 WHERE c2.user_id=s.userId AND c2.classification IN ('child','teen'))`).bind(sessionId,userId,householdId).first<{expiresAt:number|string}>();
 if(!row)return false;
 const expiry=typeof row.expiresAt==='number'?row.expiresAt:Date.parse(row.expiresAt);
 return Number.isFinite(expiry)&&expiry>at;
}
export async function careBridge(req:Request,db:CareBridgeDb,secret:string|undefined,origin:string,session:()=>Promise<Session|null>,readToday:(h:string,u:string)=>Promise<Today>,at=Date.now()){
 const path=new URL(req.url).pathname;
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(!valid(secret))return json({error:'Integration disabled'},503);
 const local=/^\/api\/homebase\/(authorize|revoke)$/.exec(path),action=path.slice('/api/homebase/'.length);
 let actor:Session|null=null;
 if(local){
  if(new URL(req.url).origin!==origin||req.headers.get('origin')!==origin||req.headers.get('x-carehold-request')!=='1')return json({error:'Untrusted origin'},403);
  actor=await session().catch(()=>null);if(!actor)return json({error:'Sign in to Carehold'},401);
 }else if(!equal(req.headers.get('Authorization')||'','Bearer '+secret))return json({error:'Unauthorized'},401);
 let b:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>4096)return json({error:'Request too large'},413);const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();b=value as Record<string,unknown>;}catch{return json({error:'Invalid request'},400);}
 if(actor&&action==='authorize'){
  if(!identity(b.householdId)||!valid(b.challenge))return json({error:'Invalid challenge'},400);
  if(!await permitted(db,b.householdId,actor.userId,actor.sessionId,at))return json({error:'Adult care circle membership and a current Carehold session with a passkey are required'},403);
  const code=token(),id=token();
  await db.prepare('INSERT INTO homebase_care_links(id,household_id,user_id,session_id,challenge_hash,code_hash,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,b.householdId,actor.userId,actor.sessionId,await hash(b.challenge),await hash(code),at+LINK_MS).run();
  return json({code,expiresAt:at+LINK_MS},201);
 }
 if(actor&&action==='revoke'){
  if(!identity(b.householdId))return json({error:'Invalid care circle'},400);
  await db.prepare('UPDATE homebase_care_links SET revoked_at=? WHERE user_id=? AND household_id=? AND revoked_at IS NULL').bind(at,actor.userId,b.householdId).run();
  return json({ok:true});
 }
 if(local)return json({error:'Not found'},404);
 if(action==='health'){await db.prepare('SELECT id FROM homebase_care_links LIMIT 1').first();return json({ok:true});}
 if(action==='redeem'){
  if(!valid(b.challenge)||!valid(b.code))return json({error:'Invalid proof'},400);
  const c=await hash(b.challenge),k=await hash(b.code);
  const row=await db.prepare('SELECT id,household_id AS householdId,user_id AS userId,session_id AS sessionId,expires_at AS expiresAt FROM homebase_care_links WHERE challenge_hash=? AND code_hash=? AND expires_at>? AND redeemed_at IS NULL AND revoked_at IS NULL').bind(c,k,at).first<{id:string;householdId:string;userId:string;sessionId:string;expiresAt:number}>();
  if(!row||!await permitted(db,row.householdId,row.userId,row.sessionId,at))return json({error:'Proof unavailable'},404);
  const claimed=await db.prepare('UPDATE homebase_care_links SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>? RETURNING id').bind(at,row.id,at).first();
  return claimed?json({id:row.id,householdId:row.householdId,userId:row.userId,expiresAt:row.expiresAt}):json({error:'Proof unavailable'},404);
 }
 if(action==='summary'){
  if(!valid(b.linkId)||!identity(b.householdId)||!identity(b.userId))return json({error:'Invalid link'},400);
  const row=await db.prepare('SELECT session_id AS sessionId,expires_at AS expiresAt FROM homebase_care_links WHERE id=? AND household_id=? AND user_id=? AND redeemed_at IS NOT NULL AND revoked_at IS NULL AND expires_at>?').bind(b.linkId,b.householdId,b.userId,at).first<{sessionId:string;expiresAt:number}>();
  if(!row||!await permitted(db,b.householdId,b.userId,row.sessionId,at))return json({error:'Link expired or revoked'},404);
  const summary=summarizeCare(await readToday(b.householdId,b.userId),at);
  // Recheck after the ledger query, so concurrent membership or session revocation fails closed.
  const still=await db.prepare('SELECT id FROM homebase_care_links WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(b.linkId,at).first();
  if(!still||!await permitted(db,b.householdId,b.userId,row.sessionId,at))return json({error:'Link expired or revoked'},404);
  return json({...summary,expiresAt:row.expiresAt});
 }
 return json({error:'Not found'},404);
}
