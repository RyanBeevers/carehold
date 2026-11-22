import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const routes=read('worker/trusted-devices.ts');
const index=read('worker/index.ts');
const setup=read('src/MessageRecoveryGate.tsx');
const client=read('src/lib/trusted-device-client.ts');
const manager=read('src/TrustedDevices.tsx');
const transfer=read('src/NewDeviceApproval.tsx');
const vault=read('src/lib/trusted-device-vault.ts');
const sql=read('migrations/0019_trusted_devices.sql');

test('all trusted-device endpoints are authenticated and gated by an enrolled passkey',()=>{
 const passkey=index.indexOf('await requirePasskey(db,user.id)');
 const routesStart=index.indexOf("if(path.startsWith('/api/trusted-devices'))");
 assert.ok(passkey>0&&routesStart>passkey);
 assert.match(index,/handleTrustedDevices\(req,env,user\)/);
 for(const route of ['/api/trusted-devices/challenge','/api/trusted-devices/enroll','/api/trusted-devices/requests'])
  assert.ok(routes.includes(route),'Missing device API '+route);
 assert.match(index,/SELECT 1 FROM trusted_devices LIMIT 1/);
 assert.match(index,/SELECT 1 FROM trusted_device_requests LIMIT 1/);
 assert.match(index,/SELECT 1 FROM trusted_device_challenges LIMIT 1/);
});

test('new devices prove they possess the correct account private key before joining',()=>{
 assert.match(routes,/await seal\(\{kind:'message',text:proof\},current\.key/);
 assert.match(routes,/INSERT INTO trusted_device_challenges\(challenge_id,user_id,device_id,proof_hash,expires_at\)/);
 assert.match(routes,/DELETE FROM trusted_device_challenges WHERE challenge_id=\? AND user_id=\? AND device_id=\?/);
 assert.match(sql,/challenge_id TEXT PRIMARY KEY/);
 assert.match(routes,/await signedProof\(db,user\.id,deviceId,b\.proof,b\.signature,b\.challengeId,approvalPublic,'enroll',deviceId\)/);
 assert.match(routes,/trusted_devices\.approval_public_jwk=excluded\.approval_public_jwk/);
 assert.match(routes,/SELECT COUNT\(\*\) AS n FROM trusted_devices WHERE user_id=\? AND revoked_at IS NULL AND account_public_jwk=\?/);
 assert.match(routes,/if\(!existing&&\(active\?\.n\?\?0\)>0\)/);
 assert.match(routes,/state='approved' AND account_public_jwk=\? AND expires_at>\?/);
 assert.match(routes,/expires_at<now\(\)/);
 assert.match(routes,/proof_hash/);
 assert.match(client,/unseal\(challenge\.envelope,identity\.privateKey/);
 assert.match(client,/samePublicKey\(identity\.publicKey,challenge\.accountPublicKey\)/);
 assert.match(sql,/CREATE TABLE trusted_device_challenges/);
});

test('approvals require an active previously enrolled device and recipient-bound ciphertext',()=>{
 assert.match(routes,/await activeDevice\(db,user\.id,approver,current\.encoded\)/);
 assert.match(routes,/await signedProof\(db,user\.id,approver,b\.proof,b\.signature,b\.challengeId,JSON\.parse\(approverDevice\.approval_public_jwk\)/);
 assert.match(routes,/await signedProof\(db,user\.id,row\.device_id,b\.proof,b\.signature,b\.challengeId,JSON\.parse\(completingDevice\.approval_public_jwk\)/);
 assert.match(routes,/validTransferEnvelope\(b\.envelope\)/);
 assert.match(routes,/state='pending' AND expires_at>\?/);
 assert.match(routes,/ciphertext_json=NULL WHERE user_id=\? AND expires_at<\?/);
 assert.match(routes,/DELETE FROM trusted_device_challenges WHERE user_id=\? AND expires_at<\?/);
 assert.match(routes,/export async function purgeExpiredDeviceTransfers/);
 assert.match(index,/purgeExpiredDeviceTransfers\(env\)/);
 assert.match(client,/await readTrustedRecoveryCode\(userId,identity\.publicKey\)/);
 assert.match(client,/await openMessageRecoveryIdentity\(userId,secret,recoveryEnvelope\)/);
 assert.match(client,/sealTransferCode\(userId,request\.id,request\.publicKey,identity\.publicKey,secret\)/);
 assert.match(client,/assertSameTransferKey\(request\.publicKey,pending\.publicKey\)/);
 assert.match(vault,/false,\['encrypt','decrypt'\]/);
 assert.doesNotMatch(routes,/console\.log|console\.error|JSON\.stringify\(\{[^}]*recoveryCode/);
});

test('installed PWA can recover on a new device and fall back to CH1 without erasing browser keys',()=>{
 assert.match(setup,/<NewDeviceApproval userId=\{userId\}/);
 assert.match(setup,/Use my saved backup code instead/);
 assert.match(setup,/openMessageRecoveryIdentity\(userId,code\.trim\(\),server\.envelope\)/);
 assert.match(client,/await openTransferCode\(/);
 assert.match(client,/await storeRecoveredMessageIdentity\(userId,identity\)/);
 assert.match(client,/storeRotatedMessageIdentity\(userId,previous,identity\)/);
 assert.match(client,/await saveTrustedRecoveryCode\(userId,code,server\.envelope\)/);
 assert.match(transfer,/pairingNumber\(userId,requestId,pending\.publicKey\)/);
 assert.match(transfer,/document\.visibilityState==='visible'/);
 assert.match(transfer,/onReadyRef\.current\(identity\)/);
 assert.doesNotMatch(client+transfer,/indexedDB\.deleteDatabase\(|localStorage\.clear\(|deleteAccount\(/);
});

test('device removal is explicit and never misrepresented as cryptographic key erasure',()=>{
 assert.match(manager,/Removing a device does not yet revoke its already-imported account encryption key/);
 assert.match(manager,/rotate your account encryption key/);
 assert.match(routes,/requiresEncryptionRotation:true/);
 assert.match(routes,/await signedProof\(db,user\.id,currentDevice,b\.proof,b\.signature,b\.challengeId,JSON\.parse\(authorizedDevice\.approval_public_jwk\)/);
 assert.match(routes,/target===currentDevice/);
 assert.match(routes,/UPDATE trusted_devices SET revoked_at=/);
 assert.match(sql,/account_public_jwk TEXT NOT NULL/);
 assert.match(sql,/approval_public_jwk TEXT NOT NULL/);
 assert.match(vault,/approvalPrivateKey:CryptoKey/);
 assert.match(client,/signDeviceAuthorization\(device\.approvalPrivateKey/);
 assert.match(client,/action:DeviceSignatureAction,targetId:string/);
 assert.match(manager,/The numbers match on both of my devices/);
 assert.match(manager,/disabled=\{!matched\|\|!pairing\|\|busy\}/);
});
