import {useEffect,useRef,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,seal,unseal,storedMessageIdentity,
 storeRotatedMessageIdentity,storedPendingRecoveryEnvelope,storePendingRecoveryEnvelope,
 clearPendingRecoveryEnvelope,type Identity,type PublicKey,type Envelope} from './lib/message-crypto';
import {sealWord,unsealWord} from './lib/words-space-crypto';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,
 type MessageRecoveryEnvelope,type NewRecoveryIdentity} from './lib/message-recovery';
import {RecoveryCodeSaveGuide,RECOVERY_SEARCH_LABEL} from './RecoveryCodeSaveGuide';
import {saveTrustedRecoveryCode} from './lib/trusted-device-vault';
import {enrollLocalTrustedDevice} from './lib/trusted-device-client';
import {reencryptSyncedJournalEntry,verifyStagedSyncedJournalEntry} from './lib/synced-private-journal';
import {draftScopeToken,reencryptSyncedDraft,verifyStagedSyncedDraft} from './lib/recoverable-drafts';

type Mode='checking'|'idle'|'show-code'|'resume-prestage'|'resume'|'migrating'|'done'|'blocked';
type RotationStatus={state:'none'|'staged',rotationId:string|null,envelope:MessageRecoveryEnvelope|null,publicKey:PublicKey|null};
type ScopeInventory={households:{id:string}[],threads:{id:string,householdId:string}[],spaces:{id:string,householdId:string}[]};
type ShareItem={kind:'direct'|'words',sourceId:string,contextId:string,envelope:Envelope,staged:Envelope|null};
type JournalItem={householdId:string,id:string,revision:number,iv:string,ciphertext:string,createdAt:number,updatedAt:number,
 staged:{iv:string,ciphertext:string,expectedRevision:number}|null};
type DraftItem={householdId:string,scopeId:string,revision:number,iv:string,ciphertext:string,updatedAt:number,
 staged:{iv:string,ciphertext:string,expectedRevision:number}|null};
type Inventory<T>={items:T[],hasMore:boolean};
const message=(e:unknown)=>e instanceof Error?e.message:'Recovery-code replacement could not be completed.';

/**
 * Only an original authenticated browser that can decrypt its current account
 * key may replace a lost recovery code. Nothing rotates until every readable
 * direct/Words, journal and synced draft ciphertext verifies under the new key.
 * The backend atomically validates all stored ciphertext and revisions before
 * committing the new recovery envelope. No plaintext or recovery code is sent.
 */
