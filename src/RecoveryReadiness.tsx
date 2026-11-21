import {useEffect,useState} from 'react';
import {api} from './lib/api';
import {LegacyMessageMigration} from './LegacyMessageMigration';
import {samePublicKey,storedMessageIdentity,type PublicKey} from './lib/message-crypto';

type Status='checking'|'configured'|'restore'|'legacy'|'setup'|'mismatch'|'error';
export function RecoveryReadiness({userId}:{userId:string}){
 const [status,setStatus]=useState<Status>('checking'),[error,setError]=useState('');
 useEffect(()=>{
  let live=true;setStatus('checking');setError('');
  void (async()=>{
   try{
    const [registered,recovery,local]=await Promise.all([
     api<{publicKey:PublicKey|null}>('/messages/keys/me'),
     api<{configured:boolean}>('/messages/recovery'),
     storedMessageIdentity(userId)
    ]);
    if(!live)return;
    if(registered.publicKey&&local&&!samePublicKey(registered.publicKey,local.publicKey)){
     setStatus('mismatch');
    }else if(recovery.configured&&registered.publicKey&&local){
     setStatus('configured');
    }else if(recovery.configured&&registered.publicKey){
     setStatus('restore');
    }else if(registered.publicKey){
     setStatus('legacy');
    }else setStatus('setup');
   }catch(e){
    if(live){setStatus('error');setError(e instanceof Error?e.message:'Cannot check recovery configuration.');}
   }
  })();
  return()=>{live=false;};
 },[userId]);
 const info:Record<Status,string>={
  checking:'Checking your encrypted account recovery…',
  configured:'A recovery code was configured and this browser has the enrolled key. Your encrypted messages and newly synced private journals can be recovered with your saved code.',
  restore:'This account has a recovery record, but this browser does not have the encryption key. Use your saved code to restore access.',
  legacy:'This account has an older browser key without recovery. Preserve it and use the non-destructive migration below to set up recovery.',
  setup:'Encryption recovery has not been configured. Set it up before sharing writing or saving private journals.',
  mismatch:'The key on this browser does not match the enrolled key. Do not clear browser storage or overwrite keys.',
  error:'Recovery status unavailable: '+error
 };
 return <><div className="setting-section"><div><h2>Encrypted data recovery</h2><p role="status">{info[status]}</p><p className="fine-print">Passkey sign-in alone does not restore decryption keys. Do not use private family information until legacy migration, device revocation and security review are finished.</p></div><a className="button outline" href="/words">Open Words recovery</a></div>{status==='legacy'&&<LegacyMessageMigration userId={userId}/>}</>;
}
