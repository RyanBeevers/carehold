import {api} from './api.ts';
import {samePublicKey,storedMessageIdentity,storeRecoveredMessageIdentity,storeRotatedMessageIdentity,unseal,type Identity,type PublicKey} from './message-crypto.ts';
import {openMessageRecoveryIdentity,type MessageRecoveryEnvelope} from './message-recovery.ts';
import {newTransferKeyPair,sealTransferCode,openTransferCode,assertSameTransferKey,type TransferEnvelope} from './trusted-device-crypto.ts';
import {signDeviceAuthorization,type DeviceSignatureAction} from './trusted-device-proof.ts';
import {localTrustedDevice,savePendingTransfer,pendingTransfer,discardPendingTransfer,readTrustedRecoveryCode,saveTrustedRecoveryCode} from './trusted-device-vault.ts';

export type TrustedDevice={id:string,name:string,createdAt:string,lastSeenAt:string,revokedAt:string|null,keyCurrent:boolean};
export type DeviceRequest={id:string,deviceId:string,deviceName:string,publicKey:PublicKey,accountPublicKey:PublicKey,state:'pending'|'approved'|'consumed'|'cancelled'|'expired',expiresAt:number,createdAt:string,envelope:TransferEnvelope|null};
export type DeviceDirectory={accountPublicKey:PublicKey,devices:TrustedDevice[],pendingRequests:DeviceRequest[]};
type DeviceChallenge={envelope:Parameters<typeof unseal>[0],accountPublicKey:PublicKey,challengeId:string};

/** This is a crypto proof, not merely a user session or a browser device ID.
 * The server encrypts a random single-use challenge for this account key.
 */
