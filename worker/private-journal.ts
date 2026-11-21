import type {CareEnv,SessionUser} from './types';

const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64=/^[A-Za-z0-9_-]+$/;
class JournalError extends Error{constructor(readonly status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new JournalError(status,message);}
function text(value:unknown,max=200):string{
 if(typeof value!=='string'||value.length===0||value.length>max)fail(400,'Invalid journal request.');
 return value as string;
}
async function body(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();
 if(raw.length>12000)fail(413,'Encrypted entry too large.');
 let item:unknown;try{item=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!item||typeof item!=='object'||Array.isArray(item))fail(400,'Invalid JSON.');
 return item as Record<string,unknown>;
}
async function assertMember(db:D1Database,hid:string,uid:string):Promise<void>{
 const member=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?')
  .bind(hid,uid).first();
 if(!member)fail(404,'Journal unavailable.');
}
function parseVersion(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483646)
  fail(400,'Invalid journal revision.');
 return value as number;
}
function parseCipher(value:Record<string,unknown>){
 const iv=value.iv,ciphertext=value.ciphertext;
 if(typeof iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(iv)||
  typeof ciphertext!=='string'||ciphertext.length<25||ciphertext.length>9000||!B64.test(ciphertext))
  fail(400,'Invalid encrypted journal entry.');
 return {iv:iv as string,ciphertext:ciphertext as string};
}
async function route(req:Request,env:CareEnv,user:SessionUser){
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 const hid=text(url.searchParams.get('householdId'));
 await assertMember(db,hid,user.id);
 if(path==='/api/private-journal'&&req.method==='GET'){
  const raw=url.searchParams.get('offset')||'0';
  if(!/^\d{1,5}$/.test(raw)||Number(raw)>10000)fail(400,'Invalid journal page.');
  const offset=Number(raw),limit=100;
  const result=await db.prepare(
   'SELECT entry_id,revision,iv,ciphertext,created_at,updated_at FROM private_journal_sync WHERE user_id=? AND household_id=? AND deleted_at IS NULL ORDER BY entry_id LIMIT ? OFFSET ?'
  ).bind(user.id,hid,limit+1,offset).all<{entry_id:string,revision:number,iv:string,ciphertext:string,created_at:number,updated_at:number}>();
  const rows=result.results||[];
  return send({entries:rows.slice(0,limit).map(row=>({id:row.entry_id,revision:row.revision,
   iv:row.iv,ciphertext:row.ciphertext,createdAt:row.created_at,updatedAt:row.updated_at})),hasMore:rows.length>limit});
 }
 const match=path.match(/^\/api\/private-journal\/([0-9a-f-]{36})$/i);
 if(!match||!ID.test(match[1]))fail(404,'Journal operation not found.');
 const id=match[1];
 if(req.method==='PUT'){
  const b=await body(req),expected=parseVersion(b.expectedRevision),cipher=parseCipher(b),now=Date.now();
  if(expected===0){
   const result=await db.prepare(
    'INSERT INTO private_journal_sync(user_id,household_id,entry_id,revision,iv,ciphertext,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,household_id,entry_id) DO NOTHING'
   ).bind(user.id,hid,id,1,cipher.iv,cipher.ciphertext,now,now).run();
   if(result.meta.changes!==1)fail(409,'An entry with this ID already exists. Refresh before editing.');
   return send({id,revision:1,createdAt:now,updatedAt:now},201);
  }
  const result=await db.prepare(
   'UPDATE private_journal_sync SET revision=revision+1,iv=?,ciphertext=?,updated_at=? WHERE user_id=? AND household_id=? AND entry_id=? AND revision=? AND deleted_at IS NULL'
  ).bind(cipher.iv,cipher.ciphertext,now,user.id,hid,id,expected).run();
  if(result.meta.changes!==1)fail(409,'This journal entry changed or was deleted on another device. Refresh before overwriting.');
  const row=await db.prepare('SELECT created_at FROM private_journal_sync WHERE user_id=? AND household_id=? AND entry_id=?')
   .bind(user.id,hid,id).first<{created_at:number}>();
  return send({id,revision:expected+1,createdAt:row!.created_at,updatedAt:now});
 }
 if(req.method==='DELETE'){
  const b=await body(req),expected=parseVersion(b.expectedRevision);
  if(!expected)fail(400,'Cannot delete an entry without its existing revision.');
  const updated=await db.prepare(
   'UPDATE private_journal_sync SET deleted_at=?,revision=revision+1,updated_at=? WHERE user_id=? AND household_id=? AND entry_id=? AND revision=? AND deleted_at IS NULL'
  ).bind(Date.now(),Date.now(),user.id,hid,id,expected).run();
  if(updated.meta.changes!==1)fail(409,'Journal changed on another device. Refresh before deleting.');
  return send({deleted:true});
 }
 fail(405,'Method not supported.');
}
export async function handlePrivateJournal(req:Request,env:CareEnv,user:SessionUser):Promise<Response>{
 try{return await route(req,env,user);}catch(e){
  if(e instanceof JournalError)return send({error:e.message},e.status);
  throw e;
 }
}
