import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkProductionTarget} from '../scripts/release-target-policy.mjs';

const setup=readFileSync(new URL('../scripts/configure-production.mjs',import.meta.url),'utf8');
const release=readFileSync(new URL('../scripts/release-production.sh',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));

test('production setup configures only isolated D1 and origin with explicit operator consent',()=>{
 assert.match(setup,/const next=structuredClone\(config\)/);
 assert.match(setup,/next\.env\.production\.d1_databases\[0\]\.database_id=id/);
 assert.match(setup,/next\.env\.production\.vars\.APP_ORIGIN=origin/);
 assert.match(setup,/origin===staging\?\.vars\?\.APP_ORIGIN/);
 assert.match(setup,/id===staging\?\.d1_databases\?\.\[0\]\?\.database_id/);
 assert.match(setup,/checkProductionTarget\(next\)/);
 assert.match(setup,/answer!=='CONFIGURE PRODUCTION'/);
 assert.doesNotMatch(setup,/secret put|wrangler deploy|d1 migrations apply/);
});

test('production release remains gated on reviewed main and explicit security signoff',()=>{
 assert.match(release,/git rev-parse --abbrev-ref HEAD/);
 assert.match(release,/origin\/main/);
 assert.match(release,/npm run verify:pre-e2e/);
 assert.match(release,/E2E REVIEWED/);
 assert.match(release,/SECURITY REVIEWED/);
 assert.match(release,/DEPLOY CAREHOLD PRODUCTION/);
 assert.match(release,/npx wrangler d1 export carehold-production --remote --env production/);
 assert.match(release,/npx wrangler d1 migrations apply carehold-production --remote --env production/);
 assert.match(release,/npx wrangler deploy --env production/);
});

test('production target policy rejects staged/local D1, stale host and nonexistent origin',()=>{
 const fresh=structuredClone(config);
 fresh.env.staging.d1_databases[0].database_id='9829b2d4-3a98-4982-8848-8821d6a6ee0c';
 fresh.env.staging.vars.APP_ORIGIN='https://carehold-staging.wavelength-woodworks-loop-api.workers.dev';
 fresh.env.production.d1_databases[0].database_id=fresh.env.staging.d1_databases[0].database_id;
 fresh.env.production.vars.APP_ORIGIN='https://carehold-production.wavelength-woodworks-loop-api.workers.dev';
 assert.ok(checkProductionTarget(fresh).some(x=>/distinct D1 IDs/.test(x)));
 fresh.env.production.d1_databases[0].database_id='00000000-0000-0000-0000-000000000000';
 assert.ok(checkProductionTarget(fresh).some(x=>/production D1 UUID must be configured/.test(x)));
 fresh.env.production.d1_databases[0].database_id='456cc34f-e248-48da-ac4d-b81e003bc9cb';
 fresh.env.production.vars.APP_ORIGIN=fresh.env.staging.vars.APP_ORIGIN;
 assert.ok(checkProductionTarget(fresh).some(x=>/distinct origins/.test(x)));
 fresh.env.production.vars.APP_ORIGIN='https://carehold-production.wavelength-woodworks-loop-api.workers.dev';
 assert.deepEqual(checkProductionTarget(fresh),[]);
});
