import {useEffect,useRef,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,seal,unseal,storedLegacyMessageIdentity,storeRecoveredMessageIdentity,type Envelope,type Identity,type PublicKey} from './lib/message-crypto';
import {sealWord,unsealWord} from './lib/words-space-crypto';
import {createMessageRecoveryIdentity,openMessageRecoveryIdentity,type MessageRecoveryEnvelope,type NewRecoveryIdentity} from './lib/message-recovery';

type Status='checking'|'legacy'|'show-code'|'resume'|'running'|'done'|'blocked';
type Stage={state:'none'|'staged'|'complete',envelope:MessageRecoveryEnvelope|null,publicKey:PublicKey|null};
type Inventory={copies:{kind:'direct'|'words',sourceId:string,contextId:string,envelope:Envelope,migratedEnvelope:Envelope|null}[],hasMore:boolean};
const errText=(e:unknown)=>e instanceof Error?e.message:'Migration stopped; no original data was erased.';

/** Explicit, resumable, self-only legacy upgrade. NEVER auto-rotates keys. */
export function LegacyMessageMigration({userId}:{userId:string}){
 const [status,setStatus]=useState<Status>('checking');
 const [oldKey,setOldKey]=useState<Identity|null>(null),[pending,setPending]=useState<NewRecoveryIdentity|null>(null);
 const [stage,setStage]=useState<Stage|null>(null),[recoveryCode,setRecoveryCode]=useState('');
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
    setStatus(staged.state==='staged'?'resume':'legacy');
   }catch(e){if(active&&!(e instanceof StaleSessionRequest)){setError(errText(e));setStatus('blocked');}}
  })();
  return()=>{active=false;cancel.current=true;};
 },[userId]);
 async function generate(){
  if(busy)return;setBusy(true);setError('');
  try{
   const fresh=await createMessageRecoveryIdentity(userId);
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
   setStage({state:'staged',envelope:pending.envelope,publicKey:pending.identity.publicKey});
   await convert(pending.identity,oldKey);
  }catch(e){
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
 async function resume(){
  if(!stage?.envelope||!oldKey||busy)return;
  setBusy(true);setError('');
  try{
   const identity=await openMessageRecoveryIdentity(userId,recoveryCode.trim(),stage.envelope);
   if(!stage.publicKey||!samePublicKey(identity.publicKey,stage.publicKey))
    throw new Error('The saved code does not match the staged account identity.');
   await convert(identity,oldKey);
   setRecoveryCode('');
  }catch(e){setError(errText(e));setStatus('resume');}
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
  setStatus('done');setPending(null);
 }
 if(status==='checking')return <p role="status">Checking legacy encryption…</p>;
 if(status==='done')return <div className="recovery-gate"><strong>Message recovery upgrade completed.</strong><p>Original ciphertext and the old browser key were retained. Your saved code can recover new message access and encrypted private journals on another browser. Reload Carehold to refresh encrypted screens.</p><button type="button" className="button outline" onClick={()=>window.location.reload()}>Reload encrypted screens</button></div>;
 if(status==='blocked')return <p role="status" className="fine-print">Legacy migration requires the original browser with its old private key. Nothing was reset. {error}</p>;
 return <div className="recovery-gate">
  <h3>Upgrade older encrypted messages safely</h3>
  {status==='legacy'&&<><p>This original browser still has its old encryption key. We can preserve every accessible message and Words post, create a separate recovery code and encrypt a new copy for this account. Other participants' copies stay unchanged.</p>
   <p className="fine-print">A temporarily paused conversation cannot receive new messages while the upgrade is staged. If you close this page, resume later with your saved code on the original browser.</p>
   <button type="button" className="button primary" disabled={busy} onClick={()=>void generate()}>Prepare non-destructive migration</button></>}
  {status==='show-code'&&pending&&<><p>Save this recovery code securely before converting anything. It is shown only now, cannot be reconstructed, and is required if the migration is interrupted.</p>
   <code className="recovery-secret">{pending.recoveryCode}</code>
   <button type="button" className="button outline small" onClick={()=>void navigator.clipboard.writeText(pending.recoveryCode)}>Copy recovery code</button>
   <label className="recovery-confirm"><input type="checkbox" checked={savedCode} onChange={e=>setSavedCode(e.target.checked)}/>I stored this code separately from this browser.</label>
   <button type="button" className="button primary" disabled={!savedCode||busy} onClick={()=>void start()}>{busy?'Converting…':'Encrypt and verify all my older messages'}</button></>}
  {status==='resume'&&<><p>A migration is already staged. Do not generate a replacement key. On the original browser, enter the recovery code saved when you started.</p><label>Saved recovery code<input type="password" autoComplete="off" spellCheck={false} value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} placeholder="CH1-…"/></label>
   <button type="button" className="button primary" disabled={busy||!recoveryCode.trim()} onClick={()=>void resume()}>{busy?'Resuming…':'Resume verified migration'}</button></>}
  {status==='running'&&<p role="status">Encrypted and verified {progress.verified} of {progress.completed} examined recipient copies. Do not close the browser until completion.</p>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
 </div>;
}