export function RecoveryCodeRotation({userId,onComplete}:{userId:string,onComplete:()=>void}){
 const [mode,setMode]=useState<Mode>('checking');
 const [original,setOriginal]=useState<Identity|null>(null);
 const [newIdentity,setNewIdentity]=useState<NewRecoveryIdentity|null>(null);
 const [saved,setSaved]=useState(false),[code,setCode]=useState('');
 const [pendingEnvelope,setPendingEnvelope]=useState<MessageRecoveryEnvelope|null>(null);
 const [rotation,setRotation]=useState<RotationStatus|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[count,setCount]=useState(0);
 const cancelled=useRef(false);
 useEffect(()=>{
  let active=true;cancelled.current=false;
  setMode('checking');setError('');
  void (async()=>{
   try{
    const [remote,device,staged]=await Promise.all([
     api<{publicKey:PublicKey|null}>('/messages/keys/me'),
     storedMessageIdentity(userId),
     api<RotationStatus>('/recovery-rotation/status')
    ]);
    if(!active)return;
    if(!device||!remote.publicKey||!samePublicKey(device.publicKey,remote.publicKey)||!device.journalKey){
     setMode('blocked');return;
    }
    setOriginal(device);setRotation(staged);
    if(staged.state==='staged'&&staged.envelope){setMode('resume');return;}
    const pending=await storedPendingRecoveryEnvelope(userId,'rotation');
    if(!active)return;
    if(pending){setPendingEnvelope(pending);setMode('resume-prestage');}
    else setMode('idle');
   }catch(e){if(active&&!(e instanceof StaleSessionRequest)){setMode('blocked');setError(message(e));}}
  })();
  return()=>{active=false;cancelled.current=true;};
 },[userId]);
 const abortIfUnloaded=()=>{if(cancelled.current)throw new Error('Replacement paused because you left Settings. Return here to resume without losing the original key.');};
 async function challengeProof(identity:Identity){
  const challenge=await api<{envelope:Envelope}>('/recovery-rotation/challenge','POST',{});
  const proof=await unseal(challenge.envelope,identity.privateKey,'carehold-legacy-proof-v1',userId,userId);
  if(proof.kind!=='message')throw new Error('The original encryption key proof did not verify.');
  return proof.text;
 }
 async function create(){
  if(busy||!original)return;setBusy(true);setError('');
  try{
   const created=await createMessageRecoveryIdentity(userId);
   await storePendingRecoveryEnvelope(userId,'rotation',created.envelope);
   setNewIdentity(created);setSaved(false);setMode('show-code');
  }catch(e){setError(message(e));}finally{setBusy(false);}
 }
 async function discardUnregistered(){
  if(busy)return;setBusy(true);setError('');
  try{
   const state=await api<RotationStatus>('/recovery-rotation/status');
   if(state.state!=='none')throw new Error('A replacement is staged; cancel it using the original browser key instead.');
   await clearPendingRecoveryEnvelope(userId,'rotation');
   setNewIdentity(null);setPendingEnvelope(null);setCode('');setSaved(false);setMode('idle');
  }catch(e){setError(message(e));}finally{setBusy(false);}
 }
 async function runInventory<T>(kind:'copies'|'journals'|'drafts',visitor:(row:T)=>Promise<void>){
  let offset=0,hasMore=true;
  while(hasMore){
   abortIfUnloaded();
   if(offset>10000)throw new Error('Too many encrypted records for automatic rotation. Original data is unchanged.');
   const page=await api<Inventory<T>>('/recovery-rotation/inventory?kind='+kind+'&offset='+offset);
   if(page.hasMore&&!page.items.length)throw new Error('Invalid encrypted inventory pagination.');
   for(const row of page.items){abortIfUnloaded();await visitor(row);setCount(n=>n+1);}
   offset+=page.items.length;hasMore=page.hasMore;
  }
 }
 async function migrate(next:Identity,old:Identity){
  if(!old.journalKey||!next.journalKey)throw new Error('Cannot rotate an account without both encrypted-journal keys.');
  setMode('migrating');setCount(0);
  // Enumerate allowed scopes before modifying any active encryption metadata.
  const scopes=await api<ScopeInventory>('/recovery-rotation/scopes');
  const candidateScopes=[
   ...scopes.households.map(h=>h.id),
   ...scopes.threads.map(t=>t.householdId+':direct:'+t.id),
   ...scopes.spaces.flatMap(s=>[s.householdId+':reflection:'+s.id,s.householdId+':discussion:'+s.id])
  ];
  if(candidateScopes.length>10000)throw new Error('Too many draft scopes. Keep the original browser and retry after reviewing drafts.');
  const locator=new Map<string,string>();
  for(const scope of candidateScopes){abortIfUnloaded();locator.set(await draftScopeToken(userId,scope),scope);}
  await runInventory<ShareItem>('copies',async row=>{
   const plaintext=row.kind==='direct'
    ?await unseal(row.envelope,old.privateKey,row.contextId,row.sourceId,userId)
    :await unsealWord(row.envelope,old.privateKey,row.contextId,row.sourceId,userId);
   const rotated=row.staged??(row.kind==='direct'
    ?await seal(plaintext as Parameters<typeof seal>[0],next.publicKey,row.contextId,row.sourceId,userId)
    :await sealWord(plaintext as Parameters<typeof sealWord>[0],next.publicKey,row.contextId,row.sourceId,userId));
   const tested=row.kind==='direct'
    ?await unseal(rotated,next.privateKey,row.contextId,row.sourceId,userId)
    :await unsealWord(rotated,next.privateKey,row.contextId,row.sourceId,userId);
   if(JSON.stringify(tested)!==JSON.stringify(plaintext))
    throw new Error('Shared ciphertext failed replacement verification. Original key is unchanged.');
   if(!row.staged)await api('/recovery-rotation/stage','POST',{kind:row.kind,sourceId:row.sourceId,envelope:rotated});
  });
  await runInventory<JournalItem>('journals',async row=>{
   const cipher={id:row.id,revision:row.revision,iv:row.iv,ciphertext:row.ciphertext,createdAt:row.createdAt,updatedAt:row.updatedAt};
   if(row.staged){
    await verifyStagedSyncedJournalEntry(userId,row.householdId,cipher,row.staged,old.journalKey!,next.journalKey!);
    return;
   }
   const staged=await reencryptSyncedJournalEntry(userId,row.householdId,cipher,old.journalKey!,next.journalKey!);
   await api('/recovery-rotation/stage','POST',{kind:'journal',...staged});
  });
  await runInventory<DraftItem>('drafts',async row=>{
   const scope=locator.get(row.scopeId);
   if(!scope||scope.split(':',1)[0]!==row.householdId)
    throw new Error('An older synchronized draft has no recognized scope. Replacement stopped safely; the original encrypted draft remains. Review older drafts before retrying.');
   if(row.staged){
    await verifyStagedSyncedDraft(userId,scope,row,row.staged,old.journalKey!,next.journalKey!);
    return;
   }
   const cipher=await reencryptSyncedDraft(userId,scope,row,old.journalKey!,next.journalKey!);
   await api('/recovery-rotation/stage','POST',{kind:'draft',householdId:row.householdId,sourceId:row.scopeId,...cipher});
  });
  abortIfUnloaded();
  const result=await api<{state:string,publicKey:PublicKey}>('/recovery-rotation/finalize','POST',{confirm:true});
  if(result.state!=='complete'||!samePublicKey(result.publicKey,next.publicKey))
   throw new Error('The rotated key could not be confirmed. Do not delete your original browser.');
  await finishLocal(next,old);
 }
 async function finishLocal(next:Identity,old:Identity){
  const registered=await api<{publicKey:PublicKey|null}>('/messages/keys/me');
  if(!registered.publicKey||!samePublicKey(registered.publicKey,next.publicKey))
   throw new Error('The server has not committed the replacement key. Preserve original browser and saved code.');
  await storeRotatedMessageIdentity(userId,old,next);
  await clearPendingRecoveryEnvelope(userId,'rotation').catch(()=>{});
  // A completed account-key rotation invalidates this device's old approval escrow.
  // Re-enroll it with the new recovery code if that code is available here.
  const freshCode=newIdentity?.recoveryCode??code.trim();
  if(freshCode){
   try{
    const recovery=await api<{configured:boolean,envelope:MessageRecoveryEnvelope|null}>('/messages/recovery');
    if(recovery.envelope){
     await saveTrustedRecoveryCode(userId,freshCode,recovery.envelope);
     await enrollLocalTrustedDevice(userId,next);
    }
   }catch{/* Key rotation is committed; manual CH1 recovery remains authoritative. */}
  }
  setNewIdentity(null);setPendingEnvelope(null);setCode('');setMode('done');
  window.dispatchEvent(new CustomEvent('carehold:recovery-ready',{detail:{userId}}));
  onComplete();
 }
 async function begin(){
  if(!saved||!newIdentity||!original||busy)return;
  setBusy(true);setError('');
  try{
   const proof=await challengeProof(original);
   await api('/recovery-rotation/start','POST',{envelope:newIdentity.envelope,proof});
   await migrate(newIdentity.identity,original);
  }catch(e){
   try{
    const registered=await api<{publicKey:PublicKey|null}>('/messages/keys/me');
    if(registered.publicKey&&samePublicKey(registered.publicKey,newIdentity.identity.publicKey)){
     await finishLocal(newIdentity.identity,original);return;
    }
   }catch{}
   const state=await api<RotationStatus>('/recovery-rotation/status').catch(()=>null);
   if(state?.state==='staged'){setRotation(state);setMode('resume');}
   else setMode('show-code');
   setError(message(e));
  }finally{setBusy(false);}
 }
 async function resumePrestage(){
  if(!pendingEnvelope||!original||!code.trim()||busy)return;
  setBusy(true);setError('');
  let next:Identity|null=null;
  try{
   next=await openMessageRecoveryIdentity(userId,code.trim(),pendingEnvelope);
   const proof=await challengeProof(original);
   await api('/recovery-rotation/start','POST',{envelope:pendingEnvelope,proof});
   await migrate(next,original);
  }catch(e){
   if(next&&await acceptAlreadyCommitted(next,original))return;
   const state=await api<RotationStatus>('/recovery-rotation/status').catch(()=>null);
   if(state?.state==='staged'){setRotation(state);setMode('resume');}
   else setMode('resume-prestage');
   setError(message(e));
  }finally{setBusy(false);}
 }
 async function resume(){
  if(!rotation?.envelope||!original||!code.trim()||busy)return;
  setBusy(true);setError('');
  let next:Identity|null=null;
  try{
   next=await openMessageRecoveryIdentity(userId,code.trim(),rotation.envelope);
   if(!rotation.publicKey||!samePublicKey(rotation.publicKey,next.publicKey))
    throw new Error('The saved code does not belong to the staged replacement.');
   await migrate(next,original);
  }catch(e){
   if(next&&await acceptAlreadyCommitted(next,original))return;
   setMode('resume');setError(message(e));
  }finally{setBusy(false);}
 }
 async function acceptAlreadyCommitted(next:Identity,old:Identity):Promise<boolean>{
  try{
   const remote=await api<{publicKey:PublicKey|null}>('/messages/keys/me');
   if(!remote.publicKey||!samePublicKey(remote.publicKey,next.publicKey))return false;
   await finishLocal(next,old);
   return true;
  }catch{return false;}
 }
 async function cancelStaged(){
  if(!original||busy)return;setBusy(true);setError('');
  try{
   const proof=await challengeProof(original);
   await api('/recovery-rotation/cancel','POST',{proof});
   await clearPendingRecoveryEnvelope(userId,'rotation').catch(()=>{});
   setCode('');setRotation(null);setNewIdentity(null);setSaved(false);setMode('idle');
  }catch(e){setError(message(e)+' Your old encryption identity was not intentionally changed.');}
  finally{setBusy(false);}
 }
 if(mode==='checking')return <p role="status">Checking this browser for a trusted recovery identity…</p>;
 if(mode==='blocked')return <div className="recovery-gate"><p role="alert">Replacement is unavailable on this browser. Open the original trusted browser with its current encryption key and journal key. No records were changed. {error}</p></div>;
 return <section className="recovery-gate" aria-label="Replace lost Carehold encryption recovery code">
  <h3>Replace lost recovery code</h3>
  {mode==='idle'&&<><p>Use this trusted browser to replace a missing recovery code. Carehold will encrypt and verify new copies of every accessible shared message, Words post, synchronized journal entry and draft before switching keys. Original ciphertext and keys are retained. Do not close this browser or clear its site data.</p>
   <p className="fine-print">You will receive a completely new one-time CH1- code. It must be saved outside this browser and verified before migration starts. Existing devices may need to recover using the new code after replacement.</p>
   <button type="button" className="button primary" disabled={busy} onClick={()=>void create()}>{busy?'Preparing…':'Prepare replacement recovery code'}</button></>}
  {mode==='show-code'&&newIdentity&&<><p><strong>Save this replacement code before beginning.</strong> It cannot be redisplayed once replacement completes. The code does not leave your device.</p>
   <RecoveryCodeSaveGuide code={newIdentity.recoveryCode} saved={saved} onSavedChange={setSaved}/>
   <button type="button" className="button primary" disabled={!saved||busy} onClick={()=>void begin()}>{busy?'Verifying encrypted records…':'Replace recovery code — verified and saved'}</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void discardUnregistered()}>Cancel unregistered replacement</button></>}
  {mode==='resume-prestage'&&<><p>An uncommitted replacement was prepared on this browser. Retrieve the original CH1- code you saved for that attempt, or safely discard the unregistered attempt.</p>
   <label>Code saved during replacement<input type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} placeholder="CH1-…" spellCheck={false}/></label>
   <button type="button" className="button primary" disabled={busy||!code.trim()} onClick={()=>void resumePrestage()}>Verify saved code and start replacement</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void discardUnregistered()}>I didn't save it — discard unregistered attempt</button></>}
  {mode==='resume'&&<><p><strong>Replacement is staged, not committed.</strong> Your original encryption key and data remain active. Enter the new CH1- code you saved during replacement to resume, or cancel safely using this original browser.</p>
   <label>Saved replacement recovery code<input type="password" autoComplete="off" spellCheck={false} value={code} onChange={e=>setCode(e.target.value)} placeholder="CH1-…"/></label>
   <p className="fine-print">Find it in your vault under <strong>{RECOVERY_SEARCH_LABEL}</strong>. Never share it with anyone.</p>
   <button type="button" className="button primary" disabled={busy||!code.trim()} onClick={()=>void resume()}>{busy?'Verifying…':'Resume encrypted replacement'}</button>
   <button type="button" className="button outline small" disabled={busy} onClick={()=>void cancelStaged()}>Safely cancel staged replacement with original key</button></>}
  {mode==='migrating'&&<p role="status">Verifying and staging encrypted records: {count} checked. Do not navigate away; if interrupted, return here with your saved code to resume.</p>}
  {mode==='done'&&<p role="status"><strong>Recovery code replaced.</strong> Your new code is required to recover on another device. All staged data was checked before Carehold switched the active encryption identity. Preserve the original browser until you verify recovery in a second persistent browser profile.</p>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
 </section>;
}
