import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity} from '../src/lib/message-recovery.ts';
import {saveSyncedPrivateJournal,listSyncedPrivateJournal,deleteSyncedPrivateJournal} from '../src/lib/synced-private-journal.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');

test('saved private writing is ciphertext-only, recovered on another device, with optimistic conflicts',async()=>{
 const uid='fictional-user',hid='fictional-household';
 const fresh=await createMessageRecoveryIdentity(uid);
 const second=await openMessageRecoveryIdentity(uid,fresh.recoveryCode,fresh.envelope);
 assert.ok(second.journalKey);
 const id='00000000-0000-4000-8000-000000000081';
 const store=new Map();
 const originalFetch=globalThis.fetch;
 const seen=[];
 globalThis.fetch=async(url,options={})=>{
  const method=options.method||'GET';
  if(method==='PUT'){
   const data=JSON.parse(options.body);
   seen.push(data);
   const before=store.get(id);
   if((before?.revision??0)!==data.expectedRevision)
    return new Response(JSON.stringify({error:'Version conflict'}),{status:409});
   const revision=data.expectedRevision+1;
   store.set(id,{id,revision,iv:data.iv,ciphertext:data.ciphertext,createdAt:1,updatedAt:revision});
   return new Response(JSON.stringify({id,revision,createdAt:1,updatedAt:revision}));
  }
  if(method==='DELETE'){
   const data=JSON.parse(options.body);
   const before=store.get(id);
   if(!before||before.revision!==data.expectedRevision)
    return new Response(JSON.stringify({error:'Version conflict'}),{status:409});
   store.delete(id);
   return new Response(JSON.stringify({deleted:true}));
  }
  if(method==='GET'){
   const items=[...store.values()];
   return new Response(JSON.stringify({entries:items,hasMore:false}));
  }
  return new Response('{}',{status:405});
 };
 try{
  const entry={id,text:'Fictional private journal content',prompt:'Fictional prompt?',title:'My private title'};
  const one=await saveSyncedPrivateJournal(uid,hid,fresh.identity.journalKey,entry);
  assert.equal(one.revision,1);
  assert.equal(store.size,1);
  assert.equal(JSON.stringify(seen).includes(entry.text),false);
  assert.equal(JSON.stringify(seen).includes(entry.title),false);
  const copy=await listSyncedPrivateJournal(uid,hid,second.journalKey);
  assert.equal(copy.length,1);
  assert.equal(copy[0].text,entry.text);
  assert.equal(copy[0].title,entry.title);
  await assert.rejects(saveSyncedPrivateJournal(uid,hid,fresh.identity.journalKey,{...entry,text:'stale'},0),/Version conflict/);
  const changed=await saveSyncedPrivateJournal(uid,hid,second.journalKey,{...entry,text:'New text'},1);
  assert.equal(changed.revision,2);
  const alien=await createMessageRecoveryIdentity('other-user');
  await assert.rejects(listSyncedPrivateJournal(uid,hid,alien.identity.journalKey));
  await assert.rejects(deleteSyncedPrivateJournal(uid,hid,second.journalKey,id,1),/Version conflict/);
  await deleteSyncedPrivateJournal(uid,hid,second.journalKey,id,2);
  assert.deepEqual(await listSyncedPrivateJournal(uid,hid,second.journalKey),[]);
 }finally{globalThis.fetch=originalFetch;}
});
