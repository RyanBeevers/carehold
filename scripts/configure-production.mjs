#!/usr/bin/env node
/**
 * Configure the final, separate Cloudflare production target.
 * No remote writes; never copies D1 data, secrets or browser identity keys.
 * Production release policy, independent security review and E2E sign-off
 * remain mandatory. Do not use this as approval for confidential content.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {checkProductionTarget} from './release-target-policy.mjs';

const configPath=fileURLToPath(new URL('../wrangler.jsonc',import.meta.url));
const original=readFileSync(configPath,'utf8');
const config=JSON.parse(original);
const production=config.env?.production;
const staging=config.env?.staging;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholder=/replace|placeholder|localhost|127\.0\.0\.1|\.invalid|\.example/i;

if(!stdin.isTTY||!stdout.isTTY){
 console.error('Use an interactive terminal to configure production.');
 process.exit(1);
}
if(!production||production.name!=='carehold-production'||
 !Array.isArray(production.d1_databases)||production.d1_databases.length!==1||
 production.d1_databases[0].binding!=='DB'||
 production.d1_databases[0].database_name!=='carehold-production'){
 console.error('Cloudflare production configuration is not in its expected state. No changes written.');
 process.exit(1);
}
const prompt=createInterface({input:stdin,output:stdout});
try{
 console.log('Carehold production target setup. This changes only the LOCAL wrangler.jsonc file.');
 console.log('No records are copied from staging; no Worker, DNS, secret or database is created by this command.');
 console.log('Production release remains blocked without reviewed main, browser E2E and security/privacy sign-off.');
 console.log('First run: npx wrangler d1 list  (or create carehold-production if it is absent).');
 const id=(await prompt.question('Enter the NEW carehold-production D1 database UUID: ')).trim();
 if(!uuid.test(id)||id==='00000000-0000-0000-0000-000000000000'||
  id===staging?.d1_databases?.[0]?.database_id||
  id===config.d1_databases?.[0]?.database_id)
  throw new Error('Invalid production database ID or ID matches staging/local; no changes made.');
 console.log('Choose your FINAL production WebAuthn/passkey hostname before enrolling accounts.');
 console.log('Example: https://carehold-production.YOUR_SUBDOMAIN.workers.dev');
 console.log('For a custom domain, configure the actual Cloudflare Worker route before choosing it.');
 const origin=(await prompt.question('Enter the exact intended production HTTPS origin: ')).trim();
 let url;try{url=new URL(origin);}catch{throw new Error('Invalid production URL. Paste the full https:// URL only.');}
 if(url.protocol!=='https:'||url.origin!==origin||url.pathname!=='/'||url.search||url.hash||
  url.username||url.password||url.port||placeholder.test(origin)||
  origin===staging?.vars?.APP_ORIGIN)
  throw new Error('Production HTTPS origin invalid or matches staging. No changes made.');
 // Work on an in-memory copy. Existing staging settings are never modified.
 const next=structuredClone(config);
 next.env.production.d1_databases[0].database_id=id;
 next.env.production.vars.APP_ORIGIN=origin;
 const problems=checkProductionTarget(next);
 if(problems.length)throw new Error('Production policy rejected configuration: '+problems.join('; '));
 console.log('\nWorker: carehold-production');
 console.log('D1: carehold-production ('+id+')');
 console.log('Passkey origin: '+origin);
 console.log('Do not change this origin after users register passkeys without a planned migration.');
 console.log('This does not deploy Carehold or approve use of real medical, minor or confidential data.');
 const answer=(await prompt.question('Type CONFIGURE PRODUCTION to write these nonsecret values locally: ')).trim();
 if(answer!=='CONFIGURE PRODUCTION'){
  console.log('No changes made.');
  process.exitCode=1;
 }else{
  // Keep the existing staging/prod separation and leave all other configuration
  // untouched. No attempt to write secrets or call Cloudflare.
  writeFileSync(configPath,JSON.stringify(next,null,2)+'\n',{mode:0o644});
  console.log('Production target saved locally. Run npm run preflight:production.');
  console.log('The target configuration is tracked; production release requires a reviewed commit on main.');
  console.log('Keep production BETTER_AUTH_SECRET and PILOT_ACCESS_CODE separate from staging secrets.');
 }
}catch(e){
 console.error(e instanceof Error?e.message:String(e));
 process.exitCode=1;
}finally{prompt.close();}
