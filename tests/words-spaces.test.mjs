import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sealWord,unsealWord,validWordPayload} from '../src/lib/words-space-crypto.ts';
globalThis.btoa=v=>Buffer.from(v,'binary').toString('base64');
globalThis.atob=v=>Buffer.from(v,'base64').toString('binary');
async function identity(){
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {privateKey:pair.privateKey,publicKey:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y}};
}
test('prompt, journal, reflection and discussion are structured inside ciphertext',async()=>{
 const alice=await identity(),bob=await identity(),other=await identity();
 const space='00000000-0000-4000-8000-000000000011',post='00000000-0000-4000-8000-000000000012';
 const input={kind:'journal',prompt:'Fictional question for a test household?',text:'Only fictional words here.'};
 assert.equal(validWordPayload(input),true);
 const a=await sealWord(input,alice.publicKey,space,post,'alice');
 const b=await sealWord(input,bob.publicKey,space,post,'bob');
 assert.notEqual(a.ct,b.ct);
 assert.deepEqual(await unsealWord(a,alice.privateKey,space,post,'alice'),input);
 assert.deepEqual(await unsealWord(b,bob.privateKey,space,post,'bob'),input);
 await assert.rejects(unsealWord(b,other.privateKey,space,post,'bob'));
 await assert.rejects(unsealWord(b,bob.privateKey,space,post,'alice'));
 await assert.rejects(unsealWord(b,bob.privateKey,space,'different-post','bob'));
});
test('journal body and prompt stay bounded; no plaintext wire props',()=>{
 assert.equal(validWordPayload({kind:'journal',prompt:null,text:'Fictional entry'}),true);
 assert.equal(validWordPayload({kind:'reflection',prompt:null,text:' ' }),false);
 assert.equal(validWordPayload({kind:'journal',prompt:null,text:'x'.repeat(2601)}),false);
 assert.equal(validWordPayload({kind:'journal',prompt:'x'.repeat(601),text:'hi'}),false);
 assert.equal(validWordPayload({kind:'journal',prompt:null,text:'hi',recipientIds:['unexpected']}),false);
 const server=readFileSync(new URL('../worker/words-spaces.ts',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../migrations/0007_shared_words_activity.sql',import.meta.url),'utf8');
 assert.doesNotMatch(migration,/\bplaintext\s+TEXT\b|\bbody\s+TEXT\b|\bprompt_text\s+TEXT\b/i);
 assert.match(server,/shared_word_participants p ON p.space_id=s.id AND p.user_id=\?/);
 assert.match(server,/WHERE user_id=\? AND household_id=\?/);
 assert.match(server,/validSealedEnvelope/);
 assert.match(server,/private_word_push_preferences/);
});
test('Words is primary navigation and direct messages remain present',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(app,/<WordsHub /);
 assert.match(app,/page==='messages'/);
 assert.match(app,/nav-unread/);
 const words=readFileSync(new URL('../src/WordsHub.tsx',import.meta.url),'utf8');
 for(const section of ['Explore prompts','My journal','Shared spaces','Activity','Save privately','Share this entry'])assert.ok(words.includes(section));
 assert.doesNotMatch(words,/localStorage\.setItem\([^)]*journal/);
});
