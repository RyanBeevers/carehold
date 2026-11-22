import {type PublicKey,samePublicKey} from './message-crypto.ts';

/** Only encrypted recovery *codes* move through a trusted-device transfer.
 * This layer never sends the journal key or account private key in plaintext.
 * A matching eight-digit pairing number must be compared on both devices.
 * Server key substitution cannot produce a matching code on the new device
 * unless its substituted key has the same truncated SHA-256 fingerprint.
 */
export type TransferKeyPair={privateKey:CryptoKey,publicKey:PublicKey};
export type TransferEnvelope={v:1,epk:PublicKey,salt:string,iv:string,ct:string};
const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64=(s:string,expected?:number):Uint8Array<ArrayBuffer>=>{
 if(!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('Invalid encrypted transfer.');
 const bytes=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(expected!==undefined&&bytes.length!==expected)throw new Error('Invalid encrypted transfer.');
 return bytes;
};
const validKey=(key:PublicKey)=>key&&key.kty==='EC'&&key.crv==='P-256'&&
 /^[A-Za-z0-9_-]{43}$/.test(key.x)&&/^[A-Za-z0-9_-]{43}$/.test(key.y);
const context=(uid:string,id:string,to:PublicKey,account:PublicKey)=>{
 if(!uid||uid.length>200||!/^[0-9a-f-]{36}$/i.test(id)||!validKey(to)||!validKey(account))
  throw new Error('Invalid trusted-device request.');
 return enc.encode(JSON.stringify(['carehold-device-transfer-v1',uid,id,to,account]));
};
async function aes(local:CryptoKey,other:PublicKey,salt:Uint8Array<ArrayBuffer>,info:Uint8Array<ArrayBuffer>){
 const peer=await crypto.subtle.importKey('jwk',other,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},local,256));
 try{
  const base=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  return await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }finally{shared.fill(0);}
}
export async function newTransferKeyPair():Promise<TransferKeyPair>{
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']) as CryptoKeyPair;
 const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const publicKey={kty:'EC',crv:'P-256',x:pub.x!,y:pub.y!} as PublicKey;
 if(!validKey(publicKey)||pair.privateKey.extractable)throw new Error('Secure device key could not be generated.');
 return {privateKey:pair.privateKey,publicKey};
}
export async function pairingNumber(uid:string,id:string,to:PublicKey):Promise<string>{
 if(!validKey(to))throw new Error('Invalid pairing public key.');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',context(uid,id,to,to)));
 const raw=new DataView(digest.buffer).getUint32(0);
 return String(raw%100_000_000).padStart(8,'0').replace(/(\d{4})(\d{4})/,'$1 $2');
}
export async function sealTransferCode(uid:string,id:string,to:PublicKey,account:PublicKey,code:string):Promise<TransferEnvelope>{
 if(!/^CH1-[A-Za-z0-9_-]{43}$/.test(code))throw new Error('A saved recovery code is required to approve a device.');
 const info=context(uid,id,to,account);
 const ephemeral=await newTransferKeyPair();
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await aes(ephemeral.privateKey,to,salt,info);
 const payload=enc.encode(code);
 try{
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:info},key,payload);
  return {v:1,epk:ephemeral.publicKey,salt:b64(salt),iv:b64(iv),ct:b64(new Uint8Array(cipher))};
 }finally{payload.fill(0);}
}
export async function openTransferCode(uid:string,id:string,pending:TransferKeyPair,account:PublicKey,envelope:TransferEnvelope):Promise<string>{
 if(envelope?.v!==1||!validKey(envelope.epk)||!pending?.privateKey||pending.privateKey.extractable)
  throw new Error('Invalid approved device transfer.');
 const info=context(uid,id,pending.publicKey,account);
 const salt=unb64(envelope.salt,16),iv=unb64(envelope.iv,12),ct=unb64(envelope.ct);
 let bytes:Uint8Array<ArrayBuffer>;
 try{
  const key=await aes(pending.privateKey,envelope.epk,salt,info);
  bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:info},key,ct));
 }catch{throw new Error('Device approval could not be decrypted. Do not reset existing writing.');}
 try{
  const code=new TextDecoder().decode(bytes);
  if(!/^CH1-[A-Za-z0-9_-]{43}$/.test(code))throw new Error('Device approval did not contain a valid backup credential.');
  return code;
 }finally{bytes.fill(0);}
}
export function validTransferEnvelope(value:unknown):value is TransferEnvelope{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const e=value as Record<string,unknown>;
 return Object.keys(e).sort().join(',')==='ct,epk,iv,salt,v'&&e.v===1&&
  validKey(e.epk as PublicKey)&&typeof e.salt==='string'&&/^[A-Za-z0-9_-]{22}$/.test(e.salt)&&
  typeof e.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(e.iv)&&
  typeof e.ct==='string'&&/^[A-Za-z0-9_-]{35,200}$/.test(e.ct);
}
export function assertSameTransferKey(a:PublicKey,b:PublicKey){
 if(!samePublicKey(a,b))throw new Error('The approval request changed. Start a new approval on the new device.');
}
