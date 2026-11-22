import type {CareEnv,SessionUser} from './types';
import {validPublicJwk} from './messages-policy';
import {seal} from '../src/lib/message-crypto';
import {validTransferEnvelope} from '../src/lib/trusted-device-crypto';
import {verifyDeviceAuthorization,type DeviceSignatureAction} from '../src/lib/trusted-device-proof';
import type {PublicKey} from '../src/lib/message-crypto';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
class DeviceError extends Error{constructor(public status:number,message:string){super(message);}}
const fail=(status:number,message:string):never=>{throw new DeviceError(status,message);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const now=()=>Date.now();
const iso=()=>new Date().toISOString();
function str(v:unknown,min=1,max=60):string{
 if(typeof v!=='string'||v.length<min||v.length>max)return fail(400,'Invalid device information.');
 return v;
}
function id(v:unknown):string{const s=str(v,36,36);if(!UUID.test(s))fail(400,'Invalid device identifier.');return s;}
async function body(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Use JSON.');
 const raw=await req.text();if(raw.length>6000)fail(413,'Device request too large.');
 let b:unknown;try{b=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Invalid request.');
 return b as Record<string,unknown>;
}
async function sha(text:string){
 const d=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 return [...d].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function rnd(){
 const v=crypto.getRandomValues(new Uint8Array(32));let s='';for(const x of v)s+=String.fromCharCode(x);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
type DeviceRow={device_id:string,label:string,account_public_jwk:string,approval_public_jwk:string,created_at:string,last_seen_at:string,revoked_at:string|null};
type RequestRow={id:string,user_id:string,device_id:string,device_label:string,candidate_public_jwk:string,account_public_jwk:string,state:string,ciphertext_json:string|null,approved_by_device_id:string|null,created_at:string,expires_at:number,approved_at:string|null};
async function currentKey(db:D1Database,userId:string):Promise<{encoded:string,key:PublicKey}>{
 const row=await db.prepare('SELECT public_jwk FROM message_device_keys WHERE user_id=?').bind(userId).first<{public_jwk:string}>();
 if(!row)fail(409,'Set up encrypted writing before managing trusted devices.');
 return {encoded:row!.public_jwk,key:JSON.parse(row!.public_jwk) as PublicKey};
}
async function activeDevice(db:D1Database,userId:string,deviceId:string,encoded:string):Promise<DeviceRow>{
 const row=await db.prepare('SELECT * FROM trusted_devices WHERE user_id=? AND device_id=?')
  .bind(userId,deviceId).first<DeviceRow>();
 if(!row||row.revoked_at||row.account_public_jwk!==encoded)
  fail(403,'This device has not been approved with the current account key.');
 return row!;
}
/** One-time account-key proof: the server encrypts random challenge text to
 * the registered account public key, stores only its digest and expiry.
 * Authentication alone cannot enroll or revoke a trusted device.
 */
async function challenge(db:D1Database,userId:string,deviceId:string){
 const current=await currentKey(db,userId);
 const prior=await db.prepare('SELECT revoked_at FROM trusted_devices WHERE user_id=? AND device_id=?')
  .bind(userId,deviceId).first<{revoked_at:string|null}>();
 if(prior?.revoked_at)fail(403,'A removed device cannot rejoin with the same device identity.');
 const pending=await db.prepare('SELECT COUNT(*) AS n FROM trusted_device_challenges WHERE user_id=? AND expires_at>?')
  .bind(userId,now()).first<{n:number}>();
 if((pending?.n??0)>=20)fail(429,'Too many outstanding device checks. Retry after older checks expire.');
 const proof=rnd(),challengeId=crypto.randomUUID();
 const ciphertext=await seal({kind:'message',text:proof},current.key,'carehold-trusted-device-register',deviceId,userId);
 await db.prepare('INSERT INTO trusted_device_challenges(challenge_id,user_id,device_id,proof_hash,expires_at) VALUES(?,?,?,?,?)')
  .bind(challengeId,userId,deviceId,await sha(proof),now()+120_000).run();
 return {envelope:ciphertext,accountPublicKey:current.key,challengeId};
}
async function verifyProof(db:D1Database,userId:string,deviceId:string,proof:unknown,challengeId:unknown):Promise<void>{
 if(typeof proof!=='string'||typeof challengeId!=='string')return fail(403,'Current-device verification required.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(proof)||!UUID.test(challengeId))return fail(403,'Current-device verification required.');
 const row=await db.prepare('SELECT proof_hash,expires_at FROM trusted_device_challenges WHERE challenge_id=? AND user_id=? AND device_id=?')
  .bind(challengeId,userId,deviceId).first<{proof_hash:string,expires_at:number}>();
 if(!row)return fail(403,'Device verification expired or incorrect.');
 if(row.expires_at<now()||row.proof_hash!==await sha(proof))return fail(403,'Device verification expired or incorrect.');
 const consumed=await db.prepare('DELETE FROM trusted_device_challenges WHERE challenge_id=? AND user_id=? AND device_id=? AND proof_hash=? AND expires_at>=?')
  .bind(challengeId,userId,deviceId,row.proof_hash,now()).run();
 if(consumed.meta.changes!==1)fail(409,'Device verification was already used.');
}
/** Account-key decryption alone is not device authority: a revoked device
 * retains that account key. Verify a separate non-extractable per-device
 * ECDSA signature over this challenge and the exact requested action.
 */
async function signedProof(db:D1Database,userId:string,deviceId:string,proof:unknown,signature:unknown,
 challengeId:unknown,approvalPublic:PublicKey,action:DeviceSignatureAction,targetId:string):Promise<void>{
 if(typeof proof!=='string'||typeof signature!=='string')fail(403,'A trusted-device signature is required.');
 if(!await verifyDeviceAuthorization(approvalPublic,signature,userId,deviceId,proof,action,targetId))
  fail(403,'This device cannot authorize the requested action.');
 await verifyProof(db,userId,deviceId,proof,challengeId);
}
async function requestRow(db:D1Database,userId:string,requestId:string):Promise<RequestRow>{
 const row=await db.prepare('SELECT * FROM trusted_device_requests WHERE id=? AND user_id=?').bind(requestId,userId).first<RequestRow>();
 if(!row)fail(404,'Device request unavailable.');
 return row!;
}
const publicRequest=(row:RequestRow)=>({
 id:row.id,deviceId:row.device_id,deviceName:row.device_label,
 publicKey:JSON.parse(row.candidate_public_jwk),accountPublicKey:JSON.parse(row.account_public_jwk),
 state:row.expires_at<now()?'expired':row.state,expiresAt:row.expires_at,createdAt:row.created_at,
 envelope:row.state==='approved'?JSON.parse(row.ciphertext_json!):null
});
async function route(req:Request,env:CareEnv,user:SessionUser){
 const db=env.DB,url=new URL(req.url),p=url.pathname,method=req.method;
 // Clear expired encrypted CH1 transfers, not just their user-facing state.
 // The server never retains an approved recovery envelope indefinitely.
 await db.prepare("UPDATE trusted_device_requests SET state='cancelled',ciphertext_json=NULL WHERE user_id=? AND expires_at<? AND state IN ('pending','approved')")
  .bind(user.id,now()).run();
 await db.prepare('DELETE FROM trusted_device_challenges WHERE user_id=? AND expires_at<?')
  .bind(user.id,now()).run();
 if(p==='/api/trusted-devices'&&method==='GET'){
  const current=await currentKey(db,user.id);
  const [devices,pending]=await Promise.all([
   db.prepare('SELECT device_id,label,account_public_jwk,created_at,last_seen_at,revoked_at FROM trusted_devices WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all<DeviceRow>(),
   db.prepare("SELECT * FROM trusted_device_requests WHERE user_id=? AND state='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 10").bind(user.id,now()).all<RequestRow>()
  ]);
  return json({accountPublicKey:current.key,
   devices:(devices.results||[]).map(x=>({id:x.device_id,name:x.label,createdAt:x.created_at,lastSeenAt:x.last_seen_at,revokedAt:x.revoked_at,keyCurrent:x.account_public_jwk===current.encoded})),
   pendingRequests:(pending.results||[]).map(publicRequest)
  });
 }
 if(p==='/api/trusted-devices/challenge'&&method==='POST'){
  const b=await body(req);return json(await challenge(db,user.id,id(b.deviceId)));
 }
 if(p==='/api/trusted-devices/enroll'&&method==='POST'){
  const b=await body(req),deviceId=id(b.deviceId),label=str(b.label,1,60).trim();
  if(!label)fail(400,'Name this device.');
  const current=await currentKey(db,user.id);
  if(!validPublicJwk(b.approvalPublicKey))fail(400,'Invalid unique device approval key.');
  const approvalPublic=b.approvalPublicKey as PublicKey,approvalEncoded=JSON.stringify(approvalPublic);
  const existing=await db.prepare('SELECT revoked_at,approval_public_jwk FROM trusted_devices WHERE user_id=? AND device_id=?')
   .bind(user.id,deviceId).first<{revoked_at:string|null,approval_public_jwk:string}>();
  if(existing?.revoked_at)fail(403,'This device was removed. Restore on a different trusted device.');
  if(existing&&existing.approval_public_jwk!==approvalEncoded)
   fail(403,'This device identifier is bound to another approval key. No keys were overwritten.');
  // Possession of the shared account key must not allow a revoked phone to
  // invent another UUID and silently re-enroll while a trusted device exists.
  const active=await db.prepare('SELECT COUNT(*) AS n FROM trusted_devices WHERE user_id=? AND revoked_at IS NULL AND account_public_jwk=?')
   .bind(user.id,current.encoded).first<{n:number}>();
  if(!existing&&(active?.n??0)>0){
   const approval=await db.prepare("SELECT id FROM trusted_device_requests WHERE user_id=? AND device_id=? AND state='approved' AND account_public_jwk=? AND expires_at>? LIMIT 1")
    .bind(user.id,deviceId,current.encoded,now()).first();
   if(!approval)fail(403,'Approve this device from another trusted device, or rotate your recovery key if those devices were lost.');
  }
  await signedProof(db,user.id,deviceId,b.proof,b.signature,b.challengeId,approvalPublic,'enroll',deviceId);
  await db.prepare(`INSERT INTO trusted_devices(user_id,device_id,label,account_public_jwk,approval_public_jwk,created_at,last_seen_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id,device_id) DO UPDATE SET label=excluded.label,last_seen_at=excluded.last_seen_at,
    account_public_jwk=excluded.account_public_jwk WHERE trusted_devices.revoked_at IS NULL
    AND trusted_devices.approval_public_jwk=excluded.approval_public_jwk`)
   .bind(user.id,deviceId,label,current.encoded,approvalEncoded,iso(),iso()).run();
  return json({enrolled:true,deviceId});
 }
 if(p==='/api/trusted-devices/requests'&&method==='POST'){
  const b=await body(req),requestId=id(b.id),deviceId=id(b.deviceId),label=str(b.label,1,60).trim();
  if(!label||!validPublicJwk(b.publicKey))fail(400,'Invalid device approval request.');
  const current=await currentKey(db,user.id),candidate=JSON.stringify(b.publicKey);
  const enrolled=await db.prepare('SELECT revoked_at FROM trusted_devices WHERE user_id=? AND device_id=?')
   .bind(user.id,deviceId).first<{revoked_at:string|null}>();
  if(enrolled?.revoked_at)fail(403,'A previously removed device cannot silently re-enroll.');
  if(enrolled)fail(409,'This device is already enrolled; reload your existing Carehold session.');
  const existing=await db.prepare('SELECT * FROM trusted_device_requests WHERE user_id=? AND id=?')
   .bind(user.id,requestId).first<RequestRow>();
  if(existing){
   if(existing.device_id!==deviceId||existing.candidate_public_jwk!==candidate||existing.account_public_jwk!==current.encoded)
    fail(409,'An unrelated approval request already has this identifier.');
   return json(publicRequest(existing));
  }
  const num=await db.prepare("SELECT COUNT(*) n FROM trusted_device_requests WHERE user_id=? AND state IN ('pending','approved') AND expires_at>?")
   .bind(user.id,now()).first<{n:number}>();
  if((num?.n??0)>=3)fail(429,'Too many pending device approvals. Cancel an older request first.');
  await db.prepare(`INSERT INTO trusted_device_requests(id,user_id,device_id,device_label,candidate_public_jwk,account_public_jwk,state,created_at,expires_at)
   VALUES(?,?,?,?,?,?,'pending',?,?)`)
   .bind(requestId,user.id,deviceId,label,candidate,current.encoded,iso(),now()+15*60_000).run();
  return json({id:requestId,deviceId,deviceName:label,publicKey:b.publicKey,accountPublicKey:current.key,state:'pending',expiresAt:now()+15*60_000},201);
 }
 if(p==='/api/trusted-devices/requests'&&method==='GET'){
  const rows=await db.prepare("SELECT * FROM trusted_device_requests WHERE user_id=? AND state IN ('pending','approved') AND expires_at>? ORDER BY created_at DESC LIMIT 10")
   .bind(user.id,now()).all<RequestRow>();
  return json({requests:(rows.results||[]).map(publicRequest)});
 }
 const requestMatch=p.match(/^\/api\/trusted-devices\/requests\/([a-f0-9-]{36})(?:\/(approve|complete|cancel))?$/i);
 if(requestMatch){
  const row=await requestRow(db,user.id,id(requestMatch[1])),action=requestMatch[2];
  if(!action&&method==='GET')return json(publicRequest(row));
  if(row.expires_at<now())fail(410,'This approval expired. Request a new one.');
  if(method!=='POST')fail(405,'Unsupported device request action.');
  const b=await body(req);
  if(action==='approve'){
   const approver=id(b.approverDeviceId),current=await currentKey(db,user.id);
   const approverDevice=await activeDevice(db,user.id,approver,current.encoded);
   if(approver===row.device_id)fail(403,'A new device cannot approve itself.');
   if(row.account_public_jwk!==current.encoded||row.state!=='pending')fail(409,'Request is no longer awaiting approval.');
   if(!validTransferEnvelope(b.envelope))fail(400,'Invalid encrypted device transfer.');
   await signedProof(db,user.id,approver,b.proof,b.signature,b.challengeId,JSON.parse(approverDevice.approval_public_jwk) as PublicKey,'approve',row.id);
   const update=await db.prepare(`UPDATE trusted_device_requests SET state='approved',ciphertext_json=?,approved_by_device_id=?,approved_at=?
    WHERE id=? AND user_id=? AND state='pending' AND expires_at>? AND account_public_jwk=?`)
    .bind(JSON.stringify(b.envelope),approver,iso(),row.id,user.id,now(),current.encoded).run();
   if(update.meta.changes!==1)fail(409,'This approval changed while you were reviewing it.');
   return json({approved:true});
  }
  if(action==='complete'){
   if(row.state!=='approved'||row.device_id!==id(b.deviceId))fail(409,'Device approval has not completed.');
   const current=await currentKey(db,user.id);
   const completingDevice=await activeDevice(db,user.id,row.device_id,current.encoded);
   await signedProof(db,user.id,row.device_id,b.proof,b.signature,b.challengeId,JSON.parse(completingDevice.approval_public_jwk) as PublicKey,'complete',row.id);
   const updated=await db.prepare("UPDATE trusted_device_requests SET state='consumed',consumed_at=?,ciphertext_json=NULL WHERE id=? AND user_id=? AND state='approved'")
    .bind(iso(),row.id,user.id).run();
   if(updated.meta.changes!==1)fail(409,'Approval already completed.');
   return json({completed:true});
  }
  if(action==='cancel'){
   if(row.state==='consumed')fail(409,'An already-enrolled device cannot cancel its completed approval.');
   await db.prepare("UPDATE trusted_device_requests SET state='cancelled',ciphertext_json=NULL WHERE id=? AND user_id=? AND state IN ('pending','approved')").bind(row.id,user.id).run();
   return json({cancelled:true});
  }
 }
 const revoke=p.match(/^\/api\/trusted-devices\/([a-f0-9-]{36})\/revoke$/i);
 if(revoke&&method==='POST'){
  const b=await body(req),target=id(revoke[1]),currentDevice=id(b.currentDeviceId),current=await currentKey(db,user.id);
  if(target===currentDevice)fail(400,'You cannot remove the device you are currently using.');
  const authorizedDevice=await activeDevice(db,user.id,currentDevice,current.encoded);
  const existing=await db.prepare('SELECT revoked_at FROM trusted_devices WHERE user_id=? AND device_id=?')
   .bind(user.id,target).first<{revoked_at:string|null}>();
  if(!existing)return fail(404,'Device unavailable.');
  if(existing.revoked_at)return json({revoked:true,requiresEncryptionRotation:true});
  await signedProof(db,user.id,currentDevice,b.proof,b.signature,b.challengeId,JSON.parse(authorizedDevice.approval_public_jwk) as PublicKey,'revoke',target);
  await db.batch([
   db.prepare('UPDATE trusted_devices SET revoked_at=? WHERE user_id=? AND device_id=? AND revoked_at IS NULL').bind(iso(),user.id,target),
   db.prepare("UPDATE trusted_device_requests SET state='cancelled',ciphertext_json=NULL WHERE user_id=? AND device_id=? AND state IN ('pending','approved')").bind(user.id,target)
  ]);
  return json({revoked:true,requiresEncryptionRotation:true});
 }
 return fail(404,'Trusted-device route not found.');
}
export async function handleTrustedDevices(req:Request,env:CareEnv,user:SessionUser):Promise<Response>{
 try{return await route(req,env,user);}
 catch(e){if(e instanceof DeviceError)return json({error:e.message},e.status);throw e;}
}
/** Remove expired encrypted CH1 transfer payloads independently of sign-ins.
 * This must run on the existing scheduled Worker trigger even when neither
 * device ever returns to the site.
 */
export async function purgeExpiredDeviceTransfers(env:CareEnv):Promise<void>{
 await env.DB.batch([
  env.DB.prepare("UPDATE trusted_device_requests SET state='cancelled',ciphertext_json=NULL WHERE expires_at<? AND state IN ('pending','approved')").bind(now()),
  env.DB.prepare('DELETE FROM trusted_device_challenges WHERE expires_at<?').bind(now())
 ]);
}
