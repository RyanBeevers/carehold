import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const shared=readFileSync(new URL('../src/SharedWords.tsx',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/WordsHub.tsx',import.meta.url),'utf8');

test('recording a dose requires an explicit observed outcome',()=>{
 assert.match(app,/useState<\(typeof statuses\)\[number\]\|null>\(null\)/);
 assert.match(app,/function beginDose\([^)]*\)\{setPending\(\{entry,medication\}\);setDoseStatus\(null\)/);
 assert.match(app,/if\(!doseStatus\)\{showToast\('error'/);
 assert.match(app,/disabled=\{saving\|\|!doseStatus\}/);
 assert.match(app,/\['given','skipped','refused','uncertain','missed'\]/);
});

test('shared-space Back clears parent selection and restores the list',()=>{
 assert.match(hub,/onCloseSpace=\{\(\)=>setOpenSpaceId\(null\)\}/);
 assert.match(shared,/onBack=\{\(\)=>\{setActive\(null\);onCloseSpace\(\)/);
 assert.match(shared,/if\(openSpaceId\)setActive\(openSpaceId\)/);
});

test('journal sections are navigable without encoding journal or participant IDs',()=>{
 assert.match(hub,/url\.searchParams\.set\('section',next\)/);
 assert.match(hub,/window\.addEventListener\('popstate',goBack\)/);
 assert.doesNotMatch(hub,/url\.searchParams\.set\('(entryId|spaceId|recipientId|content)'/);
});

test('a saved private journal is not automatically shared on navigation',()=>{
 assert.match(hub,/savePrivateJournal\(userId,householdId/);
 assert.match(hub,/startSharing\(\{kind:'journal'/);
 // ShareComposer now keeps an idempotent attempt ID for safe retries. Only the
 // explicit POST can lead to onCreated; private journal saves never call it.
 assert.match(shared,/await api\('\/words\/spaces','POST'/);
 assert.match(shared,/onCreated\(attempt\.id\)/);
 const savePrivate=hub.slice(hub.indexOf('async function saveJournal('),hub.indexOf('async function removeJournal('));
 assert.doesNotMatch(savePrivate,/\/words\/spaces|startSharing\(|onCreated\(/);
 assert.match(shared,/if\(!canSend\|\|!identity\)return/);
});
