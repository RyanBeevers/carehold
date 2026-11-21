import {validPublicJwk} from './messages-policy.ts';

/**
 * Schema checks only. The Worker NEVER decrypts recovery ciphertext and does
 * not accept a plaintext recovery code, password-derived key, or private JWK.
 */
export type StoredRecoveryEnvelope={
 v:2;
 alg:'AES-256-GCM';
 kdf:'HKDF-SHA256';
 iv:string;
 salt:string;
 ct:string;
 publicKey:{kty:'EC';crv:'P-256';x:string;y:string};
};
export function validStoredRecoveryEnvelope(value:unknown):value is StoredRecoveryEnvelope{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).sort().join(',')==='alg,ct,iv,kdf,publicKey,salt,v'&&
  v.v===2&&v.alg==='AES-256-GCM'&&v.kdf==='HKDF-SHA256'&&
  validPublicJwk(v.publicKey)&&
  typeof v.iv==='string'&&/^[A-Za-z0-9_-]{16}$/.test(v.iv)&&
  typeof v.salt==='string'&&/^[A-Za-z0-9_-]{22}$/.test(v.salt)&&
  typeof v.ct==='string'&&v.ct.length>=200&&v.ct.length<=3000&&/^[A-Za-z0-9_-]+$/.test(v.ct);
}
