import test from 'node:test';
import assert from 'node:assert/strict';
import {SESSION_IDLE_SECONDS,SESSION_REFRESH_SECONDS,INACTIVITY_LOCK_MS,BACKGROUND_LOCK_MS,lockReason} from '../shared/session-policy.ts';
test('three-minute server session and client inactivity lock agree',()=>{
 assert.equal(SESSION_IDLE_SECONDS,180);
 assert.equal(INACTIVITY_LOCK_MS,SESSION_IDLE_SECONDS*1000);
 assert.ok(SESSION_REFRESH_SECONDS<SESSION_IDLE_SECONDS);
 assert.equal(lockReason(180_000,0,null),'inactive');
 assert.equal(lockReason(179_999,0,null),null);
});
test('one minute away locks on resume even if JS timers were suspended',()=>{
 assert.equal(BACKGROUND_LOCK_MS,60_000);
 assert.equal(lockReason(60_000,59_000,0),'away');
 assert.equal(lockReason(59_999,59_000,0),null);
});
test('client interaction cannot extend an expired background timeout',()=>{
 assert.equal(lockReason(120_000,119_999,5_000),'away');
});
