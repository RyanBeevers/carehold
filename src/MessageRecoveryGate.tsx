import {useEffect,useState,type FormEvent} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,storedMessageIdentity,storeRecoveredMessageIdentity,storeRotatedMessageIdentity,storedPendingRecoveryEnvelope,storePendingRecoveryEnvelope,clearPendingRecoveryEnvelope,type Identity,type PublicKey} from './lib/message-crypto';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,type MessageRecoveryEnvelope,type NewRecoveryIdentity} from './lib/message-recovery';
import {RecoveryCodeSaveGuide,RECOVERY_SEARCH_LABEL} from './RecoveryCodeSaveGuide';

type Remote={publicKey:PublicKey|null};
type RecoveryStatus={configured:boolean,envelope:MessageRecoveryEnvelope|null};
type Mode='checking'|'setup'|'show-code'|'resume-setup'|'restore'|'blocked'|'ready';
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
 const [pendingResume,setPendingResume]=useState<MessageRecoveryEnvelope|null>(null);
 const [enrolledPublic,setEnrolledPublic]=useState<PublicKey|null>(null);
 const [saved,setSaved]=useState(false),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const announceRecovery=()=>window.dispatchEvent(new CustomEvent('carehold:recovery-ready',{detail:{userId}}));
 useEffect(()=>{
  let live=true;
  setMode('checking');setError('');setPending(null);setPendingResume(null);setSaved(false);setCode('');
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
     const unfinished=await storedPendingRecoveryEnvelope(userId,'fresh');
     if(!live)return;
     if(unfinished){setPendingResume(unfinished);setMode('resume-setup');return;}
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
   await storePendingRecoveryEnvelope(userId,'fresh',fresh.envelope);
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
   await clearPendingRecoveryEnvelope(userId,'fresh').catch(()=>{});
   onReady(pending.identity);announceRecovery();setMode('ready');
   setCode('');setPending(null);setNotice('Encryption recovery configured. Keep your recovery code offline.');
  }catch(e){
   try{
    const existing=await api<RecoveryStatus>('/messages/recovery');
    if(existing.configured&&existing.envelope){
     if(pending&&samePublicKey(existing.envelope.publicKey,pending.identity.publicKey)&&JSON.stringify(existing.envelope)===JSON.stringify(pending.envelope)){
      await storeRecoveredMessageIdentity(userId,pending.identity);
      await clearPendingRecoveryEnvelope(userId,'fresh').catch(()=>{});
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
   const previous=await storedMessageIdentity(userId);
   // Another browser may still hold an older non-extractable account key.
   // Preserve it in local history instead of clearing site data or replacing it.
   if(previous&&!samePublicKey(previous.publicKey,identity.publicKey))
    await storeRotatedMessageIdentity(userId,previous,identity);
   else await storeRecoveredMessageIdentity(userId,identity);
   await clearPendingRecoveryEnvelope(userId,'fresh').catch(()=>{});
   setCode('');
   onReady(identity);announceRecovery();setMode('ready');setNotice('Message key restored on this device.');
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }
 async function completeResumedEnrollment(e:FormEvent){
  e.preventDefault();
  if(!pendingResume||!saved||busy||!code.trim())return;
  setBusy(true);setError('');
  try{
   const identity=await openMessageRecoveryIdentity(userId,code.trim(),pendingResume);
   const remote=await api<Remote>('/messages/keys/me');
   if(remote.publicKey){
    const enrolled=await api<RecoveryStatus>('/messages/recovery');
    if(!samePublicKey(remote.publicKey,identity.publicKey)||!enrolled.configured||
     !enrolled.envelope||JSON.stringify(enrolled.envelope)!==JSON.stringify(pendingResume))
     throw new Error('The enrolled identity or recovery record differs from the unfinished attempt. No keys were replaced.');
   }
   if(!remote.publicKey){
    try{await api('/messages/recovery','POST',{envelope:pendingResume});}
    catch(e){
     const current=await api<RecoveryStatus>('/messages/recovery');
     if(!current.configured||!current.envelope||!samePublicKey(current.envelope.publicKey,identity.publicKey)||JSON.stringify(current.envelope)!==JSON.stringify(pendingResume))throw e;
    }
   }
   await storeRecoveredMessageIdentity(userId,identity);
   await clearPendingRecoveryEnvelope(userId,'fresh').catch(()=>{});
   setCode('');setPendingResume(null);setMode('ready');
   onReady(identity);announceRecovery();
   setNotice('Your saved code restored this unfinished setup and enrollment completed.');
  }catch(e){setError(errorText(e)+' The unfinished encrypted setup was preserved.');}
  finally{setBusy(false);}
 }
 async function discardUnregisteredSetup(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const remote=await api<Remote>('/messages/keys/me');
   if(remote.publicKey)throw new Error('An account encryption key is now enrolled. Reload and restore rather than resetting it.');
   await clearPendingRecoveryEnvelope(userId,'fresh');
   setPendingResume(null);setCode('');setSaved(false);setMode('setup');
   setNotice('Only the unfinished, unregistered setup was discarded. No enrolled keys or messages were deleted.');
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }

 if(mode==='ready')return notice?<p role="status" className="muted tiny">{notice}</p>:null;
 return <section className="recovery-gate" aria-label="Message encryption recovery">
  <h3>Keep your writing backed up</h3>
  {mode==='checking'&&<p role="status">Checking this device’s encryption identity…</p>}
  {mode==='blocked'&&<p>Existing encrypted history has been preserved. This device cannot be enrolled until the original key is safely migrated.</p>}
  {mode==='setup'&&<><p>One quick backup setup helps you restore your writing on a replacement phone. Carehold will take care of encryption automatically afterward.</p>
   <p className="muted tiny">You'll save a private backup code once. Keep it in your password manager so it's available if your device is lost.</p>
   <button type="button" className="button primary" disabled={busy} onClick={()=>void generate()}>{busy?'Preparing…':'Set up secure backup'}</button></>}
  {mode==='resume-setup'&&pendingResume&&<form onSubmit={e=>void completeResumedEnrollment(e)}>
   <p><strong>Finish your earlier recovery setup.</strong> You can leave Carehold to save the code in Passwords: only an encrypted setup record was kept here. No recovery code was stored by Carehold.</p>
   <p>Find <strong>{RECOVERY_SEARCH_LABEL}</strong> in your password manager or locked note. Enter the saved code below, confirm it is stored safely, then finish enrollment.</p>
   <label>Saved recovery code<input type="password" autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="CH1-…" required/></label>
   <label className="recovery-confirm"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I saved this code somewhere I can access after losing this device.</label>
   <button className="button primary" type="submit" disabled={busy||!saved||!code.trim()}>{busy?'Finishing…':'Complete saved-code enrollment'}</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void discardUnregisteredSetup()}>I didn't save it — discard this unregistered attempt</button>
   <p className="muted tiny">Discarding applies only to this unfinished, unregistered attempt. It does not delete any existing account keys or messages.</p>
  </form>}
  {mode==='show-code'&&pending&&<><p>Save this one-time backup code in your password manager. It is not your login password or passkey. Keep it private.</p>
   <RecoveryCodeSaveGuide code={pending.recoveryCode} saved={saved} onSavedChange={setSaved}/>
   <p className="fine-print">This code will not be shown again after setup. Keep your saved copy so you can restore on another device if needed.</p>
   <button type="button" className="button primary" disabled={!saved||busy} onClick={()=>void completeEnrollment()}>{busy?'Enrolling…':'Finish secure setup'}</button>
   <p className="muted tiny">Do not navigate away until enrollment succeeds. The recovery code is never sent to the server.</p></>}
  {mode==='restore'&&<form onSubmit={e=>void restore(e)}><p>You're on a new device. Enter the backup code saved during your first setup to restore your private writing and messages.</p>
   <label>Recovery code<input name="recovery-code" type="password" autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="CH1-…" required/></label>
   <button className="button primary" disabled={busy||!code.trim()}>{busy?'Recovering…':'Restore my writing'}</button>
   <p className="muted tiny">Look for <strong>{RECOVERY_SEARCH_LABEL}</strong> in Apple Passwords or another trusted password manager. If you cannot find it, preserve your original device rather than resetting keys.</p></form>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
 </section>;
}
