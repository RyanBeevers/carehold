#!/usr/bin/env node
/**
 * Guard against deploying a staging Worker or applying remote D1 migrations
 * to placeholder or otherwise unintended targets. Does not contact Cloudflare.
 */
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const staging=config.env?.staging;
const dbs=staging?.d1_databases;
const db=Array.isArray(dbs)&&dbs.length===1?dbs[0]:null;
const origin=staging?.vars?.APP_ORIGIN;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checks=[
 ['exactly one staging D1 binding named DB',db?.binding==='DB'],
 ['staging D1 database name is carehold-staging',db?.database_name==='carehold-staging'],
 ['real, nonplaceholder staging D1 UUID',typeof db?.database_id==='string'&&uuid.test(db.database_id)&&db.database_id!=='00000000-0000-0000-0000-000000000000'],
 ['staging origin is HTTPS',typeof origin==='string'&&origin.startsWith('https://')],
 ['staging origin is not a placeholder, localhost or production default',typeof origin==='string'&&!/replace|localhost|\.invalid|\.example|127\.0\.0\.1/i.test(origin)],
 ['staging environment exists',staging?.name==='carehold-staging']
];
const failed=checks.filter(x=>!x[1]);
if(failed.length){
 console.error('Staging preflight blocked remote operations. Configure wrangler.jsonc first:');
 for(const [name] of failed)console.error('  - '+name);
 console.error('This check does not verify Cloudflare secrets, migrations, or account/permission setup.');
 process.exitCode=1;
}else{
 console.log('Staging target configuration looks populated. Verify this D1 database and APP_ORIGIN against the Cloudflare dashboard before any remote command.');
 console.log('Required secrets: BETTER_AUTH_SECRET, PILOT_ACCESS_CODE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.');
}
