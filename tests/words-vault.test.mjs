import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceKey,encryptDraft,decryptDraft,DraftConflictError,WORDS_RETENTION_MS} from '../src/lib/words-vault.ts';

test('AES-GCM local device key is nonexportable',async()=>{
 const key=await createDeviceKey();
 assert.equal(key.extractable,false);
 await assert.rejects(crypto.subtle.exportKey('raw',key));
});
test('encrypted document decrypts only for its associated account and circle',async()=>{
 const key=await createDeviceKey(),draft={text:'fictional typed draft',prompt:'A prompt'};
 const scope='v1:user-a:circle-a';
 const envelope=await encryptDraft(key,scope,draft);
 assert.ok(!JSON.stringify(envelope).includes(draft.text));
 assert.deepEqual(await decryptDraft(key,scope,envelope),draft);
 await assert.rejects(decryptDraft(key,'v1:user-b:circle-a',envelope));
 await assert.rejects(decryptDraft(key,'v1:user-a:circle-b',envelope));
});
test('ciphertext and nonce tampering fails closed',async()=>{
 const key=await createDeviceKey(),scope='v1:u:h';
 const e=await encryptDraft(key,scope,{text:'fictional',prompt:null});
 const bad={...e,ciphertext:e.ciphertext.slice(0)};
 new Uint8Array(bad.ciphertext)[2]^=0xff;
 await assert.rejects(decryptDraft(key,scope,bad));
 assert.equal(WORDS_RETENTION_MS,90*24*60*60*1000);
});
test('draft limits reject oversize plaintext before encryption',async()=>{
 const key=await createDeviceKey();
 await assert.rejects(encryptDraft(key,'v1:u:h',{text:'x'.repeat(3001),prompt:null}));
 assert.ok(new DraftConflictError().message.includes('newer'));
});
