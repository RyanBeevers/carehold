import test from 'node:test';
import assert from 'node:assert/strict';
import {validAudience} from '../shared/audience.ts';
import {promptsForAudience,prompts} from '../src/lib/prompts.ts';
test('pilot audiences exclude clinical privileges',()=>{
 for(const value of ['parent','child','teen'])assert.equal(validAudience(value),true);
 for(const value of ['doctor','caregiver','owner','member',null,undefined,4])assert.equal(validAudience(value),false);
});
test('prompts never cross audience boundaries',()=>{
 for(const audience of ['parent','child','teen']){
  const selected=promptsForAudience(audience);
  assert.ok(selected.some(p=>p.audience===audience));
  assert.ok(selected.every(p=>p.audience===audience||p.audience==='all'));
 }
 assert.notDeepEqual(promptsForAudience('child').map(p=>p.id),promptsForAudience('teen').map(p=>p.id));
});
test('static prompt IDs are unique and copy is populated',()=>{
 assert.equal(new Set(prompts.map(p=>p.id)).size,prompts.length);
 assert.ok(prompts.every(p=>p.text.trim().length>=10));
});
