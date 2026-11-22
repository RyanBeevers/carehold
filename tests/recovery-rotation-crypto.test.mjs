import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMessageRecoveryIdentity} from '../src/lib/message-recovery.ts';
import {reencryptSyncedJournalEntry,verifyStagedSyncedJournalEntry} from '../src/lib/synced-private-journal.ts';
import {draftScopeToken,reencryptSyncedDraft,verifyStagedSyncedDraft} from '../src/lib/recoverable-drafts.ts';

globalThis.btoa=value=>Buffer.from(value,'binary').toString('base64');
globalThis.atob=value=>Buffer.from(value,'base64').toString('binary');
const enc=new TextEncoder();
const uid='fictional-person',hid='00000000-0000-4000-8000-000000000001';
const entryId='00000000-0000-4000-8000-000000000002';
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function encrypted(key,data,aad){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const raw=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},
  key,enc.encode(JSON.stringify(data)));
 return {iv:b64(iv),ciphertext:b64(new Uint8Array(raw))};
}

test('old device can verify journal re-encryption without exporting private or journal keys',async()=>{
 const old=await createMessageRecoveryIdentity(uid),next=await createMessageRecoveryIdentity(uid);
 const data={text:'Only fictional content',prompt:null,title:'A note',sharedAt:null,spaceId:null};
 const raw=await encrypted(old.identity.journalKey,data,
  'carehold-synced-private-journal-v1:'+uid+':'+hid+':'+entryId+':1');
 const source={id:entryId,revision:1,createdAt:1,updatedAt:2,...raw};
 const staged=await reencryptSyncedJournalEntry(uid,hid,source,old.identity.journalKey,next.identity.journalKey);
 assert.equal(staged.expectedRevision,1);
 assert.notEqual(staged.ciphertext,source.ciphertext);
 await verifyStagedSyncedJournalEntry(uid,hid,source,staged,old.identity.journalKey,next.identity.journalKey);
 await assert.rejects(verifyStagedSyncedJournalEntry(uid,hid,source,staged,next.identity.journalKey,old.identity.journalKey));
 assert.equal(old.identity.journalKey.extractable,false);
 assert.equal(next.identity.journalKey.extractable,false);
});

test('synced draft scope can be resolved then re-encrypted at the next revision',async()=>{
 const old=await createMessageRecoveryIdentity(uid),next=await createMessageRecoveryIdentity(uid);
 const scope=hid+':direct:'+entryId;
 const expected=createHash('sha256').update('carehold-draft-locator-v1:'+uid+':'+scope).digest('hex');
 assert.equal(await draftScopeToken(uid,scope),expected);
 const data={text:'Unsent imaginary draft',prompt:null,title:''};
 const row={revision:1,...await encrypted(old.identity.journalKey,data,'carehold-recoverable-draft-v1:'+uid+':'+scope+':1')};
 const staged=await reencryptSyncedDraft(uid,scope,row,old.identity.journalKey,next.identity.journalKey);
 assert.equal(staged.expectedRevision,1);
 await verifyStagedSyncedDraft(uid,scope,row,staged,old.identity.journalKey,next.identity.journalKey);
 await assert.rejects(verifyStagedSyncedDraft(uid,scope,row,{...staged,expectedRevision:99},old.identity.journalKey,next.identity.journalKey));
 await assert.rejects(reencryptSyncedDraft(uid,scope,{...row,revision:2},old.identity.journalKey,next.identity.journalKey));
});
