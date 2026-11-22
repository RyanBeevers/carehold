#!/usr/bin/env node
// Local-only secret generation: never log private VAPID keys or commit .dev.vars.
import {readFileSync,writeFileSync,chmodSync,existsSync} from 'node:fs';
import {generateVapidKeys} from '@mmmike/web-push/vapid';

const contactIndex=process.argv.indexOf('--contact');
const email=contactIndex>=0?process.argv[contactIndex+1]:'';
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')){
 console.error('Usage: npm run push:setup -- --contact you@example.com');
 process.exit(1);
}
const file='.dev.vars';
if(!existsSync(file)){
 console.error('Missing .dev.vars. Copy .env.example to .dev.vars first.');
 process.exit(1);
}
let config=readFileSync(file,'utf8');
const getValue=key=>{
 const match=config.match(new RegExp('^'+key+'=(.*)$','m'));
 return match?match[1].trim().replace(/^['"]|['"]$/g,''):'';
};
const existing=['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'].map(getValue);
if(existing.some(Boolean)){
 console.error('VAPID keys already exist. Not rotating or overwriting them.');
 process.exit(1);
}
const {publicKey,privateKey}=await generateVapidKeys();
function set(key,value){
 const line=key+'='+value;
 const regex=new RegExp('^'+key+'=.*$','m');
 config=regex.test(config)?config.replace(regex,line):config.trimEnd()+'\n'+line+'\n';
}
set('VAPID_PUBLIC_KEY',publicKey);
set('VAPID_PRIVATE_KEY',privateKey);
set('VAPID_SUBJECT','mailto:'+email);
writeFileSync(file,config,{mode:0o600});
chmodSync(file,0o600);
console.log('Web Push keys configured in ignored .dev.vars. Private key was not printed.');
console.log('Restart npm run dev:worker, refresh Carehold, then Enable reminders in Settings.');
