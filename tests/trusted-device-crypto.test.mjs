import test from 'node:test';
import assert from 'node:assert/strict';
import {newTransferKeyPair,pairingNumber,sealTransferCode,openTransferCode,validTransferEnvelope,assertSameTransferKey} from '../src/lib/trusted-device-crypto.ts';

const ACCOUNT='00000000-0000-4000-8000-000000000001';
const REQUEST='00000000-0000-4000-8000-000000000002';
const CODE='CH1-'+'A'.repeat(43);

test('trusted device recovery moves only authenticated ciphertext, not a plaintext recovery code',async()=>{
 const recipient=await newTransferKeyPair(),account=await newTransferKeyPair();
 assert.equal(recipient.privateKey.extractable,false);
 const sealed=await sealTransferCode(ACCOUNT,REQUEST,recipient.publicKey,account.publicKey,CODE);
 assert.equal(validTransferEnvelope(sealed),true);
 assert.ok(!JSON.stringify(sealed).includes(CODE));
 assert.equal(await openTransferCode(ACCOUNT,REQUEST,recipient,account.publicKey,sealed),CODE);
 assert.equal(await pairingNumber(ACCOUNT,REQUEST,recipient.publicKey),
  await pairingNumber(ACCOUNT,REQUEST,recipient.publicKey));
 assert.match(await pairingNumber(ACCOUNT,REQUEST,recipient.publicKey),/^\d{4} \d{4}$/);
});

test('device recovery rejects the wrong account, request, ephemeral recipient, or account public key',async()=>{
 const target=await newTransferKeyPair(),other=await newTransferKeyPair(),account=await newTransferKeyPair(),alteredAccount=await newTransferKeyPair();
 const sealed=await sealTransferCode(ACCOUNT,REQUEST,target.publicKey,account.publicKey,CODE);
 await assert.rejects(()=>openTransferCode('different-user',REQUEST,target,account.publicKey,sealed));
 await assert.rejects(()=>openTransferCode(ACCOUNT,'00000000-0000-4000-8000-000000000003',target,account.publicKey,sealed));
 await assert.rejects(()=>openTransferCode(ACCOUNT,REQUEST,other,account.publicKey,sealed));
 await assert.rejects(()=>openTransferCode(ACCOUNT,REQUEST,target,alteredAccount.publicKey,sealed));
 assert.throws(()=>assertSameTransferKey(target.publicKey,other.publicKey));
});

test('malformed ciphertext and unsupported transfer envelope versions fail closed',async()=>{
 const target=await newTransferKeyPair(),account=await newTransferKeyPair();
 const sealed=await sealTransferCode(ACCOUNT,REQUEST,target.publicKey,account.publicKey,CODE);
 assert.equal(validTransferEnvelope({...sealed,v:2}),false);
 assert.equal(validTransferEnvelope({...sealed,ct:'bad'}),false);
 assert.equal(validTransferEnvelope({...sealed,salt:'invalid'}),false);
 const tampered={...sealed,ct:sealed.ct.slice(0,-1)+(sealed.ct.endsWith('A')?'B':'A')};
 await assert.rejects(()=>openTransferCode(ACCOUNT,REQUEST,target,account.publicKey,tampered));
 await assert.rejects(()=>sealTransferCode(ACCOUNT,REQUEST,target.publicKey,account.publicKey,'not a recovery code'));
});

test('the eight-digit comparison code binds the candidate identity and request, and is never a login or recovery key',async()=>{
 const first=await newTransferKeyPair(),second=await newTransferKeyPair();
 const code=await pairingNumber(ACCOUNT,REQUEST,first.publicKey);
 assert.notEqual(code,await pairingNumber(ACCOUNT,REQUEST,second.publicKey));
 assert.notEqual(code,await pairingNumber(ACCOUNT,'00000000-0000-4000-8000-000000000003',first.publicKey));
 assert.ok(!code.startsWith('CH1-'));
});
