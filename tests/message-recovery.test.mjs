import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,validMessageRecoveryEnvelope} from '../src/lib/message-recovery.ts';
import {seal,unseal} from '../src/lib/message-crypto.ts';
import {validStoredRecoveryEnvelope} from '../worker/message-recovery-policy.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');

const id='fictional-user-001';
const thread='00000000-0000-4000-8000-000000000001';
const msg='00000000-0000-4000-8000-000000000002';

test('account recovery uses an independently held high-entropy secret, not login',async()=>{
 const a=await createMessageRecoveryIdentity(id);
 const b=await createMessageRecoveryIdentity(id);
 assert.match(a.recoveryCode,/^CH1-[A-Za-z0-9_-]{43}$/);
 assert.notEqual(a.recoveryCode,b.recoveryCode);
 assert.equal(a.identity.privateKey.extractable,false);
 assert.ok(validMessageRecoveryEnvelope(a.envelope));
 assert.ok(validStoredRecoveryEnvelope(a.envelope));
 assert.equal(JSON.stringify(a.envelope).includes(a.recoveryCode),false);
 assert.equal(JSON.stringify(a.envelope).includes('"d":'),false);
 const restored=await openMessageRecoveryIdentity(id,a.recoveryCode,a.envelope);
 assert.equal(restored.privateKey.extractable,false);
 assert.deepEqual(restored.publicKey,a.identity.publicKey);
 const body={kind:'message',text:'fictional recovery test'};
 const ciphertext=await seal(body,a.identity.publicKey,thread,msg,id);
 assert.deepEqual(await unseal(ciphertext,restored.privateKey,thread,msg,id),body);
});

test('wrong code, user context, public key and corrupted ciphertext fail closed',async()=>{
 const a=await createMessageRecoveryIdentity(id);
 const b=await createMessageRecoveryIdentity('another-user');
 await assert.rejects(openMessageRecoveryIdentity(id,b.recoveryCode,a.envelope));
 await assert.rejects(openMessageRecoveryIdentity('another-user',a.recoveryCode,a.envelope));
 await assert.rejects(openMessageRecoveryIdentity(id,a.recoveryCode,{...a.envelope,publicKey:b.identity.publicKey}));
 await assert.rejects(openMessageRecoveryIdentity(id,a.recoveryCode,{...a.envelope,ct:a.envelope.ct.replace(/^./,c=>c==='a'?'b':'a')}));
 await assert.rejects(openMessageRecoveryIdentity(id,'not-a-code',a.envelope));
});

test('worker rejects malformed recovery metadata and injected plaintext/private keys',async()=>{
 const a=await createMessageRecoveryIdentity(id);
 assert.equal(validStoredRecoveryEnvelope({...a.envelope,plaintext:'secret'}),false);
 assert.equal(validStoredRecoveryEnvelope({...a.envelope,recoveryCode:a.recoveryCode}),false);
 assert.equal(validStoredRecoveryEnvelope({...a.envelope,privateJwk:{d:'secret'}}),false);
 assert.equal(validStoredRecoveryEnvelope({...a.envelope,iv:'wrong'}),false);
 assert.equal(validStoredRecoveryEnvelope({...a.envelope,v:1}),false);
 assert.equal(validStoredRecoveryEnvelope(null),false);
});
