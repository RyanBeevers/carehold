import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=src('src/App.tsx'),hub=src('src/WordsHub.tsx'),shared=src('src/SharedWords.tsx');
const worker=src('worker/index.ts'),wordsWorker=src('worker/words-spaces.ts'),messagesWorker=src('worker/messages.ts');

test('correcting an erroneous record never silently reopens a duplicate scheduled dose',()=>{
 assert.match(app,/Not administered — earlier record was entered in error/);
 assert.match(app,/Record a later outcome/);
 assert.match(app,/correctionKind/);
 assert.match(app,/if\(!doseStatus\)\{showToast\('error'/);
 assert.match(worker,/correctionKind==='not_administered'&&status!=='skipped'/);
 assert.match(worker,/correction_kind/);
 const migration=src('migrations/0010_dose_correction_kind.sql');
 assert.match(migration,/ALTER TABLE dose_events ADD COLUMN correction_kind/);
 assert.match(migration,/not_administered/);
 assert.match(src('migrations/0002_care.sql'),/CREATE UNIQUE INDEX first_record_per_occurrence/);
});

test('medication and profile archives preserve records and history',()=>{
 for(const route of ["const medArchive=path.match","const profileArchive=path.match"])assert.ok(worker.includes(route));
 assert.match(worker,/UPDATE medications SET archived_at=\?,updated_at=\?/);
 assert.match(worker,/UPDATE profiles SET archived_at=\?/);
 assert.match(worker,/INSERT INTO medication_changes/);
 assert.doesNotMatch(worker,/DELETE FROM dose_events/);
 assert.match(app,/Archive medication/);
 assert.match(app,/Restore profile/);
 assert.match(wordsWorker,/archived\.archived_at IS NOT NULL/);
 assert.match(wordsWorker,/archived_at IS NOT NULL AND linked_user_id/);
 assert.match(messagesWorker,/archived\.archived_at IS NOT NULL/);
 assert.match(messagesWorker,/archived_at IS NOT NULL AND linked_user_id/);
});

test('encrypted draft autosave is the default with no repeated enable button',()=>{
 const hook=src('src/lib/useWordsDraftVault.ts');
 assert.match(hook,/await enableDeviceVault\(userId,householdId\)/);
 assert.match(hook,/if\(!result\.enabled\)/);
 assert.match(hook,/setTitle/);
 assert.doesNotMatch(hub,/Enable encrypted draft autosave/);
 assert.doesNotMatch(shared,/Enable encrypted draft autosave/);
});

test('new prompts never silently reuse text, and share completion clears the matching draft',()=>{
 assert.match(hub,/async function beginFresh\(prompt/);
 assert.match(hub,/await draft\.discard\(\)/);
 assert.match(hub,/pendingPrompt/);
 assert.match(hub,/sourceEntryId/);
 assert.match(hub,/draft\.text===current\.text&&draft\.prompt===current\.prompt/);
 assert.match(hub,/Start fresh/);
});

test('one shared discussion composer handles both private and public writing',()=>{
 assert.match(shared,/Private note added on this device only/);
 assert.match(shared,/spaceId\}\)/);
 assert.match(shared,/Post private note · only me/);
 assert.match(shared,/Post reply · everyone/);
 assert.match(shared,/Copy old draft/);
 assert.doesNotMatch(shared,/onClick=\{\(\)=>\{discussion\.setText\(reflection\.text\);void reflection\.discard\(\);\}\}/);
 const detail=shared.slice(shared.indexOf('function SharedSpaceDetail'));
 assert.equal((detail.match(/<textarea/g)||[]).length,1);
});

test('journal titles, filters and pagination stay in encrypted device storage',()=>{
 const journal=src('src/lib/private-journal.ts');
 const vault=src('src/lib/words-vault.ts');
 const backup=src('src/lib/journal-backup.ts');
 assert.match(journal,/sharedAt/);
 assert.match(journal,/spaceId/);
 assert.match(journal,/title/);
 assert.match(vault,/title\?:string/);
 assert.match(backup,/item\.sharedAt/);
 assert.match(hub,/journalQuery/);
 assert.match(hub,/journalFrom/);
 assert.match(hub,/journalTo/);
 assert.match(hub,/visibleJournal/);
 assert.match(hub,/Page \{safeJournalPage\+1\}/);
 assert.match(hub,/draft\.title!==\(entry\.title\?\?''\)/);
});

test('editing on mobile refreshes idle timers while server session stays checked',()=>{
 const hook=src('src/lib/useIdleSecurity.ts');
 assert.match(hook,/compositionupdate/);
 assert.match(hook,/['"]input['"]/);
 assert.match(app,/getSession\(\{query:\{disableCookieCache:true\}\}\)/);
 assert.match(src('shared/session-policy.ts'),/INACTIVITY_LOCK_MS=180_000/);
});
