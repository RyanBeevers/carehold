import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fingerprintPublicKey,readableFingerprint,checkRecipientKeyContinuity,
 acceptVerifiedRecipientKeys,RecipientKeyChangedError} from '../src/lib/recipient-key-continuity.ts';

const initial={kty:'EC',crv:'P-256',x:'A'.repeat(43),y:'B'.repeat(43)};
const rotated={kty:'EC',crv:'P-256',x:'C'.repeat(43),y:'D'.repeat(43)};
function context(){
 const pins=new Map();
 const localStorage={
  getItem:(k)=>pins.get(k)??null,
  setItem:(k,v)=>{pins.set(k,v);},
 };
 globalThis.window={localStorage};
 return pins;
}
const contact=(id,key=initial)=>({id,name:id,publicKey:key});

test('fingerprints are stable, canonical, and reject unsupported or malformed public keys',async()=>{
 const code=await fingerprintPublicKey(initial);
 assert.match(code,/^[A-F0-9]{64}$/);
 assert.equal(code,await fingerprintPublicKey({...initial}));
 assert.notEqual(code,await fingerprintPublicKey(rotated));
 assert.match(readableFingerprint(code),/^[A-F0-9]{8}( [A-F0-9]{8}){7}$/);
 await assert.rejects(()=>fingerprintPublicKey({...initial,crv:'P-384'}),/Invalid recipient/);
 await assert.rejects(()=>fingerprintPublicKey({...initial,x:'BAD'}),/Invalid recipient/);
});

test('first use remembers a key only for the signed-in account, circle and recipient',async()=>{
 const pins=context();
 await checkRecipientKeyContinuity('account-a','circle-a',[contact('child')]);
 assert.equal(pins.size,1);
 await checkRecipientKeyContinuity('account-a','circle-a',[contact('child')]);
 assert.equal(pins.size,1);
 await checkRecipientKeyContinuity('account-a','circle-b',[contact('child',rotated)]);
 await checkRecipientKeyContinuity('account-b','circle-a',[contact('child',rotated)]);
 assert.equal(pins.size,3);
});

test('silent recipient key substitution fails closed for the entire group',async()=>{
 const pins=context();
 await checkRecipientKeyContinuity('adult','home',[contact('sara'),contact('child')]);
 const before=new Map(pins);
 await assert.rejects(
  ()=>checkRecipientKeyContinuity('adult','home',[contact('sara',rotated),contact('child')]),
  err=>err instanceof RecipientKeyChangedError&&err.changed.length===1&&err.changed[0].id==='sara');
 assert.deepEqual(pins,before);
});

test('approving a verified rotation requires the exact previously seen key and is not automatic',async()=>{
 context();
 await checkRecipientKeyContinuity('adult','home',[contact('sara')]);
 let review;
 try{await checkRecipientKeyContinuity('adult','home',[contact('sara',rotated)]);}
 catch(e){review=e;}
 assert.ok(review instanceof RecipientKeyChangedError);
 const altered=review.changed.map(item=>({...item,previous:'F'.repeat(64)}));
 assert.throws(()=>acceptVerifiedRecipientKeys('adult','home',altered),/changed since/);
 await assert.rejects(()=>checkRecipientKeyContinuity('adult','home',[contact('sara',rotated)]),RecipientKeyChangedError);
 acceptVerifiedRecipientKeys('adult','home',review.changed);
 await checkRecipientKeyContinuity('adult','home',[contact('sara',rotated)]);
});

test('sending fails closed if recipient verification storage is inaccessible or a key is missing',async()=>{
 context();
 globalThis.window={localStorage:{getItem(){throw Error('blocked');}}};
 await assert.rejects(()=>checkRecipientKeyContinuity('a','h',[contact('sara')]),/storage is blocked/);
 context();
 await assert.rejects(()=>checkRecipientKeyContinuity('a','h',[{id:'sara',name:'Sara',publicKey:null}]),/no registered encryption key/);
});

test('all three send surfaces validate keys before constructing recipient ciphertext',()=>{
 const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const words=source('src/SharedWords.tsx'),messages=source('src/MessagesStudio.tsx');
 const share=words.slice(words.indexOf('async function create(e:FormEvent)'),words.indexOf('return <section className="words-compose"'));
 const reply=words.slice(words.indexOf("async function send(kind:'reflection'|'discussion')"),words.indexOf('async function savePrivateNote()'));
 const direct=messages.slice(messages.indexOf('async function send(e:FormEvent)'),messages.indexOf('return <div className="messages-composer">'));
 for(const text of [share,reply,direct]){
  assert.match(text,/await checkRecipientKeyContinuity\(/);
  assert.match(text,/RecipientKeyChangedError/);
  assert.ok(text.indexOf('await checkRecipientKeyContinuity(')>=0&&text.indexOf('await checkRecipientKeyContinuity(')<text.indexOf('await seal'),'Confirm the recipient key before encrypting any copy');
 }
 assert.match(words,/KeyChangeReview/);
 assert.match(messages,/KeyChangeReview/);
 const recovery=source('src/RecoveryReadiness.tsx');
 assert.match(recovery,/My encryption verification code/);
 assert.match(recovery,/fingerprintPublicKey\(registered\.publicKey\)/);
});
