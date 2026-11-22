import type {PublicKey} from './message-crypto.ts';

/**
 * Device-unique, non-exportable ECDSA key for approving/enrolling/revoking
 * devices. The shared account ECDH key must NEVER be the sole proof of an
 * enrolled device's authority: removed browsers may retain that account key.
 */
export type DeviceSignatureAction='enroll'|'approve'|'revoke'|'complete';
export type DeviceSigningPair={privateKey:CryptoKey,publicKey:PublicKey};
const enc=new TextEncoder();
const KEY=/^[A-Za-z0-9_-]{43}$/;
const UUID=/^[0-9a-f-]{36}$/i;
const validPublic=(key:PublicKey)=>Boolean(key&&key.kty==='EC'&&key.crv==='P-256'&&KEY.test(key.x)&&KEY.test(key.y));
const b64=(data:Uint8Array)=>{let s='';for(const n of data)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64=(s:string)=>{
 if(!/^[A-Za-z0-9_-]{86}$/.test(s))throw new Error('Invalid device approval signature.');
 const data=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(data.length!==64)throw new Error('Invalid device approval signature.');
 return data;
};
function context(userId:string,deviceId:string,proof:string,action:DeviceSignatureAction,targetId:string):Uint8Array<ArrayBuffer>{
 if(!userId||userId.length>200||!UUID.test(deviceId)||!KEY.test(proof)||
  !['enroll','approve','revoke','complete'].includes(action)||!UUID.test(targetId))
  throw new Error('Invalid device authorization context.');
 return enc.encode(JSON.stringify(['carehold-unique-device-authorization-v1',userId,deviceId,proof,action,targetId]));
}
export async function newDeviceSigningPair():Promise<DeviceSigningPair>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']) as CryptoKeyPair;
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const publicKey:PublicKey={kty:'EC',crv:'P-256',x:jwk.x!,y:jwk.y!};
 if(!validPublic(publicKey)||pair.privateKey.extractable)throw new Error('Device approval key could not be enrolled.');
 return {privateKey:pair.privateKey,publicKey};
}
export async function signDeviceAuthorization(
 privateKey:CryptoKey,userId:string,deviceId:string,proof:string,
 action:DeviceSignatureAction,targetId:string
):Promise<string>{
 if(privateKey.extractable||privateKey.algorithm.name!=='ECDSA')throw new Error('Invalid device approval key.');
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,context(userId,deviceId,proof,action,targetId));
 return b64(new Uint8Array(signature));
}
export async function verifyDeviceAuthorization(
 publicKey:PublicKey,signature:string,userId:string,deviceId:string,
 proof:string,action:DeviceSignatureAction,targetId:string
):Promise<boolean>{
 if(!validPublic(publicKey))return false;
 try{
  const imported=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,unb64(signature),context(userId,deviceId,proof,action,targetId));
 }catch{return false;}
}
