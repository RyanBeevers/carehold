import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/lib/useWordsDraftVault.ts',import.meta.url),'utf8');
test('autosave waits for hydration and encrypts before storage',()=>{
 assert.match(source,/if\(!ready\|\|!enabled/);
 assert.match(source,/saveDeviceDraft\(/);
 assert.match(source,/setTimeout\(\(\)=>\{void flush\(\);\},1000\)/);
 assert.doesNotMatch(source,/(?:localStorage|sessionStorage|fetch\(|WebSocket|navigator\.sendBeacon)/);
});
test('draft clearing awaits outstanding saves before deletion',()=>{
 assert.match(source,/await queue\.current\.catch/);
 assert.match(source,/discardDeviceDraft\(/);
 assert.match(source,/discarding\.current=true/);
 assert.match(source,/if\(discarding\.current\|\|!isEnabled\.current/);
});
