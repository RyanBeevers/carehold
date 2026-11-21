import {useCallback,useEffect,useRef,useState} from 'react';
import {
 DraftConflictError,enableDeviceVault,inspectDeviceVault,saveDeviceDraft,discardDeviceDraft,
 type DraftDocument
} from './words-vault';
import {storedMessageIdentity} from './message-crypto';
import {readSyncedDraft,saveSyncedDraft,deleteSyncedDraft} from './recoverable-drafts';

export type DraftSaveStatus='loading'|'off'|'ready'|'editing'|'saving'|'saved'|'restored'|'conflict'|'error';
const INITIAL:DraftDocument={text:'',prompt:null,title:''};

/**
 * Debounced, serialized writes to an explicitly enabled device-local vault.
 * Only AES-GCM ciphertext is sent to authenticated draft-sync APIs when
 * account recovery is configured. We never store selected recipients.
 * Local autosave remains functional offline; sync conflicts are never hidden.
 */
export function useWordsDraftVault(userId:string,householdId:string){
 const [text,setTextState]=useState('');
 const [prompt,setPromptState]=useState<string|null>(null);
 const [title,setTitleState]=useState('');
 const [ready,setReady]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [status,setStatus]=useState<DraftSaveStatus>('loading');
 const [savedAt,setSavedAt]=useState<number|null>(null);
 const [error,setError]=useState('');
 const [syncEnabled,setSyncEnabled]=useState(false),[synced,setSynced]=useState(false);
 const [remoteConflict,setRemoteConflict]=useState(false);
 const remoteKey=useRef<CryptoKey|null>(null),remoteRevision=useRef(0),remoteBlocked=useRef(false);
 const current=useRef<DraftDocument>({...INITIAL});
 const revision=useRef(0),editNo=useRef(0),lastQueued=useRef(-1);
 const dirty=useRef(false),isEnabled=useRef(false),conflicted=useRef(false),discarding=useRef(false);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const alive=useRef(false),generation=useRef(0),isReady=useRef(false);

 useEffect(()=>{
  alive.current=true;
  const gen=++generation.current;
  setReady(false);isReady.current=false;
  setStatus('loading');setError('');setEnabled(false);isEnabled.current=false;
  setSyncEnabled(false);setSynced(false);setRemoteConflict(false);
  remoteKey.current=null;remoteRevision.current=0;remoteBlocked.current=false;
  void (async()=>{
   let result=await inspectDeviceVault(userId,householdId);
   if(!result.enabled){
    // Encrypt local drafts automatically on first use.
    await enableDeviceVault(userId,householdId);
    result=await inspectDeviceVault(userId,householdId);
   }
   let cloudError='',cloudConflict=false,cloudSynced=false;
   let cloudKey:CryptoKey|null=null,cloudRevision=0;
   try{
    const identity=await storedMessageIdentity(userId);
    if(identity?.journalKey){
     cloudKey=identity.journalKey;
     const remote=await readSyncedDraft(userId,householdId,identity.journalKey);
     cloudRevision=remote.revision;
     if(remote.document&&result.document){
      cloudConflict=JSON.stringify(remote.document)!==JSON.stringify(result.document);
      cloudSynced=!cloudConflict;
     }else if(remote.document&&!result.document){
      const restored=await saveDeviceDraft(userId,householdId,remote.document,result.revision);
      result={...result,document:remote.document,revision:restored.revision,savedAt:restored.savedAt};
      cloudSynced=true;
     }else if(!remote.document&&result.document&&!remote.deleted){
      const saved=await saveSyncedDraft(userId,householdId,identity.journalKey,result.document,remote.revision);
      cloudRevision=saved.revision;
      cloudSynced=true;
     }else if(!remote.document&&remote.deleted&&result.document){
      cloudConflict=true;
     }else cloudSynced=true;
    }
   }catch(e){
    cloudError=e instanceof Error?e.message:'Draft sync is unavailable.';
   }
   return {result,cloudError,cloudConflict,cloudSynced,cloudKey,cloudRevision};
  })().then(({result,cloudError,cloudConflict,cloudSynced,cloudKey,cloudRevision})=>{
   if(!alive.current||gen!==generation.current)return;
   remoteKey.current=cloudKey;remoteRevision.current=cloudRevision;
   isEnabled.current=result.enabled;setEnabled(result.enabled);
   const restored=result.document??{...INITIAL};
   current.current=restored;
   setTextState(restored.text);setPromptState(restored.prompt);setTitleState(restored.title??'');
   revision.current=result.revision;
   dirty.current=false;conflicted.current=cloudConflict;lastQueued.current=-1;editNo.current=0;
   remoteBlocked.current=cloudConflict;
   setSavedAt(result.savedAt);setSyncEnabled(!!remoteKey.current);
   setSynced(cloudSynced);setRemoteConflict(cloudConflict);
   if(cloudConflict){
    setError('This device and another device have different saved drafts. Choose which copy to keep; neither was overwritten.');
    setStatus('conflict');
   }else if(cloudError){
    setError('Local draft retained. Private sync unavailable: '+cloudError);
    setStatus('error');
   }else setStatus(result.enabled?(result.document?'restored':'ready'):'off');
  }).catch(e=>{
   if(!alive.current||gen!==generation.current)return;
   setError(e instanceof Error?e.message:'Cannot load device storage.');
   setStatus('error');
  }).finally(()=>{
   if(!alive.current||gen!==generation.current)return;
   isReady.current=true;setReady(true);
  });
  return()=>{alive.current=false;};
 },[userId,householdId]);

 function editField(next:DraftDocument){
  if(!isReady.current||discarding.current)return;
  current.current=next;
  setTextState(next.text);setPromptState(next.prompt);setTitleState(next.title??'');
  dirty.current=true;editNo.current+=1;setSynced(false);
  if(!conflicted.current)setStatus(isEnabled.current?'editing':'off');
 }
 const setText=useCallback((value:string)=>editField({...current.current,text:value}),[]);
 const setPrompt=useCallback((value:string|null)=>editField({...current.current,prompt:value}),[]);
 const setTitle=useCallback((value:string)=>editField({...current.current,title:value}),[]);

 const flush=useCallback((force=false):Promise<void>=>{
  if(discarding.current||!isEnabled.current||!isReady.current||!dirty.current||conflicted.current&&!force)return queue.current;
  const edit=editNo.current,snapshot={...current.current};
  if(!force&&lastQueued.current>=edit)return queue.current;
  lastQueued.current=edit;
  if(alive.current)setStatus('saving');
  const task=queue.current.catch(()=>{}).then(async()=>{
   const result=await saveDeviceDraft(userId,householdId,snapshot,revision.current,force);
   revision.current=result.revision;
   if(alive.current)setSavedAt(result.savedAt);
   if(remoteKey.current){
    if(remoteBlocked.current&&!force)throw new DraftConflictError();
    try{
     const updated=await saveSyncedDraft(userId,householdId,remoteKey.current,snapshot,remoteRevision.current);
     remoteRevision.current=updated.revision;
     remoteBlocked.current=false;setRemoteConflict(false);setSynced(true);
    }catch(e){
     if(e instanceof Error&&/another device|newer draft|conflict|changed/i.test(e.message)){
      remoteBlocked.current=true;setRemoteConflict(true);
      throw new DraftConflictError();
     }
     setSynced(false);throw e;
    }
   }
   if(!alive.current)return;
   if(edit===editNo.current){
    dirty.current=false;conflicted.current=false;setStatus('saved');setError('');
   }else setStatus('editing');
  }).catch(e=>{
   if(!alive.current)return;
   lastQueued.current=Math.min(lastQueued.current,edit-1);
   if(e instanceof DraftConflictError){
    conflicted.current=true;setStatus('conflict');setError(e.message);
   }else{
    setStatus('error');
    setError(e instanceof Error?e.message:'Encrypted local save failed.');
   }
  });
  queue.current=task;
  return task;
 },[userId,householdId]);

 useEffect(()=>{
  if(!ready||!enabled||status==='conflict'||status==='error'||!dirty.current)return;
  const timer=window.setTimeout(()=>{void flush();},1000);
  return()=>window.clearTimeout(timer);
 },[text,prompt,title,ready,enabled,status==='conflict',flush]);

 useEffect(()=>{
  if(!ready||!enabled)return;
  const onHide=()=>{if(document.visibilityState==='hidden')void flush();};
  const onPageHide=()=>{void flush();};
  document.addEventListener('visibilitychange',onHide);
  window.addEventListener('pagehide',onPageHide);
  return()=>{
   document.removeEventListener('visibilitychange',onHide);
   window.removeEventListener('pagehide',onPageHide);
   // Unmount can occur on navigation or auto-lock. Queue a final save; an OS
   // force-kill can still prevent any asynchronous browser storage write.
   void flush();
  };
 },[ready,enabled,flush]);

 // A recovery key may be enrolled while Words is already open. Attach
 // encrypted sync without rehydrating over any in-progress local writing.
 useEffect(()=>{
  const onRecovered=(event:Event)=>{
   if(!(event instanceof CustomEvent)||event.detail?.userId!==userId)return;
   const expectedGeneration=generation.current;
   void (async()=>{
    try{
     await flush();
     await queue.current.catch(()=>{});
     if(!alive.current||generation.current!==expectedGeneration)return;
     const identity=await storedMessageIdentity(userId);
     if(!identity?.journalKey)return;
     const remote=await readSyncedDraft(userId,householdId,identity.journalKey);
     if(!alive.current||generation.current!==expectedGeneration)return;
     remoteKey.current=identity.journalKey;remoteRevision.current=remote.revision;
     setSyncEnabled(true);
     const local={...current.current};
     const hasLocal=!!(local.text.trim()||local.title?.trim()||local.prompt);
     if(remote.document){
      if(JSON.stringify(remote.document)===JSON.stringify(local)){
       remoteBlocked.current=false;setRemoteConflict(false);setSynced(true);
      }else{
       remoteBlocked.current=true;conflicted.current=true;
       setRemoteConflict(true);setSynced(false);
       setStatus('conflict');
       setError('This browser and the recovered account contain different drafts. Select the version to keep.');
      }
     }else if(remote.deleted&&hasLocal){
      remoteBlocked.current=true;conflicted.current=true;setRemoteConflict(true);
      setStatus('conflict');setError('This draft was deleted on another device. Choose whether to restore this local version.');
     }else if(hasLocal){
      const saved=await saveSyncedDraft(userId,householdId,identity.journalKey,local,remote.revision);
      remoteRevision.current=saved.revision;setSynced(true);setStatus('saved');setError('');
     }else{
      setSynced(true);setStatus('ready');setError('');
     }
    }catch(e){
     if(!alive.current||generation.current!==expectedGeneration)return;
     setSynced(false);setStatus('error');
     setError('Local draft retained; recovery sync needs attention: '+(e instanceof Error?e.message:'Unable to sync.'));
    }
   })();
  };
  window.addEventListener('carehold:recovery-ready',onRecovered);
  return()=>window.removeEventListener('carehold:recovery-ready',onRecovered);
 },[userId,householdId,flush]);

 const enable=useCallback(async()=>{
  setError('');setStatus('loading');
  try{
   await enableDeviceVault(userId,householdId);
   const found=await inspectDeviceVault(userId,householdId);
   if(!alive.current)return;
   isEnabled.current=true;setEnabled(true);revision.current=found.revision;
   if(found.document){
    if(dirty.current){
     conflicted.current=true;setStatus('conflict');
     setError('This device already has a saved draft. Review it before overwriting your current writing.');
     return;
    }
    current.current=found.document;
    setTextState(found.document.text);setPromptState(found.document.prompt);setTitleState(found.document.title??'');
    setSavedAt(found.savedAt);setStatus('restored');
   }else{
    setStatus(dirty.current?'editing':'ready');
    if(dirty.current)void flush();
   }
  }catch(e){
   if(!alive.current)return;
   setError(e instanceof Error?e.message:'Could not enable encrypted local storage.');
   setStatus('error');
  }
 },[userId,householdId,flush]);

 const reloadStored=useCallback(async()=>{
  if(remoteBlocked.current){
   setError('Two devices saved different drafts. Choose the remote copy or explicitly keep this device’s copy.');
   return;
  }
  setStatus('loading');
  try{
   await queue.current.catch(()=>{});
   const found=await inspectDeviceVault(userId,householdId);
   if(!alive.current)return;
   if(!found.enabled)throw new Error('No device vault was found.');
   const next=found.document??{...INITIAL};
   current.current=next;setTextState(next.text);setPromptState(next.prompt);setTitleState(next.title??'');
   revision.current=found.revision;
   dirty.current=false;conflicted.current=false;editNo.current++;lastQueued.current=-1;
   setSavedAt(found.savedAt);setError('');setStatus(found.document?'restored':'ready');
  }catch(e){
   if(!alive.current)return;
   setError(e instanceof Error?e.message:'Could not recover your draft.');
   setStatus('error');
  }
 },[userId,householdId]);

 const loadRemote=useCallback(async()=>{
  setStatus('loading');
  try{
   await queue.current.catch(()=>{});
   if(!remoteKey.current)throw new Error('Restore account encryption before opening a synced draft.');
   const remote=await readSyncedDraft(userId,householdId,remoteKey.current);
   if(!remote.document)throw new Error('No saved draft is available on another device.');
   const old=await inspectDeviceVault(userId,householdId);
   const saved=await saveDeviceDraft(userId,householdId,remote.document,old.revision,true);
   if(!alive.current)return;
   current.current=remote.document;
   setTextState(remote.document.text);setPromptState(remote.document.prompt);setTitleState(remote.document.title??'');
   revision.current=saved.revision;remoteRevision.current=remote.revision;
   dirty.current=false;conflicted.current=false;remoteBlocked.current=false;editNo.current++;lastQueued.current=-1;
   setRemoteConflict(false);setSynced(true);setSavedAt(remote.savedAt);setError('');setStatus('restored');
  }catch(e){
   if(!alive.current)return;
   conflicted.current=true;setRemoteConflict(true);setStatus('conflict');
   setError(e instanceof Error?e.message:'Could not restore another device’s draft.');
  }
 },[userId,householdId]);

 const overwriteStored=useCallback(async()=>{
  if(!alive.current)return;
  // This choice is explicitly initiated by the author. Read the newest
  // server revision before replacing its ciphertext; the subsequent PUT
  // still uses compare-and-swap, so another edit cannot be lost silently.
  if(remoteKey.current&&remoteBlocked.current){
   try{
    const remote=await readSyncedDraft(userId,householdId,remoteKey.current);
    if(!alive.current)return;
    remoteRevision.current=remote.revision;
   }catch(e){
    setStatus('conflict');
    setError('Could not review the other device revision: '+(e instanceof Error?e.message:'Unknown error'));
    return;
   }
  }
  conflicted.current=false;remoteBlocked.current=false;
  dirty.current=true;editNo.current++;lastQueued.current=-1;
  setError('');
  await flush(true);
 },[userId,householdId,flush]);

 const retrySync=useCallback(async()=>{
  if(!remoteKey.current)return;
  dirty.current=true;editNo.current++;lastQueued.current=-1;setError('');
  await flush(true);
 },[flush]);

 const discard=useCallback(async()=>{
  if(discarding.current)return false;
  discarding.current=true; // Stop late debounce/background writes before deletion.
  try{
   if(remoteBlocked.current)throw new Error('Resolve the different device drafts before discarding. Neither copy was deleted.');
   // Finish any outstanding encrypted save before deleting it, so a pending
   // write cannot resurrect an intentionally discarded draft.
   await queue.current.catch(()=>{});
   if(remoteKey.current){
    // Remote deletion must succeed before clearing local ciphertext.
    const changed=await deleteSyncedDraft(userId,householdId,remoteKey.current,remoteRevision.current);
    remoteRevision.current=changed;remoteBlocked.current=false;
    setSynced(true);setRemoteConflict(false);
   }
   if(isEnabled.current)await discardDeviceDraft(userId,householdId);
   if(!alive.current)return false;
   current.current={...INITIAL};setTextState('');setPromptState(null);setTitleState('');
   dirty.current=false;conflicted.current=false;editNo.current++;lastQueued.current=-1;
   revision.current=0;setSavedAt(null);setError('');
   setStatus(isEnabled.current?'ready':'off');
   return true;
  }catch(e){
   if(alive.current){
    setStatus('error');
    setError(e instanceof Error?e.message:'Could not discard the encrypted draft.');
   }
   return false;
  }finally{
   discarding.current=false;
  }
 },[userId,householdId]);

 return {text,prompt,title,setText,setPrompt,setTitle,ready,enabled,status,savedAt,error,
  syncEnabled,synced,remoteConflict,enable,flush,discard,reloadStored,loadRemote,overwriteStored,retrySync};
}
