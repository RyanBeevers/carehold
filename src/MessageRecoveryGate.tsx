import {useEffect,useState,type FormEvent} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,storedMessageIdentity,storeRecoveredMessageIdentity,type Identity,type PublicKey} from './lib/message-crypto';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,type MessageRecoveryEnvelope,type NewRecoveryIdentity} from './lib/message-recovery';

type Remote={publicKey:PublicKey|null};
type RecoveryStatus={configured:boolean,envelope:MessageRecoveryEnvelope|null};
type Mode='checking'|'setup'|'show-code'|'restore'|'blocked'|'ready';
const errorText=(e:unknown)=>e instanceof Error?e.message:'Encryption setup was not completed.';

/**
 * Fresh-account recovery setup and recovery for the experimental pilot.
 * No automatic legacy key reset, no server knowledge of recovery codes.
 * Not a production-ready device-revocation or encrypted-journal sync system.
 */
export function MessageRecoveryGate({userId,onReady,onError}:{
 userId:string,onReady:(identity:Identity)=>void,onError?:(error:string)=>void
}){
 const [mode,setMode]=useState<Mode>('checking');
 const [pending,setPending]=useState<NewRecoveryIdentity|null>(null);
 const [server,setServer]=useState<RecoveryStatus|null>(null);
 const [enrolledPublic,setEnrolledPublic]=useState<PublicKey|null>(null);
 const [saved,setSaved]=useState(false),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const announceRecovery=()=>window.dispatchEvent(new CustomEvent('carehold:recovery-ready',{detail:{userId}}));
 useEffect(()=>{
  let live=true;
  setMode('checking');setError('');setPending(null);setSaved(false);setCode('');
  void (async()=>{
   try{
    const remote=await api<Remote>('/messages/keys/me');
    const local=await storedMessageIdentity(userId);
    if(!live)return;
    setEnrolledPublic(remote.publicKey);
    if(remote.publicKey&&local&&samePublicKey(remote.publicKey,local.publicKey)){
     const status=await api<RecoveryStatus>('/messages/recovery');
     if(!live)return;
     if(!status.configured)setNotice('Legacy message key detected: recovery is not configured. Preserve this browser until a safe migration is available.');
     onReady(local);setMode('ready');return;
    }
    if(!remote.publicKey){
     if(local)throw new Error('An older device key exists locally but is not registered. No key will be replaced. Preserve this browser and complete legacy migration before enrollment.');
     setMode('setup');return;
    }
    const recovered=await api<RecoveryStatus>('/messages/recovery');
    if(!live)return;
    if(recovered.configured&&recovered.envelope&&samePublicKey(recovered.envelope.publicKey,remote.publicKey)){
     setServer(recovered);setMode('restore');
    }else{
     throw new Error('An older encryption key is enrolled without account recovery. Use the original browser to preserve historical messages; never erase or replace its key.');
    }
   }catch(e){
    if(!live||e instanceof StaleSessionRequest)return;
    const message=errorText(e);setError(message);onError?.(message);setMode('blocked');
   }
  })();
  return()=>{live=false;};
 },[userId,onReady,onError]);
 async function generate(){
  setBusy(true);setError('');setNotice('');
  try{
   const fresh=await createMessageRecoveryIdentity(userId);
   setPending(fresh);setMode('show-code');
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }
 async function completeEnrollment(){
  if(!pending||!saved||busy)return;
  setBusy(true);setError('');
  try{
   await api('/messages/recovery','POST',{envelope:pending.envelope});
   await storeRecoveredMessageIdentity(userId,pending.identity);
   onReady(pending.identity);announceRecovery();setMode('ready');
   setCode('');setPending(null);setNotice('Encryption recovery configured. Keep your recovery code offline.');
  }catch(e){
   try{
    const existing=await api<RecoveryStatus>('/messages/recovery');
    if(existing.configured&&existing.envelope){
     if(pending&&samePublicKey(existing.envelope.publicKey,pending.identity.publicKey)){
      await storeRecoveredMessageIdentity(userId,pending.identity);
      onReady(pending.identity);announceRecovery();setMode('ready');setPending(null);
      setNotice('Enrollment was already completed; this browser recovered the saved identity.');
      return;
     }
     setPending(null);setSaved(false);setMode('blocked');
     setError('Another browser enrolled a different encryption identity. The code generated in this tab is not valid for that identity. Keep the original browser and its recovery code; no keys were reset.');
     return;
    }
   }catch{}
   setError(errorText(e)+' Enrollment could not be confirmed. Preserve this displayed code, do not generate another yet, and retry after connectivity returns.');
  }finally{setBusy(false);}
 }
 async function restore(e:FormEvent){
  e.preventDefault();
  if(!server?.envelope||!enrolledPublic||busy)return;
  setBusy(true);setError('');
  try{
   const identity=await openMessageRecoveryIdentity(userId,code.trim(),server.envelope);
   if(!samePublicKey(identity.publicKey,enrolledPublic))throw new Error('The recovered key does not match the registered identity.');
   await storeRecoveredMessageIdentity(userId,identity);
   setCode('');
   onReady(identity);announceRecovery();setMode('ready');setNotice('Message key restored on this device.');
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }
 if(mode==='ready')return notice?<p role="status" className="muted tiny">{notice}</p>:null;
 return <section className="recovery-gate" aria-label="Message encryption recovery">
  <h3>Encrypted messages &amp; device recovery</h3>
  {mode==='checking'&&<p role="status">Checking this device’s encryption identity…</p>}
  {mode==='blocked'&&<p>Existing encrypted history has been preserved. This device cannot be enrolled until the original key is safely migrated.</p>}
  {mode==='setup'&&<><p>This account has not enrolled an encryption key. Before sharing writing, generate a recovery code that can restore your messages on a different browser or phone.</p>
   <p className="muted tiny">The 256-bit code is shown once. Carehold cannot restore old messages if you lose every trusted device and your recovery code.</p>
   <button type="button" className="button primary" disabled={busy} onClick={()=>void generate()}>{busy?'Preparing…':'Generate recovery code'}</button></>}
  {mode==='show-code'&&pending&&<><p>Save this recovery code somewhere secure and separate from this browser. It is not your password or passkey. Never share it with another household member.</p>
   <code className="recovery-secret" aria-label="Your one-time recovery code">{pending.recoveryCode}</code>
   <button type="button" className="button outline small" onClick={()=>void navigator.clipboard.writeText(pending.recoveryCode).then(()=>setNotice('Recovery code copied.')).catch(()=>setNotice('Clipboard unavailable. Copy the visible code manually.'))}>Copy code</button>
   <label className="recovery-confirm"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I saved this code somewhere I can access if I lose this device.</label>
   <button type="button" className="button primary" disabled={!saved||busy} onClick={()=>void completeEnrollment()}>{busy?'Enrolling…':'Complete secure enrollment'}</button>
   <p className="muted tiny">Do not navigate away until enrollment succeeds. The recovery code is never sent to the server.</p></>}
  {mode==='restore'&&<form onSubmit={e=>void restore(e)}><p>This account has encrypted messages from another browser. Enter your saved recovery code to authorize this device and access its shared history.</p>
   <label>Recovery code<input name="recovery-code" type="password" autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="CH1-…" required/></label>
   <button className="button primary" disabled={busy||!code.trim()}>{busy?'Recovering…':'Restore my message key'}</button>
   <p className="muted tiny">Account login alone cannot decrypt messages. Do not reset keys to bypass this screen.</p></form>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
 </section>;
}
