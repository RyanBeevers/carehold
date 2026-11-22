import {useCallback,useEffect,useState} from 'react';
import {api} from './lib/api';
import {LegacyMessageMigration} from './LegacyMessageMigration';
import {MessageRecoveryGate} from './MessageRecoveryGate';
import {RecoveryCodeRotation} from './RecoveryCodeRotation';
import {RECOVERY_SEARCH_LABEL} from './RecoveryCodeSaveGuide';
import {samePublicKey,storedMessageIdentity,type Identity,type PublicKey} from './lib/message-crypto';

type Status='checking'|'configured'|'restore'|'legacy'|'setup'|'mismatch'|'error';
export function RecoveryReadiness({userId}:{userId:string}){
 const [status,setStatus]=useState<Status>('checking'),[error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 const [missingCodeHelp,setMissingCodeHelp]=useState(false);
 const [replacementComplete,setReplacementComplete]=useState(false);
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
  configured:'This browser has an enrolled encryption key. That confirms local access — not that the one-time recovery code was saved elsewhere. Without your saved CH1- code, a different device cannot recover this key.',
  restore:'This account has a recovery record, but this browser does not have the encryption key. Restore below with your saved code.',
  legacy:'This account has an older browser key without recovery. Preserve it and use the non-destructive migration below to set up recovery.',
  setup:'Encryption recovery has not been configured. Generate and save your code here before sharing writing or saving private journals.',
  mismatch:'The key on this browser does not match the enrolled key. Do not clear browser storage or overwrite keys.',
  error:'Recovery status unavailable: '+error
 };
 return <section className="recovery-readiness" aria-label="Encrypted account recovery settings">
  <div className="setting-section"><div><h2>Encrypted data recovery</h2>
   <p role="status">{info[status]}</p>
   {(status==='configured'||status==='restore')&&<p className="fine-print">Search your secure vault for <strong>{RECOVERY_SEARCH_LABEL}</strong>. Carehold does not automatically put codes in Apple Passwords, and it cannot re-display one after setup.</p>}
   {status==='configured'&&<button type="button" className="button outline small" aria-expanded={missingCodeHelp} onClick={()=>setMissingCodeHelp(v=>!v)}>{missingCodeHelp?'Hide recovery code guidance':"I didn't save my recovery code"}</button>}
   {status==='configured'&&missingCodeHelp&&<div className="recovery-missing-code" role="status">
    <strong>Keep this browser and its Carehold site data intact.</strong>
    <p>The enrolled key should still open your encrypted data on this browser. Without the old CH1- code, another device cannot recover that old key. You can now use <strong>Replace lost recovery code</strong> below on this original browser: the experimental flow creates a new recoverable key, verifies migrated ciphertext, and refuses to finalize if anything is missing. Do not reset keys, clear browser storage, delete the account, or retry legacy migration. Complete local tests before relying on the replacement for real information.</p>
    <p>If you have private journal entries, use the separate encrypted journal export where available and store its passphrase safely. That export does not back up Messages or shared Words.</p>
   </div>}
   <p className="fine-print">Passkey sign-in alone does not restore encryption keys. This pilot has not completed device-revocation or confidentiality review; use fictional writing only.</p>
  </div>
   {status==='error'&&<button type="button" className="button outline" onClick={()=>setRetry(n=>n+1)}>Retry recovery check</button>}
  </div>
  {(status==='setup'||status==='restore')&&<MessageRecoveryGate key={userId+':'+status} userId={userId} onReady={onReady} onError={onError}/>}
  {status==='configured'&&replacementComplete&&<p role="status" className="recovery-replaced-status"><strong>New recovery code enrolled successfully.</strong> Keep the externally saved code. Verify access from a separate browser profile before relying on it.</p>}
  {status==='configured'&&<RecoveryCodeRotation userId={userId} onComplete={()=>{setReplacementComplete(true);setMissingCodeHelp(false);setRetry(n=>n+1);}}/>}
  {status==='legacy'&&<LegacyMessageMigration userId={userId}/>}
  {status==='mismatch'&&<><p role="alert" className="messages-error">This browser has an older encryption key. If you intentionally replaced your recovery code on another trusted device, enter the new saved CH1- code below. Carehold will retain the old browser key in local history instead of deleting it.</p>
   <MessageRecoveryGate key={userId+':mismatch'} userId={userId} onReady={onReady} onError={onError}/></>}
 </section>;
}
