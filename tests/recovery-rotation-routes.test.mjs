import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const client=src('src/RecoveryCodeRotation.tsx');
const server=src('worker/recovery-rotation.ts');
const auth=src('worker/index.ts');
const sql=src('migrations/0016_recovery_code_rotation.sql');
const settings=src('src/RecoveryReadiness.tsx');

test('rotation requires original device decryption, a newly verified saved code and owner-specific API',()=>{
 assert.match(client,/createMessageRecoveryIdentity\(userId\)/);
 assert.match(client,/RecoveryCodeSaveGuide code=\{newIdentity\.recoveryCode\} saved=\{saved\}/);
 assert.match(client,/if\(!saved\|\|!newIdentity\|\|!original\|\|busy\)return/);
 assert.match(client,/unseal\(challenge\.envelope,identity\.privateKey/);
 assert.match(server,/originalProof\(db,user\.id,oldJwk,b\.proof\)/);
 assert.match(server,/SELECT 1 FROM message_account_recovery WHERE user_id=\? AND public_jwk=\?/);
 assert.match(auth,/await requirePasskey\(db,user\.id\)/);
 assert.match(auth,/handleRecoveryRotation\(req,env,user\)/);
 assert.match(settings,/Replace lost recovery code|RecoveryCodeRotation userId=\{userId\}/);
 assert.doesNotMatch(client,/console\.|localStorage\.setItem\(|sendBeacon\(/);
});

test('all shared copies, synced journal entries and drafts are verified before finalization',()=>{
 for(const kind of ["'copies'","'journals'","'drafts'"])
  assert.ok(client.includes('runInventory')&&client.includes(kind));
 assert.match(client,/unsealWord\(row\.envelope,old\.privateKey/);
 assert.match(client,/verifyStagedSyncedJournalEntry/);
 assert.match(client,/reencryptSyncedJournalEntry/);
 assert.match(client,/verifyStagedSyncedDraft/);
 assert.match(client,/reencryptSyncedDraft/);
 assert.match(client,/draftScopeToken/);
 assert.match(client,/An older synchronized draft has no recognized scope/);
 assert.match(client,/abortIfUnloaded\(\);[\s\S]*?\/recovery-rotation\/finalize/);
 assert.match(sql,/CREATE TRIGGER verify_recovery_rotation_finalization/);
 assert.match(sql,/RAISE\(ABORT,'Unmigrated direct messages remain'\)/);
 assert.match(sql,/RAISE\(ABORT,'Unmigrated shared Words remain'\)/);
 assert.match(sql,/RAISE\(ABORT,'Unmigrated private journal entries remain'\)/);
 assert.match(sql,/RAISE\(ABORT,'Unmigrated synchronized drafts remain'\)/);
});

test('no key or recipient copy is activated until authenticated atomic commit',()=>{
 assert.match(server,/db\.batch\(operations\)/);
 assert.match(server,/stage\.original_jwk/);
 assert.match(server,/state='complete'/);
 assert.match(server,/originalProof\(db,user\.id,oldJwk,b\.proof\)/);
 assert.match(sql,/CREATE UNIQUE INDEX one_pending_account_rotation/);
 assert.match(sql,/CREATE TRIGGER prevent_direct_to_rotating_recipient/);
 assert.match(sql,/CREATE TRIGGER prevent_words_to_rotating_recipient/);
 assert.match(sql,/original_ciphertext TEXT NOT NULL/);
 assert.match(src('src/lib/message-crypto.ts'),/createObjectStore\('identityHistory'/);
 assert.match(src('src/lib/message-crypto.ts'),/storeRotatedMessageIdentity/);
 assert.match(src('src/MessageRecoveryGate.tsx'),/storeRotatedMessageIdentity\(userId,previous,identity\)/);
 assert.doesNotMatch(server,/DELETE FROM message_account_recovery|DELETE FROM encrypted_messages|DELETE FROM private_journal_sync/);
});

test('lost-code accounts can safely cancel or resume, and other older browsers can recover',()=>{
 assert.match(client,/storedPendingRecoveryEnvelope\(userId,'rotation'\)/);
 assert.match(client,/mode==='resume-prestage'/);
 assert.match(client,/mode==='resume'/);
 assert.match(client,/cancelStaged/);
 assert.match(server,/originalProof\(db,user\.id,oldJwk,b\.proof\)/);
 assert.match(settings,/status==='mismatch'/);
 assert.match(settings,/MessageRecoveryGate key=\{userId\+':mismatch'\}/);
 assert.match(settings,/replacementComplete/);
});
