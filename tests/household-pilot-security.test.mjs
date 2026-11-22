import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('household pilot preserves strict Cloudflare browser protections',()=>{
 const headers=read('public/_headers');
 assert.match(headers,/Content-Security-Policy: default-src 'self'; script-src 'self'/);
 assert.match(headers,/object-src 'none'/);
 assert.match(headers,/frame-ancestors 'none'/);
 assert.match(headers,/X-Content-Type-Options: nosniff/);
 assert.match(headers,/Referrer-Policy: no-referrer/);
 assert.match(headers,/X-Robots-Tag: noindex, nofollow/);
 const api=read('worker/index.ts');
 assert.match(api,/const dataHeaders = \{'Cache-Control':'no-store'/);
 assert.match(api,/Content-Security-Policy.*default-src 'none'/);
});

test('no fictional-only banners hide regular household writing; keep actual key errors and settings guidance',()=>{
 const hub=read('src/WordsHub.tsx');
 const messages=read('src/MessagesStudio.tsx');
 const shared=read('src/SharedWords.tsx');
 const settings=read('src/HouseholdPrivacy.tsx');
 const recovery=read('src/RecoveryReadiness.tsx');
 const app=read('src/App.tsx');
 const setup=read('src/RecoverySetupGate.tsx');
 for(const content of [hub,messages,shared,setup])
  assert.doesNotMatch(content,/Fictional (writing|messages|test writing) only|use fictional writing only|fictional messaging/i);
 assert.doesNotMatch(hub,/words-hub-warning/);
 assert.doesNotMatch(messages,/messages-warning/);
 assert.match(hub,/Encrypted sharing unavailable/);
 assert.match(messages,/Unable to decrypt on this device/);
 assert.match(settings,/Carehold is currently for your invited household/);
 assert.match(settings,/not a clinically reviewed or independently audited/);
 assert.match(app,/<HouseholdPrivacy\/>/);
 assert.match(recovery,/My encryption verification code/);
 assert.match(recovery,/cannot independently revoke/);
 assert.match(read('docs/HOUSEHOLD_PILOT_SECURITY.md'),/First use remains trust-on-first-use/);
});
