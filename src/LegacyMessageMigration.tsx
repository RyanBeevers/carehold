import {useEffect,useRef,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,seal,unseal,storedLegacyMessageIdentity,storeRecoveredMessageIdentity,storedPendingRecoveryEnvelope,storePendingRecoveryEnvelope,clearPendingRecoveryEnvelope,type Envelope,type Identity,type PublicKey} from './lib/message-crypto';
import {sealWord,unsealWord} from './lib/words-space-crypto';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,type MessageRecoveryEnvelope,type NewRecoveryIdentity} from './lib/message-recovery';
import {RecoveryCodeSaveGuide,RECOVERY_SEARCH_LABEL} from './RecoveryCodeSaveGuide';
import {saveTrustedRecoveryCode} from './lib/trusted-device-vault';
import {enrollLocalTrustedDevice} from './lib/trusted-device-client';

type Status='checking'|'legacy'|'show-code'|'resume-prestage'|'resume'|'running'|'done'|'blocked';
type Stage={state:'none'|'staged'|'complete',envelope:MessageRecoveryEnvelope|null,publicKey:PublicKey|null};
type Inventory={copies:{kind:'direct'|'words',sourceId:string,contextId:string,envelope:Envelope,migratedEnvelope:Envelope|null}[],hasMore:boolean};
const errText=(e:unknown)=>e instanceof Error?e.message:'Migration stopped; no original data was erased.';

