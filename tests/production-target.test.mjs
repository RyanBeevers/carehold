import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkProductionTarget} from '../scripts/release-target-policy.mjs';

const prodId='22222222-2222-4222-8222-222222222222';
const stageId='11111111-1111-4111-8111-111111111111';
const valid=()=>({
 d1_databases:[{database_id:'00000000-0000-0000-0000-000000000000'}],
 env:{
  staging:{name:'carehold-staging',d1_databases:[{binding:'DB',database_name:'carehold-staging',database_id:stageId}],vars:{APP_ORIGIN:'https://carehold-staging.example.org'}},
  production:{name:'carehold-production',d1_databases:[{binding:'DB',database_name:'carehold-production',database_id:prodId}],vars:{APP_ORIGIN:'https://carehold.example.org'}}
 }
});

test('production target accepts a distinct D1 database, Worker and exact HTTPS RP origin',()=>{
 assert.deepEqual(checkProductionTarget(valid()),[]);
});
test('production target fails closed on placeholders and unconfigured D1',()=>{
 const actual=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.ok(checkProductionTarget(actual).length>0);
 const altered=valid();
 altered.env.production.d1_databases[0].database_id='REPLACE_PRODUCTION_D1_ID';
 assert.ok(checkProductionTarget(altered).some(s=>s.includes('D1 UUID')));
});
test('production must not point to staging or local D1 even when IDs look real',()=>{
 const actual=valid();
 actual.env.production.d1_databases[0].database_id=stageId;
 assert.ok(checkProductionTarget(actual).some(s=>s.includes('distinct D1')));
 actual.env.production.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000';
 assert.ok(checkProductionTarget(actual).some(s=>s.includes('local development')));
});
test('production passkey origin must be final and distinct from staging',()=>{
 for(const origin of ['http://carehold.example.org','https://REPLACE-PRODUCTION-HOST','https://localhost:8787','https://carehold.example.org/path','https://carehold.example.org/','https://carehold.example.org?x=1','https://carehold.example.org:8443','https://me:pw@carehold.example.org','https://carehold-staging.example.org']){
  const actual=valid();
  actual.env.production.vars.APP_ORIGIN=origin;
  assert.ok(checkProductionTarget(actual).length>0,origin);
 }
});
test('release command requires main branch, clean tree, latest upstream, verification, remote backup and explicit review',()=>{
 const release=readFileSync(new URL('../scripts/release-production.sh',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.match(pkg.scripts['preflight:production'],/check-production-config\.mjs/);
 assert.match(pkg.scripts['release:production'],/release-production\.sh/);
 for(const phrase of ['git status --porcelain','git fetch origin main','npm run verify:pre-e2e','npx wrangler whoami','npx wrangler d1 export carehold-production --remote --env production','npx wrangler d1 migrations apply carehold-production --remote --env production','npx wrangler deploy --env production','E2E REVIEWED','DEPLOY CAREHOLD PRODUCTION']){
  assert.ok(release.includes(phrase),phrase);
 }
 assert.ok(release.includes('git rev-parse --abbrev-ref HEAD'));
});
