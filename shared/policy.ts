export type Role = 'owner'|'caregiver'|'member';
export type Capability = 'view_schedule'|'record_dose'|'manage_medication'|'view_history';
export const CAPABILITIES:Capability[]=['view_schedule','record_dose','manage_medication','view_history'];
/** No journal or conversation privileges are represented in this capability set. */
export function canAccess(role:Role, grants:readonly Capability[], capability:Capability):boolean {
  return role==='owner' || grants.includes(capability);
}
export function validCapabilities(value:unknown):value is Capability[] {
  return Array.isArray(value)&&value.every(v=>CAPABILITIES.includes(v as Capability));
}

export type MemberClassification='adult'|'teen'|'child'|'unverified';
export const MEMBER_CLASSIFICATIONS:MemberClassification[]=['adult','teen','child','unverified'];
export function validMemberClassification(value:unknown):value is MemberClassification{
 return MEMBER_CLASSIFICATIONS.includes(value as MemberClassification);
}
export function canUseCareProfile(
 role:Role,classification:MemberClassification,grants:readonly Capability[],
 capability:Capability,linkedAdultSelf:boolean,fullCircleCaregiver=false
):boolean{
 // No account class chosen through a Words prompt can ever authorize care edits.
 const mutation=capability==='manage_medication'||capability==='record_dose';
 if(mutation&&classification!=='adult')return false;
 const self=classification==='adult'&&linkedAdultSelf;
 return self||(role==='caregiver'&&classification==='adult'&&fullCircleCaregiver)||canAccess(role,grants,capability);
}
