/** Recipient-only pilot: care grants, age labels and owner roles never authorize thread reads. */
export type MessagingRole='owner'|'caregiver'|'member';
export const mayStartDirectMessage=(a:MessagingRole,b:MessagingRole)=>a==='owner'||b==='owner';
export function exactParticipants(actual:readonly string[],expected:readonly string[]):boolean{
 return actual.length===expected.length&&new Set(actual).size===actual.length&&expected.every(x=>actual.includes(x));
}
export function validPublicJwk(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).sort().join(',')==='crv,kty,x,y'&&v.kty==='EC'&&v.crv==='P-256'&&
 [v.x,v.y].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{43}$/.test(x));
}
export type SealedEnvelope={v:1,epk:JsonWebKey,iv:string,salt:string,ct:string};
export function validSealedEnvelope(value:unknown):value is SealedEnvelope{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).sort().join(',')==='ct,epk,iv,salt,v'&&v.v===1&&validPublicJwk(v.epk)&&
 typeof v.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(v.iv)&&
 typeof v.salt==='string'&&/^[A-Za-z0-9_-]{22}$/.test(v.salt)&&
 typeof v.ct==='string'&&v.ct.length>=22&&v.ct.length<=8500&&/^[A-Za-z0-9_-]+$/.test(v.ct);
}
export const pairKey=(a:string,b:string)=>[a,b].sort().join(':');
