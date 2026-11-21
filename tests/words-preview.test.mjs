import test from 'node:test';
import assert from 'node:assert/strict';
import {WORDS_DRAFT_MAX_LENGTH,previewRecipients,previewDisclosureLabel} from '../src/lib/words-preview.ts';
import {readFileSync} from 'node:fs';

const options=[{id:'a',name:'Parent'},{id:'b',name:'Teen'}];

test('preview is private by default regardless of previously selected IDs',()=>{
 assert.deepEqual(previewRecipients('private',options,['a']),[]);
 assert.equal(previewDisclosureLabel('private',1),'Only me — not saved');
});
test('recipient preview includes only explicitly selected eligible users',()=>{
 assert.deepEqual(previewRecipients('recipients',options,['b','missing','b']),[{id:'b',name:'Teen'}]);
 assert.deepEqual(previewRecipients('recipients',options,[]),[]);
 assert.match(previewDisclosureLabel('recipients',1),/not sent/);
});
test('preview UX never offers persistent sending or a storage API',()=>{
 const source=readFileSync(new URL('../src/WordsDraftStudio.tsx',import.meta.url),'utf8');
 assert.match(source,/Saving and sending are intentionally unavailable/);
 assert.match(source,/Sending not enabled/);
 assert.doesNotMatch(source,/(?:localStorage|sessionStorage|indexedDB|WebSocket|sendMessage\(|saveDraft\()/);
 assert.equal(WORDS_DRAFT_MAX_LENGTH,3000);
});
