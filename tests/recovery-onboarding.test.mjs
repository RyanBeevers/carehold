import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const gate=readFileSync(new URL('../src/RecoverySetupGate.tsx',import.meta.url),'utf8');
const fresh=readFileSync(new URL('../src/MessageRecoveryGate.tsx',import.meta.url),'utf8');
const guide=readFileSync(new URL('../src/RecoveryCodeSaveGuide.tsx',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../src/LegacyMessageMigration.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');

test('account enrollment cannot reach household setup before passkey and recoverable encryption',()=>{
 const passkey=app.indexOf('if(!hasPasskey)return');
 const recovery=app.indexOf('if(recoveryCompletedUser!==user.id)return');
 const audience=app.indexOf('if(!audience)return');
 const households=app.indexOf('if(!households.length)return');
 const application=app.indexOf('return <>{toastView}<div className="app-shell">');
 assert.ok(passkey>0&&passkey<recovery&&recovery<audience&&audience<households&&households<application);
 assert.match(app,/const \[recoveryCompletedUser,setRecoveryCompletedUser\]=useState<string\|null>\(null\)/);
 assert.match(app,/RecoverySetupGate key=\{user.id\} userId=\{user.id\} onVerified=\{setRecoveryCompletedUser\}/);
 assert.match(app,/setUser\(null\);setHasPasskey\(false\);setRecoveryCompletedUser\(null\)/);
 assert.match(app,/save and verify an encryption recovery code before entering your care circle/);
});

test('recovery gate trusts neither a passkey nor a server row without the local journal key',()=>{
 assert.match(gate,/api<\{publicKey:PublicKey\|null\}>\('\/messages\/keys\/me'\)/);
 assert.match(gate,/api<\{configured:boolean\}>\('\/messages\/recovery'\)/);
 assert.match(gate,/samePublicKey\(local.publicKey,registered.publicKey\)&&local.journalKey/);
 assert.match(gate,/if\(!registered.publicKey&&!recovery.configured&&!local\)return 'fresh'/);
 assert.match(gate,/if\(recovery.configured&&registered.publicKey\)return 'restore'/);
 assert.match(gate,/return 'legacy'/);
 assert.match(gate,/return 'blocked'/);
 assert.match(gate,/MessageRecoveryGate key=\{userId\+':'+state\}/);
 assert.match(gate,/LegacyMessageMigration userId=\{userId\} onComplete=/);
});

test('new-account recovery is one-time externally saved secret, explicitly verified',()=>{
 assert.match(fresh,/RecoveryCodeSaveGuide code=\{pending.recoveryCode\} saved=\{saved\}/);
 assert.match(fresh,/if\(!pending\|\|!saved\|\|busy\)return/);
 assert.match(fresh,/api\('\/messages\/recovery','POST',\{envelope:pending.envelope\}\)/);
 assert.match(guide,/enteredCode.trim\(\)!==code/);
 assert.match(guide,/onSavedChange\(true\)/);
 assert.doesNotMatch(guide,/type="checkbox" checked=\{saved\}/);
 assert.match(gate,/Save the one-time CH1- code outside this browser, then retrieve and re-enter it/);
});

test('migration preserves legacy encryption rather than recreating a new key',()=>{
 assert.match(legacy,/storedLegacyMessageIdentity/);
 assert.match(legacy,/onComplete\?\.\(\)/);
 assert.match(legacy,/storeRecoveredMessageIdentity/);
 assert.doesNotMatch(gate,/localStorage\.setItem|sessionStorage\.setItem|clearSiteData/);
});
test('staging readiness requires recovery rotation migration',()=>{
 assert.match(worker,/SELECT 1 FROM account_recovery_rotations LIMIT 1/);
 assert.match(worker,/SELECT 1 FROM account_recovery_rotation_journals LIMIT 1/);
 assert.match(worker,/SELECT 1 FROM account_recovery_rotation_drafts LIMIT 1/);
});
