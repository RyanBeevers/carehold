import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const spaces=readFileSync(new URL('../worker/words-spaces.ts',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/WordsHub.tsx',import.meta.url),'utf8');

test('all journal, activity and push preference paths pass through authenticated Worker router',()=>{
 assert.match(index,/await requirePasskey\(db,user\.id\)/);
 assert.match(index,/path==='\/api\/words\/people'/);
 assert.match(index,/path==='\/api\/words\/push-preference'/);
 assert.match(index,/path==='\/api\/words\/spaces'/);
 assert.match(index,/path\.startsWith\('\/api\/words\/spaces\/'\)/);
 assert.match(index,/path==='\/api\/activity'/);
 assert.match(index,/path==='\/api\/activity\/seen'/);
 assert.match(index,/path==='\/api\/words\/recipient-options'/);
 assert.match(index,/return handleWordSpaces\(req,env,user,ctx\)/);
 for(const p of ['/api/words/push-preference','/api/words/people','/api/words/spaces','/api/activity','/api/activity/seen'])
  assert.ok(spaces.includes(p),`Worker missing ${p} implementation`);
});
test('journal push is a separate explicit preference from medication reminders',()=>{
 assert.match(spaces,/FROM private_word_push_preferences WHERE user_id=\? AND household_id=\?/);
 assert.match(spaces,/typeof b\?\.enabled!=='boolean'/);
 assert.match(spaces,/private_word_push_preferences\(user_id,household_id,enabled\)/);
 assert.match(hub,/\/words\/push-preference/);
 assert.match(hub,/registerWordNotifications/);
 const section=hub.slice(hub.indexOf('async function registerWordNotifications'),hub.indexOf('async function setNotificationPreference'));
 assert.doesNotMatch(section,/\/push\/preference/);
 assert.match(section,/\/push\/subscribe/);
});

test('Words and Messages show compact, keyboard-accessible pilot limits with details available',()=>{
 const messages=readFileSync(new URL('../src/MessagesStudio.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.match(hub,/<details className="words-hub-warning">/);
 assert.match(hub,/<summary><LockKeyhole/);
 assert.match(hub,/Fictional writing only/);
 assert.match(hub,/Do not enter confidential family, health or therapeutic information/);
 assert.match(hub,/Independent device revocation is unfinished/);
 assert.match(messages,/<details className="messages-warning">/);
 assert.match(messages,/Fictional messages only/);
 assert.match(messages,/Do not send confidential family, medical, or therapeutic content/);
 assert.match(messages,/recipient keys are not independently verified/);
 assert.match(css,/\.words-hub-warning summary:focus-visible/);
 assert.match(css,/\.messages-warning summary:focus-visible/);
 assert.doesNotMatch(hub,/<div className="words-hub-warning"/);
 assert.doesNotMatch(messages,/<div className="messages-warning"/);
});
