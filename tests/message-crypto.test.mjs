import test from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal} from '../src/lib/message-crypto.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');
async function identity(){
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const j=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {privateKey:pair.privateKey,publicKey:{kty:'EC',crv:'P-256',x:j.x,y:j.y}};
}
test('per-recipient ciphertext round trips, but wrong key fails',async()=>{
 const a=await identity(),b=await identity(),c=await identity();
 const id='00000000-0000-4000-8000-000000000001',thread='00000000-0000-4000-8000-000000000002';
 const body={kind:'prompt',text:'Fictional example: would you like to talk tomorrow?'};
 const ea=await seal(body,a.publicKey,thread,id,'a');
 const eb=await seal(body,b.publicKey,thread,id,'b');
 assert.notEqual(ea.ct,eb.ct);
 assert.deepEqual(await unseal(ea,a.privateKey,thread,id,'a'),body);
 assert.deepEqual(await unseal(eb,b.privateKey,thread,id,'b'),body);
 await assert.rejects(unseal(eb,a.privateKey,thread,id,'b'));
 await assert.rejects(unseal(eb,c.privateKey,thread,id,'b'));
 await assert.rejects(unseal(eb,b.privateKey,thread,id,'a'));
});