/** Explicit, resumable, self-only legacy upgrade. NEVER auto-rotates keys. */
export function LegacyMessageMigration({userId,onComplete}:{userId:string,onComplete?:()=>void}){
 const [status,setStatus]=useState<Status>('checking');
 const [oldKey,setOldKey]=useState<Identity|null>(null),[pending,setPending]=useState<NewRecoveryIdentity|null>(null);
 const [stage,setStage]=useState<Stage|null>(null),[recoveryCode,setRecoveryCode]=useState('');
 const [pendingResume,setPendingResume]=useState<MessageRecoveryEnvelope|null>(null);
 const [savedCode,setSavedCode]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [progress,setProgress]=useState({completed:0,verified:0});
 const cancel=useRef(false);
 useEffect(()=>{
  let active=true;cancel.current=false;
  void (async()=>{
   try{
    const [current,legacy,staged]=await Promise.all([
     api<{publicKey:PublicKey|null}>('/messages/keys/me'),storedLegacyMessageIdentity(userId),
     api<Stage>('/messages/recovery/migration')
    ]);
    if(!active)return;
    setStage(staged);
    if(staged.state==='complete'){setStatus('done');return;}
    if(!current.publicKey||!legacy||!samePublicKey(current.publicKey,legacy.publicKey)){
     setStatus('blocked');return;
    }
    setOldKey(legacy);
    if(staged.state==='staged'){setStatus('resume');return;}
    const unfinished=await storedPendingRecoveryEnvelope(userId,'legacy');
    if(!active)return;
    if(unfinished){setPendingResume(unfinished);setStatus('resume-prestage');}
    else setStatus('legacy');
   }catch(e){if(active&&!(e instanceof StaleSessionRequest)){setError(errText(e));setStatus('blocked');}}
  })();
  return()=>{active=false;cancel.current=true;};
 },[userId]);
 async function acceptCommitted(next:Identity):Promise<boolean>{
  try{
   const confirmed=await api<Stage>('/messages/recovery/migration');
   if(confirmed.state==='complete'&&confirmed.publicKey&&samePublicKey(confirmed.publicKey,next.publicKey)){
    await storeRecoveredMessageIdentity(userId,next);
    await clearPendingRecoveryEnvelope(userId,'legacy').catch(()=>{});
    setStage(confirmed);setPending(null);setRecoveryCode('');setStatus('done');
    onComplete?.();
    return true;
   }
  }catch{}
  return false;
 }
 async function generate(){
  if(busy)return;setBusy(true);setError('');
  try{
   const fresh=await createMessageRecoveryIdentity(userId);
   await storePendingRecoveryEnvelope(userId,'legacy',fresh.envelope);
   setPending(fresh);setSavedCode(false);setStatus('show-code');
  }catch(e){setError(errText(e));}
  finally{setBusy(false);}
 }
 async function start(){
  if(!pending||!savedCode||!oldKey||busy)return;
  setBusy(true);setError('');
  try{
   const challenge=await api<{envelope:Envelope}>('/messages/recovery/migration/challenge','POST',{});
   const proof=await unseal(challenge.envelope,oldKey.privateKey,'carehold-legacy-proof-v1',userId,userId);
   if(proof.kind!=='message')throw new Error('Legacy key verification failed.');
   await api('/messages/recovery/migration','POST',{envelope:pending.envelope,proof:proof.text});
   await clearPendingRecoveryEnvelope(userId,'legacy').catch(()=>{});
   setStage({state:'staged',envelope:pending.envelope,publicKey:pending.identity.publicKey});
   await convert(pending.identity,oldKey);
  }catch(e){
   if(pending&&await acceptCommitted(pending.identity))return;
   try{
    const state=await api<Stage>('/messages/recovery/migration');
    if(state.state==='staged'){setStage(state);setStatus('resume');}
    else if(state.state==='complete'){setStatus('done');}
    else setStatus('show-code');
   }catch{setStatus('show-code');}
   setError(errText(e)+' Preserve the original browser and saved code. No ciphertext was erased.');
  }
  finally{setBusy(false);}
 }
 async function completeUnregisteredLegacySetup(){
  if(!pendingResume||!oldKey||!savedCode||!recoveryCode.trim()||busy)return;
  setBusy(true);setError('');
  let next:Identity|null=null;
  try{
   next=await openMessageRecoveryIdentity(userId,recoveryCode.trim(),pendingResume);
   const challenge=await api<{envelope:Envelope}>('/messages/recovery/migration/challenge','POST',{});
   const proof=await unseal(challenge.envelope,oldKey.privateKey,'carehold-legacy-proof-v1',userId,userId);
   if(proof.kind!=='message')throw new Error('Original private key verification failed.');
   try{await api('/messages/recovery/migration','POST',{envelope:pendingResume,proof:proof.text});}
   catch(e){
    const existing=await api<Stage>('/messages/recovery/migration');
    if(existing.state!=='staged'||!existing.publicKey||!samePublicKey(existing.publicKey,next.publicKey))throw e;
   }
   await clearPendingRecoveryEnvelope(userId,'legacy').catch(()=>{});
   setStage({state:'staged',envelope:pendingResume,publicKey:next.publicKey});
   await convert(next,oldKey);
   setRecoveryCode('');setPendingResume(null);
  }catch(e){
   if(next&&await acceptCommitted(next))return;
   const existing=await api<Stage>('/messages/recovery/migration').catch(()=>null);
   if(existing?.state==='staged'){setStage(existing);setStatus('resume');}
   else setStatus('resume-prestage');
   setError(errText(e)+' Original encrypted copies and saved recovery code were preserved.');
  }finally{setBusy(false);}
 }
 async function discardUnregisteredLegacySetup(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const state=await api<Stage>('/messages/recovery/migration');
   if(state.state!=='none')throw new Error('A migration is already staged or completed. Resume it rather than resetting.');
   await clearPendingRecoveryEnvelope(userId,'legacy');
   setPendingResume(null);setPending(null);setSavedCode(false);setRecoveryCode('');
   setStatus('legacy');
  }catch(e){setError(errText(e));}
  finally{setBusy(false);}
 }
 async function resume(){
  if(!stage?.envelope||!oldKey||busy)return;
  setBusy(true);setError('');
  let identity:Identity|null=null;
  try{
   identity=await openMessageRecoveryIdentity(userId,recoveryCode.trim(),stage.envelope);
   if(!stage.publicKey||!samePublicKey(identity.publicKey,stage.publicKey))
    throw new Error('The saved code does not match the staged account identity.');
   await convert(identity,oldKey);
   setRecoveryCode('');
  }catch(e){
   if(identity&&await acceptCommitted(identity))return;
   setError(errText(e));setStatus('resume');
  }finally{setBusy(false);}
 }
 async function cancelStaged(){
  if(!oldKey||busy)return;
  setBusy(true);setError('');
  try{
   const challenge=await api<{envelope:Envelope}>('/messages/recovery/migration/challenge','POST',{});
   const proof=await unseal(challenge.envelope,oldKey.privateKey,'carehold-legacy-proof-v1',userId,userId);
   if(proof.kind!=='message')throw new Error('Original device key verification failed.');
   await api('/messages/recovery/migration/cancel','POST',{proof:proof.text});
   setStage({state:'none',publicKey:null,envelope:null});
   await clearPendingRecoveryEnvelope(userId,'legacy').catch(()=>{});
   setPending(null);setSavedCode(false);setRecoveryCode('');setStatus('legacy');
  }catch(e){setError(errText(e)+' Original encrypted history remains unchanged.');}
  finally{setBusy(false);}
 }
 async function convert(next:Identity,legacy:Identity){
  setStatus('running');setProgress({completed:0,verified:0});
  let offset=0,completed=0,verified=0,hasMore=true;
  while(hasMore){
   if(cancel.current)throw new Error('Migration paused when leaving this page.');
   if(offset>100000)throw new Error('The migration inventory is too large.');
   const page=await api<Inventory>('/messages/recovery/migration/copies?offset='+offset);
   if(hasMore&&page.hasMore&&page.copies.length===0)throw new Error('Invalid migration pagination.');
   for(const item of page.copies){
    if(cancel.current)throw new Error('Migration paused when leaving this page.');
    // Decryption is performed only on the original trusted browser.
    const plaintext=item.kind==='direct'
     ?await unseal(item.envelope,legacy.privateKey,item.contextId,item.sourceId,userId)
     :await unsealWord(item.envelope,legacy.privateKey,item.contextId,item.sourceId,userId);
    if(item.migratedEnvelope){
     const restored=item.kind==='direct'
      ?await unseal(item.migratedEnvelope,next.privateKey,item.contextId,item.sourceId,userId)
      :await unsealWord(item.migratedEnvelope,next.privateKey,item.contextId,item.sourceId,userId);
     if(JSON.stringify(restored)!==JSON.stringify(plaintext))
      throw new Error('A staged copy does not match the original content. Migration stopped without changing keys.');
    }else{
     const encrypted=item.kind==='direct'
      ?await seal(plaintext as Parameters<typeof seal>[0],next.publicKey,item.contextId,item.sourceId,userId)
      :await sealWord(plaintext as Parameters<typeof sealWord>[0],next.publicKey,item.contextId,item.sourceId,userId);
     const proof=item.kind==='direct'
      ?await unseal(encrypted,next.privateKey,item.contextId,item.sourceId,userId)
      :await unsealWord(encrypted,next.privateKey,item.contextId,item.sourceId,userId);
     if(JSON.stringify(proof)!==JSON.stringify(plaintext))
      throw new Error('Local encryption validation failed; no key was changed.');
     await api('/messages/recovery/migration/copies','POST',{
      kind:item.kind,sourceId:item.sourceId,envelope:encrypted
     });
    }
    completed++;verified++;setProgress({completed,verified});
   }
   offset+=page.copies.length;hasMore=page.hasMore;
  }
  // Server independently confirms every currently authorized original copy
  // has a replacement, then changes the active key in one transaction.
  await api('/messages/recovery/migration/finalize','POST',{confirm:true});
  await storeRecoveredMessageIdentity(userId,next);
  await clearPendingRecoveryEnvelope(userId,'legacy').catch(()=>{});
  const recoveredCode=pending?.recoveryCode??recoveryCode.trim();
  if(recoveredCode){
   try{
    const recovery=await api<{configured:boolean,envelope:MessageRecoveryEnvelope|null}>('/messages/recovery');
    if(recovery.envelope){
     await saveTrustedRecoveryCode(userId,recoveredCode,recovery.envelope);
     await enrollLocalTrustedDevice(userId,next);
    }
   }catch{/* Safe migration is complete; manual CH1 still works. */}
  }
  setStatus('done');setPending(null);
  onComplete?.();
 }
 if(status==='checking')return <p role="status">Checking legacy encryption…</p>;
 if(status==='done')return <div className="recovery-gate"><strong>Message recovery upgrade completed.</strong><p>Original ciphertext and the old browser key were retained. A recovery code saved outside this browser is required to restore access on another device. This success state alone does not prove you stored the code. If you missed it, keep this browser profile and its site data intact. Reload Carehold to refresh encrypted screens.</p><button type="button" className="button outline" onClick={()=>window.location.reload()}>Reload encrypted screens</button></div>;
 if(status==='blocked')return <p role="status" className="fine-print">Legacy migration requires the original browser with its old private key. Nothing was reset. {error}</p>;
 return <div className="recovery-gate">
  <h3>Upgrade older encrypted messages safely</h3>
  {status==='legacy'&&<><p>This original browser still has its old encryption key. We can preserve every accessible message and Words post, create a separate recovery code and encrypt a new copy for this account. Other participants' copies stay unchanged.</p>
   <p className="fine-print">A temporarily paused conversation cannot receive new messages while the upgrade is staged. If you close this page, resume later with your saved code on the original browser.</p>
   <button type="button" className="button primary" disabled={busy} onClick={()=>void generate()}>Prepare non-destructive migration</button></>}
  {status==='show-code'&&pending&&<><p>Save this recovery code securely before converting anything. It is shown only now, cannot be reconstructed, and is required if the migration is interrupted.</p>
   <RecoveryCodeSaveGuide code={pending.recoveryCode} saved={savedCode} onSavedChange={setSavedCode}/>
   <p className="fine-print"><strong>Step 3 — Finalize only after verifying the external copy.</strong> Once the migration finishes, Carehold cannot display this code again or safely recreate it. Without it, a different browser will not be able to decrypt your messages or synchronized private writing.</p>
   <button type="button" className="button primary" disabled={!savedCode||busy} onClick={()=>void start()}>{busy?'Converting…':'Finish migration — verified code saved'}</button></>}
  {status==='resume-prestage'&&pendingResume&&<><p><strong>Continue the original-browser setup you started.</strong> The unregistered key was kept here only as an encrypted envelope while you saved the recovery code. No code or original message key was stored in plaintext.</p>
   <label>Saved recovery code<input type="password" autoComplete="off" spellCheck={false} value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} placeholder="CH1-…"/></label>
   <p className="muted tiny">Find <strong>{RECOVERY_SEARCH_LABEL}</strong> in Apple Passwords, a trusted manager or a locked note.</p>
   <label className="recovery-confirm"><input type="checkbox" checked={savedCode} onChange={e=>setSavedCode(e.target.checked)}/>I saved the code securely and can find it after losing this device.</label>
   <button type="button" className="button primary" disabled={busy||!savedCode||!recoveryCode.trim()} onClick={()=>void completeUnregisteredLegacySetup()}>Finish original-browser migration setup</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void discardUnregisteredLegacySetup()}>I didn't save it — discard only this unregistered attempt</button>
   <p className="fine-print">Your old key, messages and other participants' encrypted copies will not be deleted.</p></>}
  {status==='resume'&&<><p>A migration is already staged. Do not generate a replacement key. On the original browser, enter the recovery code saved when you started.</p><label>Saved recovery code<input type="password" autoComplete="off" spellCheck={false} value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} placeholder="CH1-…"/></label>
   <p className="muted tiny">Search your Passwords app or safe notes for <strong>{RECOVERY_SEARCH_LABEL}</strong> to resume. Do not regenerate a key unless the staged migration is safely cancelled.</p>
   <button type="button" className="button primary" disabled={busy||!recoveryCode.trim()} onClick={()=>void resume()}>{busy?'Resuming…':'Resume verified migration'}</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void cancelStaged()}>Safely cancel with original browser key</button>
   <p className="fine-print">Cancellation discards only uncommitted replacement copies. The original account key, messages, and other participants’ copies remain intact.</p></>}
  {status==='running'&&<p role="status">Encrypted and verified {progress.verified} of {progress.completed} examined recipient copies. Do not close the browser until completion.</p>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
 </div>;
}
