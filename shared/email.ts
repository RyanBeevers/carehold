/** Keep the typed space that triggers OS text expansion until blur or submit. */
export const EMAIL_INPUT_PATTERN=String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;
export function normalizeEmailInput(value:string):string {
 return value.trim().toLowerCase();
}
const emailPattern=new RegExp('^(?:'+EMAIL_INPUT_PATTERN+')$','u');
export function isValidEmailInput(value:string):boolean {
 return value.length<=254&&emailPattern.test(value);
}
