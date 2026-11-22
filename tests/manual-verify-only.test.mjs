import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('manual verification runs tests without Cloudflare secrets, D1 migration or deployment',()=>{
 const yml=readFileSync(new URL('../.github/workflows/manual-verify.yml',import.meta.url),'utf8');
 assert.match(yml,/workflow_dispatch:/);
 assert.doesNotMatch(yml,/\n\s+(?:push|pull_request|schedule):/);
 assert.match(yml,/permissions:\s+contents: read/);
 assert.match(yml,/node-version: '22'/);
 assert.match(yml,/python-version: '3.12'/);
 assert.match(yml,/npm run verify:pre-e2e/);
 assert.match(yml,/npm install --no-audit --no-fund/);
 assert.doesNotMatch(yml,/CLOUDFLARE_API_TOKEN|D1_BACKUP_PASSPHRASE|wrangler d1|wrangler deploy|npm run deploy:|npm run release:/);
 assert.doesNotMatch(yml,/\n\s+environment: production/);
});
