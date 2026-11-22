import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function harness(){
 const listeners={};const messages=[];const notifications=[];
 const self={location:{origin:'http://localhost:5173'},addEventListener:(type,cb)=>{listeners[type]=cb;},
  clients:{matchAll:async()=>[{postMessage:msg=>messages.push(msg)}],openWindow:async()=>{}},
  registration:{showNotification:async(title,options)=>{notifications.push({title,options});}}};
 runInNewContext(source,{self,URL,console});
 return {listeners,messages,notifications};
}
test('push records receipt and browser display request without sensitive data',async()=>{
 const h=harness(),id='aabbccdd-1111-4222-8333-444455556666';
 let completion;
 h.listeners.push({data:{json:()=>({tag:'carehold-test-'+id})},waitUntil:p=>{completion=p;}});
 await completion;
 assert.equal(h.notifications.length,1);
 assert.equal(h.notifications[0].options.tag,'carehold-test-'+id);
 assert.deepEqual(h.messages.map(x=>x.stage),['received','display-requested']);
 assert.ok(h.messages.every(x=>x.testId===id&&x.type==='carehold:push-test'));
 assert.ok(!JSON.stringify(h.messages).includes('medication'));
});
test('malformed push still displays generic, non-sensitive notification',async()=>{
 const h=harness();let completion;
 h.listeners.push({data:{json:()=>{throw Error('bad json');}},waitUntil:p=>{completion=p;}});
 await completion;
 assert.equal(h.notifications[0].options.body,'Open Carehold to check your care schedule.');
 assert.equal(h.messages.length,0);
});
