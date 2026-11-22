import test from 'node:test';
import assert from 'node:assert/strict';
import {mayStartDirectMessage,exactParticipants,validPublicJwk,validSealedEnvelope,pairKey} from '../worker/messages-policy.ts';
test('new-message recipient eligibility is restricted',()=>{
 assert.equal(mayStartDirectMessage('member','member'),false);
 assert.equal(mayStartDirectMessage('member','owner'),true);
 assert.equal(mayStartDirectMessage('owner','caregiver'),true);
});
test('copies are exactly the sender and selected recipient',()=>{
 assert.equal(exactParticipants(['a','b'],['a','b']),true);
 assert.equal(exactParticipants(['a','a'],['a','b']),false);
 assert.equal(exactParticipants(['a','b','c'],['a','b']),false);
 assert.equal(pairKey('b','a'),pairKey('a','b'));
});
test('malformed or plaintext envelope is rejected',()=>{
 const key={kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)};
 assert.equal(validPublicJwk(key),true);
 assert.equal(validPublicJwk({...key,privateKey:'secret'}),false);
 const good={v:1,epk:key,iv:'a'.repeat(16),salt:'b'.repeat(22),ct:'c'.repeat(80)};
 assert.equal(validSealedEnvelope(good),true);
 assert.equal(validSealedEnvelope({...good,plaintext:'hello'}),false);
});
