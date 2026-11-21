import test from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal} from '../src/lib/message-crypto.ts';
import {sealWord,unsealWord} from '../src/lib/words-space-crypto.ts';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity} from '../src/lib/message-recovery.ts';
import {matchesKeyRoster} from '../worker/messages-policy.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');

const oldKey=async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {privateKey:pair.privateKey,publicKey:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y}};
};
test('legacy self-copy migrates without affecting an independently encrypted recipient copy',async()=>{
 const old=await oldKey(),other=await oldKey();
 const next=await createMessageRecoveryIdentity('alice');
 const ctx='00000000-0000-4000-8000-000000000011',id='00000000-0000-4000-8000-000000000012';
 const body={kind:'message',text:'Fictional message retained after device loss.'};
 const former=await seal(body,old.publicKey,ctx,id,'alice');
 const otherCopy=await seal(body,other.publicKey,ctx,id,'bob');
 const plain=await unseal(former,old.privateKey,ctx,id,'alice');
 const upgraded=await seal(plain,next.identity.publicKey,ctx,id,'alice');
 const verified=await unseal(upgraded,next.identity.privateKey,ctx,id,'alice');
 assert.deepEqual(verified,body);
 const recovered=await openMessageRecoveryIdentity('alice',next.recoveryCode,next.envelope);
 assert.deepEqual(await unseal(upgraded,recovered.privateKey,ctx,id,'alice'),body);
 await assert.rejects(unseal(former,recovered.privateKey,ctx,id,'alice'));
 assert.deepEqual(await unseal(former,old.privateKey,ctx,id,'alice'),body);
 assert.deepEqual(await unseal(otherCopy,other.privateKey,ctx,id,'bob'),body);
});
test('shared Words history survives independently of another participant identity',async()=>{
 const old=await oldKey(),next=await createMessageRecoveryIdentity('alice');
 const space='00000000-0000-4000-8000-000000000021',post='00000000-0000-4000-8000-000000000022';
 const words={kind:'journal',prompt:'Fictional example?',text:'Only invented writing.',title:'Fictional title'};
 const before=await sealWord(words,old.publicKey,space,post,'alice');
 const plain=await unsealWord(before,old.privateKey,space,post,'alice');
 const migrated=await sealWord(plain,next.identity.publicKey,space,post,'alice');
 const restored=await openMessageRecoveryIdentity('alice',next.recoveryCode,next.envelope);
 assert.deepEqual(await unsealWord(migrated,restored.privateKey,space,post,'alice'),words);
});
test('recipient key roster detects missing and stale encrypted recipients',async()=>{
 const alice=await oldKey(),bob=await oldKey(),rotated=await oldKey();
 const participants=[{id:'alice',publicKey:alice.publicKey},{id:'bob',publicKey:bob.publicKey}];
 assert.equal(matchesKeyRoster({alice:alice.publicKey,bob:bob.publicKey},participants),true);
 assert.equal(matchesKeyRoster({alice:alice.publicKey,bob:rotated.publicKey},participants),false);
 assert.equal(matchesKeyRoster({alice:alice.publicKey},participants),false);
 assert.equal(matchesKeyRoster({...Object.fromEntries(participants.map(x=>[x.id,x.publicKey])),outsider:rotated.publicKey},participants),false);
});
