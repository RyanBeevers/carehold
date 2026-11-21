import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseCareProfile} from '../shared/policy.ts';
test('minors and unverified accounts can view grants but never mutate care records',()=>{
 for(const cls of ['child','teen','unverified']){
  assert.equal(canUseCareProfile('member',cls,['view_schedule'],'view_schedule',false),true);
  assert.equal(canUseCareProfile('member',cls,['record_dose','manage_medication'],'record_dose',false),false);
  assert.equal(canUseCareProfile('member',cls,['record_dose','manage_medication'],'manage_medication',false),false);
  assert.equal(canUseCareProfile('owner',cls,[],'record_dose',false),false);
  assert.equal(canUseCareProfile('caregiver',cls,['manage_medication'],'manage_medication',false),false);
  assert.equal(canUseCareProfile('member',cls,[],'manage_medication',true),false);
 }
});
test('adult linked Member self-management needs no caregiver promotion',()=>{
 for(const cap of ['view_schedule','view_history','record_dose','manage_medication'])
  assert.equal(canUseCareProfile('member','adult',[],cap,true),true);
 assert.equal(canUseCareProfile('member','adult',[],'record_dose',false),false);
 assert.equal(canUseCareProfile('caregiver','adult',['record_dose'],'record_dose',false),true);
});
