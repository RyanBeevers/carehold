import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Eye,LockKeyhole,RotateCcw,ShieldAlert,Users,X} from 'lucide-react';
import type {Audience} from '../shared/audience';
import {api,StaleSessionRequest} from './lib/api';
import {WORDS_DRAFT_MAX_LENGTH,previewDisclosureLabel,previewRecipients,type PreviewMode,type RecipientOption} from './lib/words-preview';
import {useWordsDraftVault} from './lib/useWordsDraftVault';

export type WordsPromptSelection={id:string,text:string,audience:Audience,sequence:number};
type RecipientResult={recipients:RecipientOption[]};

/**
 * This is an EXPERIMENTAL prototype: no text is sent to an API or recipient.
 * Opt-in browser-local AES-GCM autosave is available, but it is not E2EE,
 * independently audited, cross-device or safe for real private writing.
 * Unmount destroys plaintext React state, not an opted-in encrypted local copy.
 */
export function WordsDraftStudio({
 audience,householdId,userId,selectedPrompt,onPrepareMessage,
}:{
 audience:Audience,householdId:string,userId:string,selectedPrompt:WordsPromptSelection|null,
 onPrepareMessage:(message:{text:string,kind:'message'|'prompt'})=>void
}){
 const vault=useWordsDraftVault(userId,householdId);
 const {text:draft,prompt,setText:setDraft,setPrompt,ready:vaultReady,enabled:vaultEnabled,status:vaultStatus,error:vaultError}=vault;
 const [expanded,setExpanded]=useState(false);
 const [vaultBusy,setVaultBusy]=useState(false);
 const [conflictChoice,setConflictChoice]=useState<'reload'|'overwrite'|null>(null);
 const [mode,setMode]=useState<PreviewMode>('private');
 const [recipients,setRecipients]=useState<RecipientOption[]>([]);
 const [recipientIds,setRecipientIds]=useState<string[]>([]);
 const [recipientLoading,setRecipientLoading]=useState(false);
 const [recipientError,setRecipientError]=useState('');
 const [clearConfirm,setClearConfirm]=useState(false);
 const lastSelection=useRef(0);

 useEffect(()=>{
   if(!vaultReady||!selectedPrompt||selectedPrompt.sequence===lastSelection.current||selectedPrompt.audience!==audience)return;
   lastSelection.current=selectedPrompt.sequence;
   // A new writing prompt does not overwrite an in-progress draft.
   setPrompt(selectedPrompt.text);
   setExpanded(true);
   setClearConfirm(false);
 },[selectedPrompt,audience,vaultReady]);
 useEffect(()=>{
   if(vaultReady&&(draft.length>0||prompt!==null))setExpanded(true);
 },[vaultReady]);

 useEffect(()=>{
   if(mode!=='recipients')return;
   let active=true;
   setRecipientLoading(true);setRecipientError('');
   void api<RecipientResult>(`/words/recipient-options?householdId=${encodeURIComponent(householdId)}`)
     .then(result=>{if(active)setRecipients(result.recipients);})
     .catch(error=>{
       if(!active||error instanceof StaleSessionRequest)return;
       setRecipientError('Recipient choices could not be loaded. You can still keep your note private.');
     })
     .finally(()=>{if(active)setRecipientLoading(false);});
   return()=>{active=false;};
 },[householdId,mode]);

 const picked=previewRecipients(mode,recipients,recipientIds);
 const label=previewDisclosureLabel(mode,picked.length);
 const canClear=draft.length>0||prompt!==null||picked.length>0;
 function changeMode(next:PreviewMode){
   setMode(next);
   if(next==='private'){setRecipientIds([]);setRecipientError('');}
   setClearConfirm(false);
 }
 async function discardDraft(){
   setVaultBusy(true);
   const erased=await vault.discard();
   setVaultBusy(false);
   if(!erased)return;
   setMode('private');setRecipientIds([]);setRecipients([]);
   setRecipientError('');setClearConfirm(false);
 }
 async function changeVault(action:'enable'|'reload'|'overwrite'|'retry'){
   setVaultBusy(true);
   try{
     if(action==='enable')await vault.enable();
     else if(action==='reload')await vault.reloadStored();
     else if(action==='overwrite')await vault.overwriteStored();
     else await vault.flush();
     setConflictChoice(null);
   }finally{setVaultBusy(false);}
 }
 const saveLabel={
   loading:'Checking this device…',off:'Autosave off',ready:'Encrypted local autosave is ready',
   editing:'Unsaved changes — saving shortly',saving:'Encrypting and saving…',
   saved:'Saved on this device',restored:'Recovered from this device',
   conflict:'Another tab saved a newer version',error:'Local save unavailable — text remains here'
 }[vaultStatus];
 const heading=audience==='child'?'A place for your words':audience==='teen'?'Put it into words':'A moment to write';
 const placeholder=audience==='child'?'You can write a few words, or a whole story…':audience==='teen'?'Start wherever it makes sense to you…':'Write whatever comes to mind…';

 return <section className="words-studio" aria-labelledby="words-studio-heading">
   <div className="words-studio-heading">
     <div>
       <span className="mono kicker">YOUR WORDS / PRIVATE DRAFT</span>
       <h2 id="words-studio-heading">{heading}<span className="title-point">.</span></h2>
       <p>Write privately, or deliberately continue into Messages to send a copy to one person.</p>
     </div>
     <button type="button" className="button outline small" onClick={()=>setExpanded(open=>!open)} aria-expanded={expanded} aria-controls="words-studio-editor">
       {expanded?'Close editor':'Try writing'} <ArrowUpRight size={16}/>
     </button>
   </div>
   <div className="words-studio-notice" role="note">
     <ShieldAlert size={19} aria-hidden="true"/>
     <p><strong>Device-only encrypted drafts.</strong> {vaultEnabled?'Autosave encrypts writing before storing it in this browser. It is not synced or sent. The stored key can still be used by code running on this device; this is not end-to-end encryption. Clearing browser site data deletes drafts.':'Without autosave, writing disappears when you leave or lock Carehold. You can opt in to a device-only encrypted save; this legacy browser-only store is not intended for writing.'}</p>
   </div>
   <div className="words-vault-controls" role="status" aria-live="polite">
     <div><strong>{saveLabel}</strong>{vaultEnabled&&vault.savedAt&&<span>Last saved: {new Date(vault.savedAt).toLocaleString()}</span>}</div>
     {!vaultEnabled&&vaultReady&&<button type="button" className="button outline small" disabled={vaultBusy} onClick={()=>void changeVault('enable')}><LockKeyhole size={15}/> Enable encrypted device autosave</button>}
     {vaultError&&<p role="alert" className="words-vault-error">{vaultError}</p>}
     {vaultStatus==='error'&&vaultEnabled&&<button type="button" className="button outline small" disabled={vaultBusy} onClick={()=>void changeVault('retry')}>Retry saving</button>}
   </div>
   {vaultStatus==='conflict'&&<div className="words-vault-conflict">
     <strong>Two tabs have different drafts.</strong>
     <p>The writing on this screen is still here. Choose whether to load the other tab's saved version or replace it with this version. Neither choice sends a message.</p>
     {conflictChoice?<div className="words-studio-confirm"><span>{conflictChoice==='reload'?'Replace this unsaved writing with the stored version?':'Replace the previously saved version with this writing?'}</span><button type="button" className="button outline small" onClick={()=>setConflictChoice(null)}>Cancel</button><button type="button" className="button dark small" disabled={vaultBusy} onClick={()=>void changeVault(conflictChoice)}>{conflictChoice==='reload'?'Load saved':'Replace saved'}</button></div>:<div className="words-studio-actions"><button type="button" className="button outline small" onClick={()=>setConflictChoice('reload')}>Review saved version</button><button type="button" className="button outline small" onClick={()=>setConflictChoice('overwrite')}>Keep this version</button></div>}
   </div>}
   {expanded&&<div id="words-studio-editor" className="words-studio-editor">
     {prompt&&<div className="words-studio-prompt"><span className="mono kicker">WRITING FROM THIS PROMPT</span><blockquote>{prompt}</blockquote><button type="button" className="quiet small" onClick={()=>setPrompt(null)} aria-label="Remove writing prompt"><X size={15}/> Remove prompt</button></div>}
     <label className="words-studio-draft-label" htmlFor="words-studio-draft">Your words</label>
     <textarea id="words-studio-draft" className="words-studio-textarea" value={draft} disabled={!vaultReady||vaultBusy} onChange={e=>{setDraft(e.target.value);setClearConfirm(false);}} onBlur={()=>{if(vaultEnabled)void vault.flush();}} maxLength={WORDS_DRAFT_MAX_LENGTH} rows={6} placeholder={placeholder} autoComplete="off" spellCheck={false} autoCorrect="off" aria-describedby="words-studio-help"/>
     <div className="words-studio-meta"><span id="words-studio-help">{vaultEnabled?'Encrypted locally on this browser after you enable autosave. Never sent or synced.':'Only in this page’s memory until you opt in. Not saved or sent.'}</span><span className="mono" aria-label="Character count">{draft.length} / {WORDS_DRAFT_MAX_LENGTH}</span></div>
     <fieldset className="words-studio-sharing">
       <legend>Who would see it?</legend>
       <div className="words-studio-modes">
         <label className={mode==='private'?'is-active':''}><input type="radio" name="words-preview-sharing" checked={mode==='private'} onChange={()=>changeMode('private')}/><LockKeyhole size={17} aria-hidden="true"/><span>Just me</span></label>
         <label className={mode==='recipients'?'is-active':''}><input type="radio" name="words-preview-sharing" checked={mode==='recipients'} onChange={()=>changeMode('recipients')}/><Users size={17} aria-hidden="true"/><span>Preview sharing</span></label>
       </div>
     </fieldset>
     {mode==='recipients'&&<div className="words-studio-recipient-options">
       <p><strong>Choose individual recipients for a preview.</strong> This does not send an invitation, notification, or message.</p>
       {recipientLoading?<p role="status">Loading eligible accounts…</p>:recipientError?<p role="alert">{recipientError}</p>:recipients.length===0?<p>No eligible accounts are available in this circle yet.</p>:<div className="words-recipient-list">
         {recipients.map(person=><label key={person.id} className="words-recipient-option">
           <input type="checkbox" checked={recipientIds.includes(person.id)} disabled={!recipientIds.includes(person.id)&&recipientIds.length>=10} onChange={e=>{
             const checked=e.currentTarget.checked;
             setRecipientIds(ids=>checked?[...ids.filter(id=>id!==person.id),person.id].slice(0,10):ids.filter(id=>id!==person.id));
           }}/>
           <span>{person.name}</span>
           {recipientIds.includes(person.id)&&<Check size={15} aria-hidden="true"/>}
         </label>)}
       </div>}{recipients.length>10&&<p>You can preview up to 10 individual recipients at a time.</p>}
     </div>}
     <div className="words-studio-status"><Eye size={17} aria-hidden="true"/><div><strong>{label}</strong><span>{mode==='private'?'The private-by-default option stays selected.':'A recipient would only see content you explicitly chose to send, after secure sharing is implemented.'}</span></div></div>
     <div className="words-studio-footer">
       <p>{vaultEnabled?'Your Words draft stays on this device. Continuing into Messages does not automatically send it; choose a recipient and press Send there.':'Without local autosave, the original Words draft is lost when you navigate away. Continuing into Messages temporarily carries a copy in memory, but does not send it.'} Previewed recipients are not carried over.</p>
       <div className="words-studio-actions">
         {clearConfirm?<div className="words-studio-confirm" role="group" aria-label="Confirm draft discard"><span>Discard this draft?</span><button type="button" className="button outline small" onClick={()=>setClearConfirm(false)}>Keep</button><button type="button" className="button dark small" disabled={vaultBusy} onClick={()=>void discardDraft()}>Discard</button></div>:<button type="button" className="button outline small" onClick={()=>canClear?setClearConfirm(true):discardDraft()}><RotateCcw size={15}/> Clear draft</button>}
         <button type="button" className="button dark small" disabled={!vaultReady||vaultBusy||(!draft.trim()&&!prompt)} onClick={()=>onPrepareMessage({text:draft.trim()?draft:prompt!,kind:draft.trim()?'message':'prompt'})}><ArrowUpRight size={15}/> Continue in Messages</button>
       </div>
     </div>
   </div>}
 </section>;
}
