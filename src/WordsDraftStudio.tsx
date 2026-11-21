import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Eye,LockKeyhole,RotateCcw,ShieldAlert,Users,X} from 'lucide-react';
import type {Audience} from '../shared/audience';
import {api,StaleSessionRequest} from './lib/api';
import {WORDS_DRAFT_MAX_LENGTH,previewDisclosureLabel,previewRecipients,type PreviewMode,type RecipientOption} from './lib/words-preview';

export type WordsPromptSelection={id:string,text:string,audience:Audience,sequence:number};
type RecipientResult={recipients:RecipientOption[]};

/**
 * This is only a UX prototype. No text is sent in requests, saved to browser
 * storage, queued for sync, attached to a profile, or written to the server.
 * The component unmounts (destroying the draft state) outside Words.
 */
export function WordsDraftStudio({
 audience,householdId,selectedPrompt,
}:{
 audience:Audience,householdId:string,selectedPrompt:WordsPromptSelection|null
}){
 const [expanded,setExpanded]=useState(false);
 const [draft,setDraft]=useState('');
 const [prompt,setPrompt]=useState<string|null>(null);
 const [mode,setMode]=useState<PreviewMode>('private');
 const [recipients,setRecipients]=useState<RecipientOption[]>([]);
 const [recipientIds,setRecipientIds]=useState<string[]>([]);
 const [recipientLoading,setRecipientLoading]=useState(false);
 const [recipientError,setRecipientError]=useState('');
 const [clearConfirm,setClearConfirm]=useState(false);
 const lastSelection=useRef(0);

 useEffect(()=>{
   if(!selectedPrompt||selectedPrompt.sequence===lastSelection.current||selectedPrompt.audience!==audience)return;
   lastSelection.current=selectedPrompt.sequence;
   // A new writing prompt does not overwrite an in-progress draft.
   setPrompt(selectedPrompt.text);
   setExpanded(true);
   setClearConfirm(false);
 },[selectedPrompt,audience]);

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
 function discardDraft(){
   setDraft('');setPrompt(null);setMode('private');setRecipientIds([]);
   setRecipients([]);setRecipientError('');setClearConfirm(false);
 }
 const heading=audience==='child'?'A place for your words':audience==='teen'?'Put it into words':'A moment to write';
 const placeholder=audience==='child'?'You can write a few words, or a whole story…':audience==='teen'?'Start wherever it makes sense to you…':'Write whatever comes to mind…';

 return <section className="words-studio" aria-labelledby="words-studio-heading">
   <div className="words-studio-heading">
     <div>
       <span className="mono kicker">A SPACE FOR YOUR WORDS / LOCAL PREVIEW</span>
       <h2 id="words-studio-heading">{heading}<span className="title-point">.</span></h2>
       <p>Try a private note and explore what choosing who to share it with could feel like.</p>
     </div>
     <button type="button" className="button outline small" onClick={()=>setExpanded(open=>!open)} aria-expanded={expanded} aria-controls="words-studio-editor">
       {expanded?'Close editor':'Try writing'} <ArrowUpRight size={16}/>
     </button>
   </div>
   <div className="words-studio-notice" role="note">
     <ShieldAlert size={19} aria-hidden="true"/>
     <p><strong>Prototype, not secure journaling.</strong> Use fictional text only. Nothing is saved or sent through Carehold, and your draft disappears when you leave Words, lock, or sign out. This isn't end-to-end encrypted storage.</p>
   </div>
   {expanded&&<div id="words-studio-editor" className="words-studio-editor">
     {prompt&&<div className="words-studio-prompt"><span className="mono kicker">WRITING FROM THIS PROMPT</span><blockquote>{prompt}</blockquote><button type="button" className="quiet small" onClick={()=>setPrompt(null)} aria-label="Remove writing prompt"><X size={15}/> Remove prompt</button></div>}
     <label className="words-studio-draft-label" htmlFor="words-studio-draft">Your words</label>
     <textarea id="words-studio-draft" className="words-studio-textarea" value={draft} onChange={e=>{setDraft(e.target.value);setClearConfirm(false);}} maxLength={WORDS_DRAFT_MAX_LENGTH} rows={6} placeholder={placeholder} autoComplete="off" spellCheck={false} autoCorrect="off" aria-describedby="words-studio-help"/>
     <div className="words-studio-meta"><span id="words-studio-help">Only in this page's memory. Not saved, copied, or sent.</span><span className="mono" aria-label="Character count">{draft.length} / {WORDS_DRAFT_MAX_LENGTH}</span></div>
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
       <p>Saving and sending are intentionally unavailable until encryption and consent controls are ready.</p>
       <div className="words-studio-actions">
         {clearConfirm?<div className="words-studio-confirm" role="group" aria-label="Confirm draft discard"><span>Discard this draft?</span><button type="button" className="button outline small" onClick={()=>setClearConfirm(false)}>Keep</button><button type="button" className="button dark small" onClick={discardDraft}>Discard</button></div>:<button type="button" className="button outline small" onClick={()=>canClear?setClearConfirm(true):discardDraft()}><RotateCcw size={15}/> Clear draft</button>}
         <span className="words-studio-disabled-send" aria-disabled="true">Sending not enabled</span>
       </div>
     </div>
   </div>}
 </section>;
}
