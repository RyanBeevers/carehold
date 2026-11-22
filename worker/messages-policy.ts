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

/** A stale sender must never encrypt for an obsolete recipient public key. */
export function matchesKeyRoster(
 supplied:unknown,participants:readonly {id:string,publicKey:unknown}[]
):boolean{
 if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))return false;
 const roster=supplied as Record<string,unknown>;
 if(!exactParticipants(Object.keys(roster),participants.map(p=>p.id)))return false;
 return participants.every(p=>{
  const given=roster[p.id] as Record<string,unknown>|undefined;
  const actual=p.publicKey as Record<string,unknown>|null;
  return validPublicJwk(given)&&validPublicJwk(actual)&&
   given!.kty===actual!.kty&&given!.crv===actual!.crv&&
   given!.x===actual!.x&&given!.y===actual!.y;
 });
}
