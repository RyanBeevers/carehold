import test from 'node:test';
import assert from 'node:assert/strict';
import {prompts,promptsForAudience,relationshipOptions,rotatePrompt} from '../src/lib/prompts.ts';
test('curated library has ~100 unique prompts with all relationship directions',()=>{
 assert.ok(prompts.length>=80&&prompts.length<=120);
 assert.equal(new Set(prompts.map(p=>p.id)).size,prompts.length);
 assert.equal(new Set(prompts.map(p=>p.text)).size,prompts.length);
 const relationships=['parent-child','parent-teen','child-parent','teen-parent','family'];
 for(const r of relationships)assert.ok(prompts.filter(p=>p.relationship===r).length>=10);
 for(const audience of ['parent','child','teen']){
  assert.ok(promptsForAudience(audience).length>=20);
  assert.ok(relationshipOptions(audience).length>=2);
 }
});
test('prompt rotation sees the whole filtered group before reusing a prompt',()=>{
 const choices=prompts.filter(p=>p.relationship==='parent-child').slice(0,4);
 let seen=[],previous=null;const selected=[];
 for(let i=0;i<4;i++){
  const next=rotatePrompt(choices,seen,previous,0);
  assert.ok(next.prompt);selected.push(next.prompt.id);
  previous=next.prompt.id;seen=next.seen;
 }
 assert.equal(new Set(selected).size,4);
 const next=rotatePrompt(choices,seen,previous,0);
 assert.notEqual(next.prompt.id,previous);
});
