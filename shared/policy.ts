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
