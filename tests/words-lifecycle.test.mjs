import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('shared space removal, leaving and own reply removal require explicit server authorization',()=>{
 const worker=source('worker/words-spaces.ts');
 const ui=source('src/SharedWords.tsx');
 assert.match(worker,/const deletePost=path\.match/);
 assert.match(worker,/if\(post\.author_id!==user\.id\)fail\(403/);
 assert.match(worker,/post\.kind!=='reflection'&&post\.kind!=='discussion'/);
 assert.match(worker,/if\(space\.created_by!==user\.id\)fail\(403/);
 assert.match(worker,/if\(space\.created_by===user\.id\)fail\(403/);
 assert.match(worker,/await spaceFor\(db,sid,user\.id\)/);
 assert.match(worker,/AND s\.deleted_at IS NULL AND p\.left_at IS NULL/);
 assert.match(worker,/WHERE p\.space_id=\? AND p\.deleted_at IS NULL/);
 assert.match(worker,/post_id=\?/);
 assert.match(ui,/Remove shared space/);
 assert.match(ui,/Leave this shared space/);
 assert.match(ui,/Remove my reply/);
 assert.match(ui,/Keep reply/);
 assert.match(ui,/Keep space/);
 assert.match(ui,/Previously received copies cannot be recalled/);
 assert.doesNotMatch(ui,/window\.confirm\(/);
});

test('sharing a journal snapshot preserves the private entry before clearing its draft',()=>{
 const hub=source('src/WordsHub.tsx');
 const shared=source('src/SharedWords.tsx');
 const section=hub.slice(hub.indexOf('async function finishSharing'),hub.indexOf('return <div className="words-hub">'));
 assert.match(section,/await saveJournalEntry\(/);
 assert.match(section,/await reloadJournal\(\)/);
 assert.match(section,/const cleared=await draft\.discard\(\)/);
 assert.ok(section.indexOf('await saveJournalEntry(')<section.indexOf('const cleared=await draft.discard()'));
 assert.match(section,/but the private journal save needs attention/);
 assert.match(shared,/await onCreated\(attempt\.id\)/);
 assert.match(shared,/async function restorePrivateJournal\(\)/);
 assert.match(shared,/Save a private journal copy/);
 assert.match(shared,/setSourceSaved\(true\)/);
 assert.match(shared,/The shared snapshot is unchanged/);
 assert.match(hub,/onCreated=\{finishSharing\}/);
});

test('Words notification test is opt-in, rate-limited, and never includes private writing',()=>{
 const worker=source('worker/words-spaces.ts');
 const router=source('worker/index.ts');
 const hub=source('src/WordsHub.tsx');
 assert.match(router,/path==='\/api\/words\/push\/test'/);
 assert.match(worker,/path==='\/api\/words\/push\/test'&&req\.method==='POST'/);
 assert.match(worker,/if\(preference\?\.enabled!==1\)fail\(409/);
 assert.match(worker,/push_test_rate_limits/);
 assert.match(worker,/if\(!accepted\)fail\(502/);
 assert.match(worker,/Some.*NOTHING|Something new is waiting in Carehold/);
 assert.match(hub,/navigator\.serviceWorker\.getRegistration\(\)/);
 assert.match(hub,/Send a test notification/);
 assert.match(hub,/In-app Activity works without push/);
 assert.doesNotMatch(worker,/title:.*\$\{|body:.*\$\{/);
});
