import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity} from '../src/lib/message-recovery.ts';
import {readSyncedDraft,saveSyncedDraft,deleteSyncedDraft} from '../src/lib/recoverable-drafts.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');

test('draft remains ciphertext and is recovered on another browser key import',async()=>{
 const uid='fictional-user',scope='fictional-household:discussion:00000000-0000-4000-8000-000000000031';
 const fresh=await createMessageRecoveryIdentity(uid);
 const recovered=await openMessageRecoveryIdentity(uid,fresh.recoveryCode,fresh.envelope);
 assert.ok(fresh.identity.journalKey&&recovered.journalKey);
 const current=new Map(),requests=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(path,options={})=>{
  const method=options.method||'GET',key=String(path);
  if(method==='GET')return new Response(JSON.stringify(current.get(key)??{revision:0,document:null,deleted:false,savedAt:null}));
  const payload=JSON.parse(options.body);
  requests.push(payload);
  const existing=current.get(key),revision=existing?.revision??0;
  if(payload.expectedRevision!==revision)
   return new Response(JSON.stringify({error:'A newer draft exists on another device.'}),{status:409});
  if(method==='PUT'){
   current.set(key,{revision:revision+1,document:{iv:payload.iv,ciphertext:payload.ciphertext},savedAt:123,deleted:false});
   return new Response(JSON.stringify({revision:revision+1,savedAt:123}));
  }
  if(method==='DELETE'){
   current.set(key,{revision:revision+1,document:null,savedAt:123,deleted:true});
   return new Response(JSON.stringify({deleted:true,revision:revision+1}));
  }
  throw new Error('Unexpected method.');
 };
 try{
  const doc={text:'An invented unsent note',prompt:'Fictional question?',title:'Local fiction'};
  assert.deepEqual(await readSyncedDraft(uid,scope,fresh.identity.journalKey),{revision:0,document:null,deleted:false,savedAt:null});
  assert.equal((await saveSyncedDraft(uid,scope,fresh.identity.journalKey,doc,0)).revision,1);
  assert.equal(JSON.stringify(requests).includes(doc.text),false);
  assert.equal(JSON.stringify(requests).includes(doc.title),false);
  assert.deepEqual((await readSyncedDraft(uid,scope,recovered.journalKey)).document,doc);
  const other=await createMessageRecoveryIdentity('different');
  await assert.rejects(readSyncedDraft(uid,scope,other.identity.journalKey));
  await assert.rejects(saveSyncedDraft(uid,scope,recovered.journalKey,doc,0),/newer draft/);
  assert.equal((await saveSyncedDraft(uid,scope,recovered.journalKey,{...doc,text:'Updated fiction'},1)).revision,2);
  assert.deepEqual((await readSyncedDraft(uid,scope,recovered.journalKey)).document,{...doc,text:'Updated fiction'});
  await deleteSyncedDraft(uid,scope,recovered.journalKey,2);
  assert.deepEqual((await readSyncedDraft(uid,scope,recovered.journalKey)).document,null);
 }finally{globalThis.fetch=original;}
});
