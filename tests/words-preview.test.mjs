import test from 'node:test';
import assert from 'node:assert/strict';
import {WORDS_DRAFT_MAX_LENGTH,previewRecipients,previewDisclosureLabel} from '../src/lib/words-preview.ts';
import {readFileSync} from 'node:fs';

const options=[{id:'a',name:'Parent'},{id:'b',name:'Teen'}];

test('preview is private by default regardless of previously selected IDs',()=>{
 assert.deepEqual(previewRecipients('private',options,['a']),[]);
 assert.equal(previewDisclosureLabel('private',1),'Just me — sharing off');
});
test('recipient preview includes only explicitly selected eligible users',()=>{
 assert.deepEqual(previewRecipients('recipients',options,['b','missing','b']),[{id:'b',name:'Teen'}]);
 assert.deepEqual(previewRecipients('recipients',options,[]),[]);
 assert.match(previewDisclosureLabel('recipients',1),/not sent/);
});
test('recipient preview never offers sending or plaintext browser storage',()=>{
 const source=readFileSync(new URL('../src/WordsDraftStudio.tsx',import.meta.url),'utf8');
 assert.match(source,/Continue in Messages/);
 assert.match(source,/Enable encrypted device autosave/);
 assert.match(source,/onPrepareMessage/);
 assert.doesNotMatch(source,/api\(\s*['"]\/messages\/threads/);
 assert.doesNotMatch(source,/(?:localStorage|sessionStorage|indexedDB|WebSocket|sendMessage\(|saveDraft\()/);
 assert.equal(WORDS_DRAFT_MAX_LENGTH,3000);
});
