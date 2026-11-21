export type Audience='parent'|'child'|'teen';
/**
 * Self-selected prompt audience, not a permission or proof of age.
 * Household authorization is always resolved separately from grants/membership.
 */
export function validAudience(value:unknown):value is Audience {
 return value==='parent'||value==='child'||value==='teen';
}
