import test from 'node:test';
import assert from 'node:assert/strict';
import {api,invalidatePendingApiResponses,StaleSessionRequest} from '../src/lib/api.ts';

test('a response started before logout cannot return care data afterward',async()=>{
 const original=globalThis.fetch;
 let resolveFetch;
 globalThis.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
 try{
   const pending=api('/profiles?householdId=fake');
   invalidatePendingApiResponses();
   resolveFetch(new Response(JSON.stringify({profiles:[{display_name:'private-test'}]}),{status:200,headers:{'Content-Type':'application/json'}}));
   await assert.rejects(pending,StaleSessionRequest);
 }finally{globalThis.fetch=original;}
});
test('a second session can still make fresh API requests',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({profiles:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 try{
   assert.deepEqual(await api('/profiles?householdId=fake'),{profiles:[]});
 }finally{globalThis.fetch=original;}
});
