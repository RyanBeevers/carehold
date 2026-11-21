import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const idle=readFileSync(new URL('../src/lib/useIdleSecurity.ts',import.meta.url),'utf8');

test('auto-lock protects only its own tab, not the shared authenticated browser session',()=>{
 assert.match(idle,/onLock:\(reason:LockReason\)=>void/);
 assert.match(idle,/lockRef\.current\(reason\)/);
 assert.match(app,/useIdleSecurity\(Boolean\(user&&hasPasskey&&!locked&&!loading\),\(reason\)=>\{/);
 assert.match(app,/lockNow\(message,false\)/);
 // Explicit user locking/sign-out retain session revocation.
 assert.match(app,/const lockNow=\(reason='',revokeSession=true\)=>\{/);
 assert.match(app,/lockNow=\{\(\)=>lockNow\(\)\}/);
 assert.match(app,/await authClient\.signOut\(\)/);
});

test('active scrolling, mouse movement and touch activity prevent spurious inactivity locks',()=>{
 assert.match(idle,/const activityEvents=\[[^\]]*'pointerdown','pointermove'[^\]]*'touchstart','touchmove','wheel','input'/);
 assert.match(idle,/lastInteraction=now/);
 assert.match(idle,/if\(document\.visibilityState!=='visible'\|\|attemptLock\(\)\)return/);
});

test('lock notices distinguish true inactivity and background timeout',()=>{
 assert.match(app,/reason==='away'/);
 assert.match(app,/locked after one minute in the background/i);
 assert.match(app,/locked after three minutes without detected activity/i);
 assert.match(app,/setLockError\(reason\)/);
});
