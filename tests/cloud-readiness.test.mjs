import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const stage=readFileSync(new URL('../scripts/release-staging.sh',import.meta.url),'utf8');
const prod=readFileSync(new URL('../scripts/release-production.sh',import.meta.url),'utf8');
const stagingGuard=readFileSync(new URL('../scripts/check-staging-config.mjs',import.meta.url),'utf8');

test('cloud readiness verifies D1 schema without disclosing account data or SQL errors',()=>{
 const start=worker.indexOf("if(path==='/api/health/ready'&&req.method==='GET')");
 assert.notEqual(start,-1);
 const block=worker.slice(start,worker.indexOf("if(path.startsWith('/api/auth/'))",start));
 for(const table of ['user','message_account_recovery','private_draft_sync','account_key_migrations','account_recovery_rotations','account_recovery_rotation_journals','account_recovery_rotation_drafts'])
  assert.ok(block.includes('SELECT 1 FROM '+table+' LIMIT 1'),table);
 assert.match(block,/return json\(\{ok:true,product:'carehold'\}\)/);
 assert.match(block,/return json\(\{ok:false,product:'carehold'\},503\)/);
 assert.doesNotMatch(block,/console\.|JSON\.stringify\(e\)|error:e/);
});
test('staging and production release verify schema after deployment',()=>{
 for(const script of [stage,prod]){
  assert.match(script,/\/api\/health\/ready/);
  assert.match(script,/curl --fail --silent --show-error/);
 }
 assert.match(stagingGuard,/staging D1 must not share the production database ID/);
});
