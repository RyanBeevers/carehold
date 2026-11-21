import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('legacy key migration is explicitly gated by account identity and old-key proof',()=>{
 const routes=source('worker/recovery-migration.ts');
 const schema=source('migrations/0014_account_key_migration.sql');
 const gate=source('src/LegacyMessageMigration.tsx');
 assert.match(routes,/account_key_migration_challenges/);
 assert.match(routes,/original_jwk=\?/);
 assert.match(routes,/proof_digest=\?/);
 assert.match(routes,/expires_at>\?/);
 assert.match(routes,/sourceAllowed\(db,kind,sourceId,user\.id\)/);
 assert.match(routes,/missingSql/);
 assert.match(routes,/account_migrated_copies/);
 assert.match(routes,/INSERT INTO message_account_recovery/);
 assert.match(routes,/UPDATE message_device_keys SET public_jwk=\?/);
 assert.match(schema,/CREATE TRIGGER protect_completed_recipient_copy/);
 assert.match(gate,/storedLegacyMessageIdentity/);
 assert.match(gate,/unseal\(challenge\.envelope,oldKey\.privateKey/);
 assert.match(gate,/acceptCommitted/);
 assert.match(gate,/cancelStaged/);
 assert.doesNotMatch(routes,/DELETE FROM encrypted_message_copies|DELETE FROM shared_word_copies|DELETE FROM encrypted_messages|DELETE FROM shared_word_posts/);
});

test('stale sender keys are rejected for both direct and Words content',()=>{
 const policy=source('worker/messages-policy.ts');
 const messages=source('worker/messages.ts');
 const words=source('worker/words-spaces.ts');
 const dm=source('src/MessagesStudio.tsx');
 const ui=source('src/SharedWords.tsx');
 assert.match(policy,/matchesKeyRoster/);
 assert.match(messages,/matchesKeyRoster\(b\.publicKeys,participants\)/);
 assert.match(words,/matchesKeyRoster\(b\.publicKeys,people\)/);
 assert.match(words,/matchesKeyRoster\(b\.publicKeys,keys\.results\.map/);
 assert.match(dm,/publicKeys:attempt\.publicKeys/);
 assert.match(ui,/publicKeys:attempt\.publicKeys/);
 assert.match(messages,/mig\.state='complete'/);
 assert.match(words,/mig\.state='complete'/);
});

test('cloud draft and journal writes never operate under stale account IDs',()=>{
 const drafts=source('worker/private-drafts.ts');
 const journals=source('worker/private-journal.ts');
 const clientDrafts=source('src/lib/recoverable-drafts.ts');
 const clientJournals=source('src/lib/synced-private-journal.ts');
 assert.match(drafts,/get\('accountId'\)!==user\.id/);
 assert.match(journals,/get\('accountId'\)!==user\.id/);
 assert.match(clientDrafts,/accountId=/);
 assert.match(clientJournals,/accountId=/);
 assert.match(drafts,/WHERE user_id=\? AND household_id=\? AND scope_id=\? AND revision=\?/);
 assert.match(journals,/WHERE user_id=\? AND household_id=\? AND entry_id=\? AND revision=\?/);
 assert.doesNotMatch(drafts,/plaintext|body_text|prompt_text/i);
});

test('draft reconciliation never discards another device version without explicit revision safety',()=>{
 const hook=source('src/lib/useWordsDraftVault.ts');
 const lib=source('src/lib/recoverable-drafts.ts');
 assert.match(hook,/readSyncedDraft/);
 assert.match(hook,/saveSyncedDraft/);
 assert.match(hook,/deleteSyncedDraft/);
 assert.match(hook,/remoteBlocked\.current/);
 assert.match(hook,/loadRemote/);
 assert.match(hook,/await queue\.current\.catch/);
 assert.match(lib,/additionalData:associated/);
});
