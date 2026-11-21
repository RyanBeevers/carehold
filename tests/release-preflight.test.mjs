import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const guard=readFileSync(new URL('../scripts/check-staging-config.mjs',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/WordsHub.tsx',import.meta.url),'utf8');

test('remote staging migration and deployment both require target checks',()=>{
 for(const script of ['db:remote','deploy:staging'])
  assert.match(packageJson.scripts[script],/npm run preflight:staging &&/);
 assert.match(packageJson.scripts['preflight:staging'],/check-staging-config\.mjs/);
 assert.match(guard,/db\.database_id/);
 assert.match(guard,/origin\.startsWith\('https:\/\/'\)/);
 assert.match(guard,/process\.exitCode=1/);
});
test('pre-E2E verification is a single reproducible command',()=>{
 assert.equal(packageJson.scripts['verify:pre-e2e'],'npm run typecheck && npm test && npm run build');
});
test('private journal backup controls are opt-in and restore never silently overwrites',()=>{
 assert.match(hub,/Export encrypted backup/);
 assert.match(hub,/Restore encrypted backup/);
 assert.match(hub,/openEncryptedJournalBackup/);
 assert.match(hub,/if\(existing\.has\(entry\.id\)\)continue/);
 assert.match(hub,/input type="password"/);
 assert.match(hub,/setBackupPassphrase\(''\)/);
});