async function keyProof(userId:string,identity:Identity,deviceId:string,action:DeviceSignatureAction,targetId:string):Promise<{proof:string,signature:string,challengeId:string}>{
 const device=await localTrustedDevice(userId);
 if(device.id!==deviceId||!device.approvalPrivateKey||device.approvalPrivateKey.extractable)
  throw new Error('A different browser owns this trusted-device identity.');
 const challenge=await api<DeviceChallenge>('/trusted-devices/challenge','POST',{deviceId});
 if(!/^[0-9a-f-]{36}$/i.test(challenge.challengeId))throw new Error('Invalid trusted-device challenge.');
 if(!samePublicKey(identity.publicKey,challenge.accountPublicKey))
  throw new Error('Your account encryption identity changed. Restore it before managing devices.');
 const clear=await unseal(challenge.envelope,identity.privateKey,'carehold-trusted-device-register',deviceId,userId);
 if(clear.kind!=='message'||!/^[A-Za-z0-9_-]{43}$/.test(clear.text))throw new Error('Invalid device proof.');
 const signature=await signDeviceAuthorization(device.approvalPrivateKey,userId,deviceId,clear.text,action,targetId);
 return {proof:clear.text,signature,challengeId:challenge.challengeId};
}
const enrollmentInFlight=new Map<string,Promise<void>>();
export function enrollLocalTrustedDevice(userId:string,identity:Identity):Promise<void>{
 const current=enrollmentInFlight.get(userId);
 if(current)return current;
 // StrictMode and multiple mounted Settings views must not invalidate each
 // other's single-use server proof by generating competing challenges.
 const task=(async()=>{
  if(!identity.journalKey)throw new Error('Restore encrypted writing before registering this device.');
  const record=await localTrustedDevice(userId);
  const authorization=await keyProof(userId,identity,record.id,'enroll',record.id);
  await api('/trusted-devices/enroll','POST',{deviceId:record.id,label:record.name,
   approvalPublicKey:record.approvalPublicKey,...authorization});
 })().finally(()=>{enrollmentInFlight.delete(userId);});
 enrollmentInFlight.set(userId,task);
 return task;
}
export async function getTrustedDeviceDirectory():Promise<DeviceDirectory>{
 return api<DeviceDirectory>('/trusted-devices');
}
export async function enableTrustedApproval(userId:string,code:string,envelope:MessageRecoveryEnvelope):Promise<void>{
 await saveTrustedRecoveryCode(userId,code,envelope);
 const identity=await storedMessageIdentity(userId);
 if(!identity)throw new Error('Cannot find this device encryption key.');
 await enrollLocalTrustedDevice(userId,identity);
}
export async function approveTrustedDeviceRequest(userId:string,request:DeviceRequest,identity:Identity,recoveryEnvelope:MessageRecoveryEnvelope):Promise<void>{
 if(request.state!=='pending'||request.expiresAt<=Date.now())throw new Error('The request is no longer awaiting approval.');
 if(!samePublicKey(request.accountPublicKey,identity.publicKey))throw new Error('The registered account key changed. Restore it first.');
 const record=await localTrustedDevice(userId);
 const secret=await readTrustedRecoveryCode(userId,identity.publicKey);
 if(!secret)throw new Error('This browser cannot approve new devices yet. Save your CH1 backup in Advanced Security once to enable trusted-device approvals.');
 const restored=await openMessageRecoveryIdentity(userId,secret,recoveryEnvelope);
 if(!samePublicKey(restored.publicKey,identity.publicKey))throw new Error('The local trusted backup no longer matches the account.');
 const envelope=await sealTransferCode(userId,request.id,request.publicKey,identity.publicKey,secret);
 const authorization=await keyProof(userId,identity,record.id,'approve',request.id);
 await api('/trusted-devices/requests/'+encodeURIComponent(request.id)+'/approve','POST',{approverDeviceId:record.id,...authorization,envelope});
}
export async function startNewDeviceRequest(userId:string):Promise<string>{
 const local=await localTrustedDevice(userId);
 const pending=await pendingTransfer(userId);
 if(pending){
  try{
   const existing=await api<DeviceRequest>('/trusted-devices/requests/'+encodeURIComponent(pending.id));
   if((existing.state==='pending'||existing.state==='approved')&&existing.expiresAt>Date.now()){
    assertSameTransferKey(existing.publicKey,pending.publicKey);
    return pending.id;
   }
  }catch(e){
   // A network outage must not discard a valid pending private key.
   // An authenticated 404 is the only safe case to replace a missing request.
   if(!(e instanceof Error)||!e.message.includes('Device request unavailable'))throw e;
  }
  await discardPendingTransfer(userId);
 }
 const pair=await newTransferKeyPair(),requestId=crypto.randomUUID();
 await savePendingTransfer(userId,requestId,pair);
 try{
  await api('/trusted-devices/requests','POST',{id:requestId,deviceId:local.id,label:local.name,publicKey:pair.publicKey});
 }catch(e){
  // The pending request is retained. Retrying uses the exact same key and ID.
  throw e;
 }
 return requestId;
}
export async function finishApprovedDeviceRequest(userId:string,requestId:string):Promise<Identity>{
 const pending=await pendingTransfer(userId);
 if(!pending||pending.id!==requestId)throw new Error('The approval was started in another browser. Use that original browser tab.');
 const request=await api<DeviceRequest>('/trusted-devices/requests/'+encodeURIComponent(requestId));
 if(request.state!=='approved'||!request.envelope||request.expiresAt<Date.now())
  throw new Error('The device has not been approved yet. Keep the original device open.');
 assertSameTransferKey(request.publicKey,pending.publicKey);
 const server=await api<{configured:boolean,envelope:MessageRecoveryEnvelope|null}>('/messages/recovery');
 if(!server.configured||!server.envelope||!samePublicKey(server.envelope.publicKey,request.accountPublicKey))
  throw new Error('The account encryption key changed while approving this device.');
 const code=await openTransferCode(userId,requestId,pending,request.accountPublicKey,request.envelope);
 const identity=await openMessageRecoveryIdentity(userId,code,server.envelope);
 const previous=await storedMessageIdentity(userId);
 if(previous&&!samePublicKey(previous.publicKey,identity.publicKey))
  await storeRotatedMessageIdentity(userId,previous,identity);
 else await storeRecoveredMessageIdentity(userId,identity);
 await saveTrustedRecoveryCode(userId,code,server.envelope);
 await enrollLocalTrustedDevice(userId,identity);
 const device=await localTrustedDevice(userId);
 const authorization=await keyProof(userId,identity,device.id,'complete',requestId);
 await api('/trusted-devices/requests/'+encodeURIComponent(requestId)+'/complete','POST',{deviceId:device.id,...authorization});
 await discardPendingTransfer(userId);
 return identity;
}
export async function cancelDeviceRequest(userId:string,requestId:string):Promise<void>{
 await api('/trusted-devices/requests/'+encodeURIComponent(requestId)+'/cancel','POST',{});
 const pending=await pendingTransfer(userId);
 if(pending?.id===requestId)await discardPendingTransfer(userId);
}
export async function revokeTrustedDevice(userId:string,identity:Identity,targetId:string):Promise<{requiresEncryptionRotation:boolean}>{
 const current=await localTrustedDevice(userId);
 if(current.id===targetId)throw new Error('You cannot remove the device you are using.');
 const authorization=await keyProof(userId,identity,current.id,'revoke',targetId);
 return api('/trusted-devices/'+encodeURIComponent(targetId)+'/revoke','POST',{currentDeviceId:current.id,...authorization});
}
