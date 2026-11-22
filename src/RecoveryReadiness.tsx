import {useCallback,useEffect,useState} from 'react';
import {api} from './lib/api';
import {LegacyMessageMigration} from './LegacyMessageMigration';
import {MessageRecoveryGate} from './MessageRecoveryGate';
import {RECOVERY_SEARCH_LABEL} from './RecoveryCodeSaveGuide';
import {samePublicKey,storedMessageIdentity,type Identity,type PublicKey} from './lib/message-crypto';

type Status='checking'|'configured'|'restore'|'legacy'|'setup'|'mismatch'|'error';
export function RecoveryReadiness({userId}:{userId:string}){
 const [status,setStatus]=useState<Status>('checking'),[error,setError]=useState('');
 const [retry,setRetry]=useState(0);
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
 },[userId,retry]);
 const onReady=useCallback((_identity:Identity)=>{setStatus('configured');setError('');},[]);
 const onError=useCallback((message:string)=>setError(message),[]);
 const info:Record<Status,string>={
  checking:'Checking your encrypted account recovery…',
  configured:'Recovery is configured on this browser. Your saved recovery code is needed to restore messages, private journals and successfully synced drafts on a different device.',
  restore:'This account has a recovery record, but this browser does not have the encryption key. Restore below with your saved code.',
  legacy:'This account has an older browser key without recovery. Preserve it and use the non-destructive migration below to set up recovery.',
  setup:'Encryption recovery has not been configured. Generate and save your code here before sharing writing or saving private journals.',
  mismatch:'The key on this browser does not match the enrolled key. Do not clear browser storage or overwrite keys.',
  error:'Recovery status unavailable: '+error
 };
 return <section className="recovery-readiness" aria-label="Encrypted account recovery settings">
  <div className="setting-section"><div><h2>Encrypted data recovery</h2>
   <p role="status">{info[status]}</p>
   {(status==='configured'||status==='restore')&&<p className="fine-print">Search your secure vault for <strong>{RECOVERY_SEARCH_LABEL}</strong>. Carehold cannot re-display a recovery code after setup.</p>}
   <p className="fine-print">Passkey sign-in alone does not restore encryption keys. This pilot has not completed device-revocation or confidentiality review; use fictional writing only.</p>
  </div>
   {status==='error'&&<button type="button" className="button outline" onClick={()=>setRetry(n=>n+1)}>Retry recovery check</button>}
  </div>
  {(status==='setup'||status==='restore')&&<MessageRecoveryGate key={userId+':'+status} userId={userId} onReady={onReady} onError={onError}/>}
  {status==='legacy'&&<LegacyMessageMigration userId={userId}/>}
  {status==='mismatch'&&<p role="alert" className="messages-error">This browser has a different key. Return to your original browser or restore on a clean trusted device using your saved code. Do not replace the existing key.</p>}
 </section>;
}
