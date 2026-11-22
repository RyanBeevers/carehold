import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const guide=readFileSync(new URL('../src/RecoveryCodeSaveGuide.tsx',import.meta.url),'utf8');
const fresh=readFileSync(new URL('../src/MessageRecoveryGate.tsx',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../src/LegacyMessageMigration.tsx',import.meta.url),'utf8');

test('recovery code guide is reusable for fresh and legacy enrollment',()=>{
 assert.match(fresh,/RecoveryCodeSaveGuide code=\{pending\.recoveryCode\} saved=\{saved\}/);
 assert.match(legacy,/RecoveryCodeSaveGuide code=\{pending\.recoveryCode\} saved=\{savedCode\}/);
 assert.match(fresh,/if\(!pending\|\|!saved\|\|busy\)return/);
 assert.match(legacy,/if\(!pending\|\|!savedCode\|\|!oldKey\|\|busy\)return/);
});

test('copy operation requires user action and never claims to auto-save in a password vault',()=>{
 assert.match(guide,/navigator\.clipboard\.writeText\(value\)/);
 assert.match(guide,/onClick=\{\(\)=>void copy\(code,'Recovery code'\)\}/);
 assert.match(guide,/Carehold — Encryption Recovery Key/);
 assert.match(guide,/cannot directly insert a recovery code into Apple Passwords/);
 assert.match(guide,/Apple Passwords/);
 assert.match(guide,/Locked note/);
 assert.match(guide,/Step 1 — Save your recovery code/);
 assert.match(guide,/Step 2 — Verify your saved copy/);
 assert.match(guide,/I've saved it — verify my copy/);
 assert.match(guide,/enteredCode\.trim\(\)!==code/);
 assert.match(guide,/onSavedChange\(true\)/);
 assert.match(guide,/value=\{enteredCode\}/);
 assert.doesNotMatch(guide,/type="checkbox" checked=\{saved\}/);
 // This is a source-level safety regression check. Check executable access,
 // not the mere appearance of an API name in a comment explaining the risk.
 const executable=guide.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert.doesNotMatch(executable,/\b(?:localStorage|sessionStorage)\s*(?:\.|\[)|\bnavigator\.share\s*\(|\bfetch\s*\(|\bsendBeacon\s*\(|\bconsole\s*\./);
});

test('code is distinct from login password and no new auto-save credential is fabricated',()=>{
 assert.match(guide,/separate from your passkey/);
 assert.match(guide,/not a replacement for your existing login/);
 assert.match(fresh,/Look for <strong>\{RECOVERY_SEARCH_LABEL\}<\/strong>/);
 assert.match(legacy,/Search your Passwords app or safe notes for <strong>\{RECOVERY_SEARCH_LABEL\}<\/strong>/);
});

test('an enrolled key is not presented as proof of saved recovery and missing-code help is discoverable',()=>{
 const readiness=readFileSync(new URL('../src/RecoveryReadiness.tsx',import.meta.url),'utf8');
 assert.match(readiness,/That confirms local access — not that the one-time recovery code was saved elsewhere/);
 assert.match(readiness,/I didn't save my recovery code/);
 assert.match(readiness,/Keep this browser and its Carehold site data intact/);
 assert.match(readiness,/cannot re-display or safely reissue a lost code/);
 assert.doesNotMatch(readiness,/reset.*keys.*onClick/i);
});

test('switching to iPhone Passwords cannot silently discard an unregistered recovery identity',()=>{
 const store=readFileSync(new URL('../src/lib/message-crypto.ts',import.meta.url),'utf8');
 assert.match(store,/indexedDB\.open\(dbName,4\)/);
 assert.match(store,/createObjectStore\('pendingRecoveries'/);
 assert.match(store,/storedPendingRecoveryEnvelope/);
 assert.match(store,/storePendingRecoveryEnvelope/);
 assert.match(store,/clearPendingRecoveryEnvelope/);
 assert.match(store,/scope,createdAt:Date\.now\(\),envelope/);
 assert.doesNotMatch(store,/pendingRecoveries.*recoveryCode/);
 assert.match(fresh,/mode==='resume-setup'/);
 assert.match(fresh,/storedPendingRecoveryEnvelope\(userId,'fresh'\)/);
 assert.match(fresh,/openMessageRecoveryIdentity\(userId,code\.trim\(\),pendingResume\)/);
 assert.match(fresh,/clearPendingRecoveryEnvelope\(userId,'fresh'\)/);
 assert.match(legacy,/status==='resume-prestage'/);
 assert.match(legacy,/storedPendingRecoveryEnvelope\(userId,'legacy'\)/);
 assert.match(legacy,/clearPendingRecoveryEnvelope\(userId,'legacy'\)/);
});
