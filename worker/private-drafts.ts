import type {CareEnv,SessionUser} from './types';

const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const respond=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const SHA=/^[a-f0-9]{64}$/;
class DraftError extends Error{constructor(public status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new DraftError(status,message);}
async function payload(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();if(raw.length>14000)fail(413,'Encrypted draft is too large.');
 let b:unknown;try{b=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Invalid JSON payload.');
 return b as Record<string,unknown>;
}
function version(v:unknown){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>2147483600)fail(400,'Invalid draft revision.');
 return v as number;
}
async function route(req:Request,env:CareEnv,user:SessionUser){
 const url=new URL(req.url),match=url.pathname.match(/^\/api\/private-drafts\/([a-f0-9]{64})$/);
 if(!match||!SHA.test(match[1]))fail(404,'Draft not found.');
 const scope=match[1],hid=url.searchParams.get('householdId');
 if(!hid||hid.length>200)fail(400,'Select a care circle.');
 const db=env.DB,member=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?')
  .bind(hid,user.id).first();
 if(!member)fail(404,'Draft unavailable.');
 if(req.method==='GET'){
  const row=await db.prepare('SELECT revision,iv,ciphertext,updated_at,deleted_at FROM private_draft_sync WHERE user_id=? AND household_id=? AND scope_id=?')
   .bind(user.id,hid,scope).first<{revision:number,iv:string,ciphertext:string,updated_at:number,deleted_at:number|null}>();
  if(!row)return respond({revision:0,document:null,deleted:false,savedAt:null});
  const old=Date.now()-row.updated_at>90*86400000;
  return respond({revision:row.revision,document:row.deleted_at||old?null:{iv:row.iv,ciphertext:row.ciphertext},
   deleted:!!row.deleted_at,expired:old,savedAt:row.updated_at});
 }
 if(req.method==='PUT'){
  const b=await payload(req),expected=version(b.expectedRevision);
  if(typeof b.iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(b.iv)||
   typeof b.ciphertext!=='string'||b.ciphertext.length<22||b.ciphertext.length>9000||
   !/^[A-Za-z0-9_-]+$/.test(b.ciphertext))
   fail(400,'Invalid encrypted draft.');
  const now=Date.now();
  if(expected===0){
   const result=await db.prepare('INSERT INTO private_draft_sync(user_id,household_id,scope_id,revision,iv,ciphertext,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,household_id,scope_id) DO NOTHING')
    .bind(user.id,hid,scope,1,b.iv,b.ciphertext,now).run();
   if(result.meta.changes!==1)fail(409,'Another device created this draft. Compare both versions.');
   return respond({revision:1,savedAt:now},201);
  }
  const result=await db.prepare('UPDATE private_draft_sync SET revision=revision+1,iv=?,ciphertext=?,updated_at=?,deleted_at=NULL WHERE user_id=? AND household_id=? AND scope_id=? AND revision=?')
   .bind(b.iv,b.ciphertext,now,user.id,hid,scope,expected).run();
  if(result.meta.changes!==1)fail(409,'A newer draft exists on another device; nothing was overwritten.');
  return respond({revision:expected+1,savedAt:now});
 }
 if(req.method==='DELETE'){
  const b=await payload(req),expected=version(b.expectedRevision);
  if(expected===0){
   const exists=await db.prepare('SELECT 1 FROM private_draft_sync WHERE user_id=? AND household_id=? AND scope_id=?')
    .bind(user.id,hid,scope).first();
   if(exists)fail(409,'A draft changed on another device; do not silently discard it.');
   return respond({deleted:true,revision:0});
  }
  const now=Date.now();
  const result=await db.prepare('UPDATE private_draft_sync SET deleted_at=?,updated_at=?,revision=revision+1 WHERE user_id=? AND household_id=? AND scope_id=? AND revision=?')
   .bind(now,now,user.id,hid,scope,expected).run();
  if(result.meta.changes!==1)fail(409,'Draft changed on another device; nothing was discarded.');
  return respond({deleted:true,revision:expected+1});
 }
 fail(405,'Unsupported draft operation.');
}
export async function handlePrivateDrafts(req:Request,env:CareEnv,user:SessionUser){
 try{return await route(req,env,user);}catch(e){
  if(e instanceof DraftError)return respond({error:e.message},e.status);
  throw e;
 }
}
