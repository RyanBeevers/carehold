import {samePublicKey,type Identity,type PublicKey} from './message-crypto.ts';

/**
 * Experimental account recovery building block; NOT enabled for real data.
 *
 * Generates a fresh, random 256-bit recovery secret and wraps an account's P-256
 * private key AND independently random 256-bit journal key locally. Only the ciphertext and public key may be uploaded.
 * This does not recover legacy, non-extractable browser keys.
 *
 * TODO before launch: verified device enrollment, device revocation/rotation,
 * journal encrypted sync, legacy-key migration, independent security review.
 */
export type MessageRecoveryEnvelope = {
 v:2;
 kdf:'HKDF-SHA256';
 alg:'AES-256-GCM';
 salt:string;
 iv:string;
 ct:string;
 publicKey:PublicKey;
};
export type NewRecoveryIdentity = {
 identity:Identity;
 recoveryCode:string;
 envelope:MessageRecoveryEnvelope;
};
const encoder=new TextEncoder();
const purpose='carehold-account-recovery-v2';
const b64=(value:Uint8Array):string=>{
 let raw='';
 for(const byte of value)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64=(value:string,expected?:number):Uint8Array<ArrayBuffer>=>{
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid recovery data.');
 const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(expected!==undefined&&bytes.length!==expected)throw new Error('Invalid recovery data.');
 return bytes;
};
const validUser=(userId:string)=>{
 if(!userId||userId.length>200)throw new Error('Sign in before using encrypted recovery.');
};
function validatePublic(value:unknown):value is PublicKey{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const key=value as Record<string,unknown>;
 return Object.keys(key).sort().join(',')==='crv,kty,x,y'&&key.kty==='EC'&&key.crv==='P-256'&&
  [key.x,key.y].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v));
}
export function validMessageRecoveryEnvelope(value:unknown):value is MessageRecoveryEnvelope{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const e=value as Record<string,unknown>;
 return Object.keys(e).sort().join(',')==='alg,ct,iv,kdf,publicKey,salt,v'&&
  e.v===2&&e.kdf==='HKDF-SHA256'&&e.alg==='AES-256-GCM'&&
  validatePublic(e.publicKey)&&
  typeof e.salt==='string'&&/^[A-Za-z0-9_-]{22}$/.test(e.salt)&&
  typeof e.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(e.iv)&&
  typeof e.ct==='string'&&e.ct.length>=200&&e.ct.length<=3000&&/^[A-Za-z0-9_-]+$/.test(e.ct);
}
function context(userId:string,key:PublicKey){
 return encoder.encode(purpose+':'+userId+':'+JSON.stringify(key));
}
async function wrappingKey(secret:Uint8Array<ArrayBuffer>,salt:Uint8Array<ArrayBuffer>){
 const source=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey(
  {name:'HKDF',hash:'SHA-256',salt,info:encoder.encode(purpose)},
  source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
 );
}
async function verifyPair(privateKey:CryptoKey,publicKey:PublicKey):Promise<void>{
 const peer=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']) as CryptoKeyPair;
 const publicCryptoKey=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const a=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:publicCryptoKey},peer.privateKey,256));
 const b=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer.publicKey},privateKey,256));
 let different=0;
 for(let i=0;i<a.length;i++)different|=a[i]^b[i];
 a.fill(0);b.fill(0);
 if(different)throw new Error('Recovery key does not match the enrolled public key.');
}
/**
 * Caller must not upload/store the recoveryCode; display it once for user
 * custody. The local private key is imported again as non-extractable.
 */
export async function createMessageRecoveryIdentity(userId:string):Promise<NewRecoveryIdentity>{
 validUser(userId);
 const secret=crypto.getRandomValues(new Uint8Array(32));
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 if(!validatePublic({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y}))throw new Error('Unexpected public key.');
 const publicKey:PublicKey={kty:'EC',crv:'P-256',x:jwk.x!,y:jwk.y!};
 const raw=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
 const bytes=new Uint8Array(raw);
 // Independent random journal key; not derived from the ECDH messaging key.
 const journalBytes=crypto.getRandomValues(new Uint8Array(32));
 try{
  const key=await wrappingKey(secret,salt);
  const bundle=encoder.encode(JSON.stringify({v:2,messagePrivateKey:b64(bytes),journalKey:b64(journalBytes)}));
  try{
   const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(userId,publicKey)},key,bundle);
   const privateKey=await crypto.subtle.importKey('pkcs8',raw,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
   const journalKey=await crypto.subtle.importKey('raw',journalBytes,'AES-GCM',false,['encrypt','decrypt']);
   return {
    identity:{privateKey,publicKey,journalKey},
    recoveryCode:'CH1-'+b64(secret),
    envelope:{v:2,kdf:'HKDF-SHA256',alg:'AES-256-GCM',salt:b64(salt),iv:b64(iv),ct:b64(new Uint8Array(ciphertext)),publicKey}
   };
  }finally{bundle.fill(0);}
 }finally{bytes.fill(0);journalBytes.fill(0);secret.fill(0);}
}
/**
 * A passkey/account login alone cannot open this envelope. Successful
 * decryption requires the separately retained 256-bit recovery code.
 */
export async function openMessageRecoveryIdentity(
 userId:string,recoveryCode:string,envelope:MessageRecoveryEnvelope
):Promise<Identity>{
 validUser(userId);
 if(!validMessageRecoveryEnvelope(envelope))throw new Error('Unsupported account recovery envelope.');
 if(typeof recoveryCode!=='string'||!/^CH1-[A-Za-z0-9_-]{43}$/.test(recoveryCode))
  throw new Error('Enter the recovery code saved during setup.');
 const secret=unb64(recoveryCode.slice(4),32);
 const salt=unb64(envelope.salt,16),iv=unb64(envelope.iv,12),cipher=unb64(envelope.ct);
 let raw:ArrayBuffer;
 try{
  const key=await wrappingKey(secret,salt);
  raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:context(userId,envelope.publicKey)},key,cipher);
 }catch{throw new Error('Recovery failed. The code or encrypted record is incorrect.');}
 finally{secret.fill(0);}
 const bytes=new Uint8Array(raw);
 let decoded:unknown;
 try{decoded=JSON.parse(new TextDecoder().decode(bytes));}
 catch{throw new Error('Encrypted recovery bundle is invalid.');}
 finally{bytes.fill(0);}
 if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw new Error('Encrypted recovery bundle is invalid.');
 const value=decoded as Record<string,unknown>;
 if(value.v!==2||typeof value.messagePrivateKey!=='string'||typeof value.journalKey!=='string')
  throw new Error('Encrypted recovery bundle is incomplete.');
 const messageBytes=unb64(value.messagePrivateKey);
 const journalBytes=unb64(value.journalKey,32);
 try{
  const privateKey=await crypto.subtle.importKey('pkcs8',messageBytes,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  await verifyPair(privateKey,envelope.publicKey);
  const journalKey=await crypto.subtle.importKey('raw',journalBytes,'AES-GCM',false,['encrypt','decrypt']);
  return {privateKey,publicKey:envelope.publicKey,journalKey};
 }finally{messageBytes.fill(0);journalBytes.fill(0);}
}
export function assertMatchingRecoveryIdentity(identity:Identity,envelope:MessageRecoveryEnvelope){
 if(!samePublicKey(identity.publicKey,envelope.publicKey))
  throw new Error('The stored recovery envelope belongs to another encryption key.');
}
