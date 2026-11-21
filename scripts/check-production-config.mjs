#!/usr/bin/env node
/** Fail closed when production D1/hostname targets are missing or collide. */
import {readFileSync} from 'node:fs';
import {checkProductionTarget} from './release-target-policy.mjs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const errors=checkProductionTarget(config);
if(errors.length){
 console.error('Production deployment blocked. Check wrangler.jsonc:');
 for(const error of errors)console.error('  - '+error);
 console.error('This command does not contact Cloudflare or prove that encryption, legal/privacy, E2E and backup-release gates have passed.');
 process.exitCode=1;
}else{
 console.log('Production target configuration passed local checks.');
 console.log('Verify Cloudflare account/Worker routes and secrets in the dashboard before remote operations.');
 console.log('Required secrets: BETTER_AUTH_SECRET, PILOT_ACCESS_CODE; push requires separate VAPID keys.');
}
