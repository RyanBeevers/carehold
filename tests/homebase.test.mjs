import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {careBridge,summarizeCare,LINK_MS} from '../worker/homebase.ts';
const origin='http://localhost:8793',secret='a'.repeat(64),challenge='b'.repeat(64),at=Date.parse('2026-11-28T15:00:00Z');
const parent={userId:'adult',sessionId:'s-adult'},local={Origin:origin,'X-Carehold-Request':'1'},remote={Authorization:'Bearer '+secret};
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const id of ['adult','minor','other']){
  db.prepare('INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,id,id+'@example.invalid',at,at);
  db.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').run('s-'+id,at+3600000,'t-'+id,at,at,id);
  db.prepare('INSERT INTO passkey(id,publicKey,userId,credentialID,counter,deviceType,backedUp) VALUES(?,?,?,?,?,?,?)').run('pk-'+id,'fixture',id,'cred-'+id,0,'singleDevice',0);
 }
 db.exec("INSERT INTO households(id,name,timezone,created_by,created_at) VALUES('circle','Fictional','UTC','adult','now'),('other-circle','Other','UTC','other','now');INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES('circle','adult','owner','now'),('circle','minor','member','now'),('other-circle','other','owner','now');INSERT INTO household_member_classes(household_id,user_id,classification,updated_at) VALUES('circle','adult','adult','now'),('circle','minor','teen','now'),('other-circle','other','adult','now')");
 const D1={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};}};
 const readCalls=[];
 const call=(action,b,headers=remote,actor=null,now=at)=>careBridge(new Request(origin+'/api/homebase/'+action,{method:'POST',headers,body:JSON.stringify(b)}),D1,secret,origin,async()=>actor,async(h,u)=>{readCalls.push([h,u]);return {entries:[{event:null,dueAt:'2026-11-28T14:00:00Z',medicationName:'private'},{event:{note:'private'},dueAt:'2026-11-28T14:00:00Z'},{event:null,dueAt:'2026-11-28T18:00:00Z'}]};},now);
 return {db,call,readCalls};
}
async function link(call){const a=await call('authorize',{householdId:'circle',challenge},local,parent);assert.equal(a.status,201);const {code}=await a.json();const r=await call('redeem',{challenge,code});assert.equal(r.status,200);const x=await r.json();return {proof:{linkId:x.id,householdId:x.householdId,userId:x.userId},code};}
test('requires own adult source session, passkey, exact origin and membership; returns only authorized aggregate',async()=>{
 const {db,call,readCalls}=setup();
 assert.equal((await call('authorize',{householdId:'circle',challenge},local)).status,401);
 assert.equal((await call('authorize',{householdId:'circle',challenge},{...local,Origin:'https://wrong.invalid'},parent)).status,403);
 assert.equal((await call('authorize',{householdId:'circle',challenge},local,{userId:'minor',sessionId:'s-minor'})).status,403);
 assert.equal((await call('authorize',{householdId:'other-circle',challenge},local,parent)).status,403);
 const {proof,code}=await link(call);
 assert.equal((await call('redeem',{challenge,code})).status,404);
 assert.equal((await call('summary',proof,{})).status,401);
 assert.equal((await call('summary',{...proof,userId:'other'})).status,404);
 assert.deepEqual(await (await call('summary',proof)).json(),{scheduled:3,unrecordedDue:1,expiresAt:at+LINK_MS});
 assert.deepEqual(readCalls,[['circle','adult']]);
 for(const action of ['journal','messages','record','history','recovery'])assert.equal((await call(action,proof)).status,404);
 assert.equal((await call('revoke',{householdId:'circle'},local,parent)).status,200);
 assert.equal((await call('summary',proof)).status,404);
 db.close();
});
test('lease expires, source logout removes link, and passkey or membership loss denies reads',async()=>{
 for(const action of ['expiry','logout','passkey','membership','classification']){
  const {db,call}=setup();const {proof}=await link(call);
  if(action==='logout')db.exec("DELETE FROM session WHERE id='s-adult'");
  if(action==='passkey')db.exec("DELETE FROM passkey WHERE userId='adult'");
  if(action==='membership')db.exec("DELETE FROM household_members WHERE user_id='adult'");
  if(action==='classification')db.exec("UPDATE household_member_classes SET classification='teen' WHERE user_id='adult'");
  assert.equal((await call('summary',proof,remote,null,action==='expiry'?at+LINK_MS:at)).status,404,action);db.close();
 }
});
test('unrecorded is not missed, future or DST-invalid due times are not counted',()=>{
 assert.deepEqual(summarizeCare({entries:[{event:null,dueAt:null},{event:null,dueAt:'2026-11-28T15:00:00Z'},{event:{event_type:'refused'},dueAt:'2026-11-28T13:00:00Z'},{event:null,dueAt:'2026-11-28T16:00:00Z'}]},at),{scheduled:4,unrecordedDue:1});
 const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
 assert.match(worker,/\(h,u\)=>readToday\(db,h,u\)/);
 assert.match(worker,/return json\(await readToday\(db,required/);
});
