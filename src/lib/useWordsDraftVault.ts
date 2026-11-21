import {useCallback,useEffect,useRef,useState} from 'react';
import {
 DraftConflictError,enableDeviceVault,inspectDeviceVault,saveDeviceDraft,discardDeviceDraft,
 type DraftDocument
} from './words-vault';

export type DraftSaveStatus='loading'|'off'|'ready'|'editing'|'saving'|'saved'|'restored'|'conflict'|'error';
const INITIAL:DraftDocument={text:'',prompt:null};

/**
 * Debounced, serialized writes to an explicitly enabled device-local vault.
 * Text is NEVER transmitted to the API. We don't persist selected recipients.
 * The vault is not E2EE or safe for unreviewed confidential patient writing.
 */
export function useWordsDraftVault(userId:string,householdId:string){
 const [text,setTextState]=useState('');
 const [prompt,setPromptState]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [status,setStatus]=useState<DraftSaveStatus>('loading');
 const [savedAt,setSavedAt]=useState<number|null>(null);
 const [error,setError]=useState('');
 const current=useRef<DraftDocument>({...INITIAL});
 const revision=useRef(0),editNo=useRef(0),lastQueued=useRef(-1);
 const dirty=useRef(false),isEnabled=useRef(false),conflicted=useRef(false);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const alive=useRef(false),generation=useRef(0),isReady=useRef(false);

 useEffect(()=>{
  alive.current=true;
  const gen=++generation.current;
  setReady(false);isReady.current=false;
  setStatus('loading');setError('');setEnabled(false);isEnabled.current=false;
  void inspectDeviceVault(userId,householdId).then(result=>{
   if(!alive.current||gen!==generation.current)return;
   isEnabled.current=result.enabled;setEnabled(result.enabled);
   const restored=result.document??{...INITIAL};
   current.current=restored;
   setTextState(restored.text);setPromptState(restored.prompt);
   revision.current=result.revision;
   dirty.current=false;conflicted.current=false;lastQueued.current=-1;editNo.current=0;
   setSavedAt(result.savedAt);
   setStatus(result.enabled?(result.document?'restored':'ready'):'off');
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
  if(!isReady.current)return;
  current.current=next;
  setTextState(next.text);setPromptState(next.prompt);
  dirty.current=true;editNo.current+=1;
  if(!conflicted.current)setStatus(isEnabled.current?'editing':'off');
 }
 const setText=useCallback((value:string)=>editField({...current.current,text:value}),[]);
 const setPrompt=useCallback((value:string|null)=>editField({...current.current,prompt:value}),[]);

 const flush=useCallback((force=false):Promise<void>=>{
  if(!isEnabled.current||!isReady.current||!dirty.current||conflicted.current&&!force)return queue.current;
  const edit=editNo.current,snapshot={...current.current};
  if(!force&&lastQueued.current>=edit)return queue.current;
  lastQueued.current=edit;
  if(alive.current)setStatus('saving');
  const task=queue.current.catch(()=>{}).then(async()=>{
   const result=await saveDeviceDraft(userId,householdId,snapshot,revision.current,force);
   revision.current=result.revision;
   if(!alive.current)return;
   setSavedAt(result.savedAt);
   if(edit===editNo.current){
    dirty.current=false;conflicted.current=false;setStatus('saved');setError('');
   }else{
    setStatus('editing');
   }
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
  if(!ready||!enabled||status==='conflict'||!dirty.current)return;
  const timer=window.setTimeout(()=>{void flush();},1000);
  return()=>window.clearTimeout(timer);
 },[text,prompt,ready,enabled,status==='conflict',flush]);

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
    setTextState(found.document.text);setPromptState(found.document.prompt);
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
  setStatus('loading');
  try{
   await queue.current.catch(()=>{});
   const found=await inspectDeviceVault(userId,householdId);
   if(!alive.current)return;
   if(!found.enabled)throw new Error('No device vault was found.');
   const next=found.document??{...INITIAL};
   current.current=next;setTextState(next.text);setPromptState(next.prompt);
   revision.current=found.revision;
   dirty.current=false;conflicted.current=false;editNo.current++;lastQueued.current=-1;
   setSavedAt(found.savedAt);setError('');setStatus(found.document?'restored':'ready');
  }catch(e){
   if(!alive.current)return;
   setError(e instanceof Error?e.message:'Could not recover your draft.');
   setStatus('error');
  }
 },[userId,householdId]);

 const overwriteStored=useCallback(async()=>{
  conflicted.current=false;
  dirty.current=true;editNo.current++;lastQueued.current=-1;
  setError('');
  await flush(true);
 },[flush]);

 const discard=useCallback(async()=>{
  try{
   // Finish any outstanding encrypted save before deleting it, so a pending
   // write cannot resurrect an intentionally discarded draft.
   await queue.current.catch(()=>{});
   if(isEnabled.current)await discardDeviceDraft(userId,householdId);
   if(!alive.current)return false;
   current.current={...INITIAL};setTextState('');setPromptState(null);
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
  }
 },[userId,householdId]);

 return {text,prompt,setText,setPrompt,ready,enabled,status,savedAt,error,
  enable,flush,discard,reloadStored,overwriteStored};
}
