#!/usr/bin/env node
/**
 * One-time staging target setup. Never requests secrets or touches production.
 * Cloudflare D1 resource IDs and HTTPS RP origins are public configuration,
 * while authentication secrets must only be entered through Wrangler.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

const path=fileURLToPath(new URL('../wrangler.jsonc',import.meta.url));
const config=JSON.parse(readFileSync(path,'utf8'));
if(!stdin.isTTY||!stdout.isTTY){
 console.error('Run this command interactively on your development computer.');
 process.exit(1);
}
const prompt=createInterface({input:stdin,output:stdout});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rejectHost=/replace|localhost|\.invalid|\.example|127\.0\.0\.1/i;
try{
 console.log('Carehold staging configuration. Does NOT deploy, change D1 contents or request secrets.');
 console.log('First run: npx wrangler login; npx wrangler d1 create carehold-staging');
 const databaseId=(await prompt.question('Paste the REAL D1 database_id from Wrangler: ')).trim();
 if(!uuid.test(databaseId)||databaseId==='00000000-0000-0000-0000-000000000000')
  throw new Error('Enter the real UUID returned by wrangler d1 create.');
 if(databaseId===config.env?.production?.d1_databases?.[0]?.database_id)
  throw new Error('Staging must not share the production D1 ID.');
 const origin=(await prompt.question('Enter exact HTTPS staging origin, e.g. https://carehold-staging.YOUR_SUBDOMAIN.workers.dev: ')).trim();
 let url=null;try{url=new URL(origin);}catch{}
 if(!url||url.protocol!=='https:'||url.origin!==origin||url.pathname!=='/'||
  url.search||url.hash||url.username||url.password||rejectHost.test(origin))
  throw new Error('Enter a real HTTPS origin only: no path, query, placeholders or local host.');
 if(origin===config.env?.production?.vars?.APP_ORIGIN)
  throw new Error('Staging must not share the production APP_ORIGIN.');
 if(!config.env?.staging?.d1_databases?.[0]||config.env.staging.name!=='carehold-staging')
  throw new Error('Staging environment is missing or has changed unexpectedly.');
 console.log('Staging Worker: carehold-staging');
 console.log('Staging D1: '+databaseId);
 console.log('Passkey RP origin: '+origin);
 console.log('IMPORTANT: Changing this hostname later may invalidate passkeys already enrolled there.');
 const answer=(await prompt.question('Type CONFIGURE STAGING to update wrangler.jsonc (not production): ')).trim();
 if(answer!=='CONFIGURE STAGING'){console.log('No changes written.');process.exitCode=1;}
 else{
  config.env.staging.d1_databases[0].database_id=databaseId;
  config.env.staging.vars.APP_ORIGIN=origin;
  writeFileSync(path,JSON.stringify(config,null,2)+'\n',{mode:0o644});
  console.log('Staging configuration saved. Verify with npm run preflight:staging.');
  console.log('Then provision BETTER_AUTH_SECRET and PILOT_ACCESS_CODE using npx wrangler secret put --env staging.');
 }
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
finally{prompt.close();}
