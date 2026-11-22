import test from 'node:test';
import assert from 'node:assert/strict';
import {newDeviceSigningPair,signDeviceAuthorization,verifyDeviceAuthorization} from '../src/lib/trusted-device-proof.ts';

const USER='00000000-0000-4000-8000-000000000001';
const DEVICE='00000000-0000-4000-8000-000000000002';
const REQUEST='00000000-0000-4000-8000-000000000003';
const OTHER='00000000-0000-4000-8000-000000000004';
const PROOF='A'.repeat(43);

test('an enrolled device has its own nonexportable approval signing key',async()=>{
 const device=await newDeviceSigningPair();
 assert.equal(device.privateKey.extractable,false);
 assert.equal(device.privateKey.algorithm.name,'ECDSA');
 await assert.rejects(()=>crypto.subtle.exportKey('pkcs8',device.privateKey));
 const signature=await signDeviceAuthorization(device.privateKey,USER,DEVICE,PROOF,'approve',REQUEST);
 assert.match(signature,/^[A-Za-z0-9_-]{86}$/);
 assert.equal(await verifyDeviceAuthorization(device.publicKey,signature,USER,DEVICE,PROOF,'approve',REQUEST),true);
});

test('approval signatures cannot be replayed for another user, device, action or request',async()=>{
 const signer=await newDeviceSigningPair(),wrongSigner=await newDeviceSigningPair();
 const signature=await signDeviceAuthorization(signer.privateKey,USER,DEVICE,PROOF,'approve',REQUEST);
 assert.equal(await verifyDeviceAuthorization(wrongSigner.publicKey,signature,USER,DEVICE,PROOF,'approve',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,'other-user',DEVICE,PROOF,'approve',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,USER,OTHER,PROOF,'approve',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,USER,DEVICE,PROOF,'revoke',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,USER,DEVICE,PROOF,'complete',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,USER,DEVICE,PROOF,'approve',OTHER),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature,USER,DEVICE,'B'.repeat(43),'approve',REQUEST),false);
 assert.equal(await verifyDeviceAuthorization(signer.publicKey,signature+'X',USER,DEVICE,PROOF,'approve',REQUEST),false);
});

test('the same account encryption identity cannot impersonate a separately enrolled device signer',async()=>{
 const original=await newDeviceSigningPair(),removed=await newDeviceSigningPair();
 const trustedSignature=await signDeviceAuthorization(original.privateKey,USER,DEVICE,PROOF,'revoke',OTHER);
 const forgedSignature=await signDeviceAuthorization(removed.privateKey,USER,DEVICE,PROOF,'revoke',OTHER);
 assert.equal(await verifyDeviceAuthorization(original.publicKey,trustedSignature,USER,DEVICE,PROOF,'revoke',OTHER),true);
 assert.equal(await verifyDeviceAuthorization(original.publicKey,forgedSignature,USER,DEVICE,PROOF,'revoke',OTHER),false);
});
