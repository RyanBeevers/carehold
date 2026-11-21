import test from 'node:test';
import assert from 'node:assert/strict';
import {pushConfigured} from '../worker/push-config.ts';
test('VAPID config must have all fields and real contact address',()=>{
 const valid={VAPID_PUBLIC_KEY:'a'.repeat(87),VAPID_PRIVATE_KEY:'b'.repeat(43),VAPID_SUBJECT:'mailto:notify@example.com'};
 assert.equal(pushConfigured(valid),true);
 assert.equal(pushConfigured({...valid,VAPID_PRIVATE_KEY:''}),false);
 assert.equal(pushConfigured({...valid,VAPID_SUBJECT:'mailto:notify@example.invalid'}),false);
});
