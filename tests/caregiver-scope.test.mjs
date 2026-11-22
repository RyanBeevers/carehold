import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseCareProfile} from '../shared/policy.ts';
import {readFileSync} from 'node:fs';

test('full-circle caregiver gets all medication capabilities, including new people',()=>{
 for(const capability of ['view_schedule','view_history','record_dose','manage_medication']){
  assert.equal(canUseCareProfile('caregiver','adult',[],capability,false,true),true);
  assert.equal(canUseCareProfile('caregiver','adult',[],capability,false,false),false);
 }
});
test('full-circle must never promote ordinary members or minors to medication editors',()=>{
 for(const role of ['member','owner'])
  assert.equal(canUseCareProfile(role,'adult',[],'manage_medication',false,true),role==='owner');
 for(const cls of ['child','teen','unverified']){
  assert.equal(canUseCareProfile('caregiver',cls,[],'view_schedule',false,true),false);
  assert.equal(canUseCareProfile('caregiver',cls,[],'record_dose',false,true),false);
  assert.equal(canUseCareProfile('caregiver',cls,[],'manage_medication',false,true),false);
 }
});
test('limited caregiver retains fine-grained explicit grants',()=>{
 assert.equal(canUseCareProfile('caregiver','adult',['view_schedule'],'view_schedule',false,false),true);
 assert.equal(canUseCareProfile('caregiver','adult',['view_schedule'],'record_dose',false,false),false);
 assert.equal(canUseCareProfile('caregiver','adult',['manage_medication'],'manage_medication',false,false),true);
});
test('full-circle and linked profile flags do not apply to Words authorization',()=>{
 const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
 assert.match(worker,/Only caregivers or owners can view the circle roster/);
 assert.match(worker,/if\(viewer!=='owner'\)return json/);
 assert.match(worker,/await owner\(db,hid,user\.id\);/);
 assert.match(worker,/member_access_changes/);
 const policy=readFileSync(new URL('../shared/policy.ts',import.meta.url),'utf8');
 assert.match(policy,/No journal or conversation privileges/);
});
