import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,BookOpen,Check,LockKeyhole,PenLine,RotateCw,Send,Shuffle,Trash2,Users} from 'lucide-react';
import type {Audience} from '../shared/audience';
import {api,StaleSessionRequest} from './lib/api';
import {promptsForAudience,relationshipOptions,RELATIONSHIP_LABELS,rotatePrompt,type Prompt,type Relationship} from './lib/prompts';
import {useWordsDraftVault} from './lib/useWordsDraftVault';
import {deviceIdentity,samePublicKey,type Identity,type PublicKey} from './lib/message-crypto';
import {listPrivateJournal,savePrivateJournal,deletePrivateJournal,type JournalEntry} from './lib/private-journal';
import {ShareComposer,SharedSpaces,type ShareSeed,type WordContact} from './SharedWords';

type Tab='explore'|'write'|'journal'|'shared'|'activity';
type ActivityEvent={id:string,sourceKind:'words'|'direct',sourceId:string,eventKind:'shared'|'reply'|'message',createdAt:string};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Could not complete this action.';
const TABS:{id:Tab,title:string,description:string}[]=[
 {id:'explore',title:'Explore prompts',description:'Find words that make conversations easier.'},
 {id:'write',title:'Write',description:'Private until you choose otherwise.'},
 {id:'journal',title:'My journal',description:'Saved on this device, only for me.'},
 {id:'shared',title:'Shared spaces',description:'Prompts, entries and conversations together.'},
 {id:'activity',title:'Activity',description:'New invitations and replies, without read receipts.'}
];

export function WordsHub({userId,householdId,audience}:{userId:string,householdId:string,audience:Audience}){
 const draft=useWordsDraftVault(userId,householdId);
 const [tab,setTab]=useState<Tab>(()=>{
  const section=new URLSearchParams(window.location.search).get('section');
  return TABS.some(item=>item.id===section)?section as Tab:'explore';
 }),[topic,setTopic]=useState('All topics'),[relationship,setRelationship]=useState<Relationship|'all'>('all'),[search,setSearch]=useState('');
 const [suggested,setSuggested]=useState<Prompt|null>(null),[seen,setSeen]=useState<string[]>([]);
 const [identity,setIdentity]=useState<Identity|null>(null),[people,setPeople]=useState<WordContact[]>([]),[keyError,setKeyError]=useState('');
 const [entries,setEntries]=useState<JournalEntry[]>([]),[editing,setEditing]=useState<{id:string,revision:number}|null>(null);
 const [loadingJournal,setLoadingJournal]=useState(true),[journalError,setJournalError]=useState(''),[journalBusy,setJournalBusy]=useState(false),[pendingLoad,setPendingLoad]=useState<JournalEntry|null>(null),[confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const [seed,setSeed]=useState<ShareSeed|null>(null),[openSpaceId,setOpenSpaceId]=useState<string|null>(null);
 const [activity,setActivity]=useState<ActivityEvent[]>([]),[pushEnabled,setPushEnabled]=useState(false),[pushReady,setPushReady]=useState(false),[pushBusy,setPushBusy]=useState(false),[pushError,setPushError]=useState('');
 const [feedback,setFeedback]=useState('');
 const lastInput=useRef(Date.now());
 function selectTab(next:Tab){
  if(tab!==next){
   const url=new URL(window.location.href);
   if(next==='explore')url.searchParams.delete('section');else url.searchParams.set('section',next);
   window.history.pushState(null,'',url.pathname+url.search);
  }
  setTab(next);
 }
 useEffect(()=>{
  const goBack=()=>{
   const section=new URLSearchParams(window.location.search).get('section');
   setTab(TABS.some(item=>item.id===section)?section as Tab:'explore');
   setSeed(null);
  };
  window.addEventListener('popstate',goBack);
  return()=>window.removeEventListener('popstate',goBack);
 },[]);

 const options=promptsForAudience(audience);
 const topics=[...new Set(options.filter(p=>relationship==='all'||p.relationship===relationship).map(p=>p.topic))].sort();
 const filtered=options.filter(p=>(topic==='All topics'||p.topic===topic)&&(relationship==='all'||p.relationship===relationship)&&
  (!search.trim()||(p.text+' '+p.topic).toLowerCase().includes(search.trim().toLowerCase())));
 async function reloadJournal(){
  const items=await listPrivateJournal(userId,householdId);
  setEntries(items);
 }
 async function reloadActivity(){
  const r=await api<{events:ActivityEvent[]}>(`/activity?householdId=${encodeURIComponent(householdId)}`);
  setActivity(r.events.filter(item=>item.sourceKind==='words'));
 }
 useEffect(()=>{
  let live=true;
  void reloadJournal().catch(e=>{if(live)setJournalError(errorText(e));}).finally(()=>{if(live)setLoadingJournal(false);});
  void (async()=>{
   try{
    const id=await deviceIdentity(userId);
    const remote=await api<{publicKey:PublicKey|null}>('/messages/keys/me');
    if(remote.publicKey&&!samePublicKey(id.publicKey,remote.publicKey))
     throw new Error('A different device key is already enrolled for this account. Do not clear the original device; recovery has not been implemented.');
    await api('/messages/keys/me','POST',{publicKey:id.publicKey});
    if(live)setIdentity(id);
   }catch(e){if(live&&!(e instanceof StaleSessionRequest))setKeyError(errorText(e));}
  })();
  void api<{people:WordContact[]}>(`/words/people?householdId=${encodeURIComponent(householdId)}`)
   .then(r=>{if(live)setPeople(r.people);})
   .catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setKeyError(errorText(e));});
  void api<{enabled:boolean}>(`/words/push-preference?householdId=${encodeURIComponent(householdId)}`)
   .then(r=>{if(live)setPushEnabled(r.enabled);}).catch(()=>{});
  void api<{configured:boolean,subscriptionCount:number}>(`/push/status?householdId=${encodeURIComponent(householdId)}`)
   .then(r=>{if(live)setPushReady(r.configured&&r.subscriptionCount>0);}).catch(()=>{});
  void reloadActivity().catch(()=>{});
  const onInput=()=>{lastInput.current=Date.now();};
  const onActivity=()=>{if(live)void reloadActivity().catch(()=>{});};
  document.addEventListener('pointerdown',onInput);document.addEventListener('keydown',onInput);
  window.addEventListener('carehold:activity-changed',onActivity);
  const timer=window.setInterval(()=>{if(live&&document.visibilityState==='visible'&&Date.now()-lastInput.current<90_000)
    void reloadActivity().catch(()=>{});},15000);
  return()=>{live=false;window.clearInterval(timer);document.removeEventListener('pointerdown',onInput);document.removeEventListener('keydown',onInput);window.removeEventListener('carehold:activity-changed',onActivity);};
 },[userId,householdId]);
 function takePrompt(p:Prompt){
  draft.setPrompt(p.text);setFeedback('Prompt selected. Your existing writing is preserved.');
  selectTab('write');
 }
 function shuffle(){
  const next=rotatePrompt(filtered,seen,suggested?.id||null);
  setSeen(next.seen);setSuggested(next.prompt);
 }
 function startSharing(next:ShareSeed){setSeed(next);setFeedback('');}
 function startJournal(entry:JournalEntry){
  draft.setText(entry.text);draft.setPrompt(entry.prompt);
  setEditing({id:entry.id,revision:entry.revision});setPendingLoad(null);selectTab('write');setFeedback('Entry loaded for editing.');
 }
 function loadJournal(entry:JournalEntry){
  if(draft.text.trim()&&(draft.text!==entry.text||draft.prompt!==entry.prompt)){setPendingLoad(entry);return;}
  startJournal(entry);
 }
 async function saveJournal(e:FormEvent){
  e.preventDefault();if(!draft.ready||!draft.text.trim()||journalBusy)return;
  setJournalBusy(true);setJournalError('');setFeedback('');
  try{
   await savePrivateJournal(userId,householdId,{id:editing?.id||crypto.randomUUID(),prompt:draft.prompt,text:draft.text},editing?.revision??0);
   await reloadJournal();const cleared=await draft.discard();
   setEditing(null);selectTab('journal');setFeedback(cleared?'Saved privately to this device. No one else can see it.':'Entry saved, but a draft copy remains. Discard it manually.');
  }catch(e){setJournalError(errorText(e));}
  finally{setJournalBusy(false);}
 }
 async function removeJournal(entryId:string){
  setJournalBusy(true);setJournalError('');
  try{
   await deletePrivateJournal(userId,householdId,entryId);
   await reloadJournal();setConfirmDelete(null);setFeedback('The local journal entry was deleted.');
   if(editing?.id===entryId)setEditing(null);
  }catch(e){setJournalError(errorText(e));}finally{setJournalBusy(false);}
 }
 async function setNotificationPreference(next:boolean){
  setPushBusy(true);setPushError('');
  try{
   const r=await api<{enabled:boolean}>('/words/push-preference','POST',{householdId,enabled:next});
   setPushEnabled(r.enabled);
  }catch(e){setPushError(errorText(e));}
  finally{setPushBusy(false);}
 }
 return <div className="words-hub">
  <div className="words-hub-warning" role="note"><LockKeyhole size={18}/><div><strong>Fictional writing only — security review pending.</strong>
   <p>Private journals and unsent drafts are encrypted locally on this browser. Shared spaces use experimental per-recipient encryption; device recovery and minor-specific privacy review are not ready. Do not enter confidential family, health or therapeutic information.</p></div></div>
  <nav className="words-hub-tabs" aria-label="Words sections">{TABS.map(item=><button type="button" key={item.id} className={tab===item.id&&!seed?'selected':''} aria-current={tab===item.id&&!seed?'page':undefined} onClick={()=>{setSeed(null);selectTab(item.id);setFeedback('');}}>
   <span>{item.title}{item.id==='activity'&&activity.length>0&&<b className="words-activity-count">{activity.length}</b>}</span>
   <small>{item.description}</small></button>)}</nav>
  {feedback&&<p className="words-status" role="status"><Check size={15}/>{feedback}</p>}
  {keyError&&<p className="messages-error" role="alert">Sharing or notification setup: {keyError}. Private journaling remains available.</p>}
  {seed?<ShareComposer seed={seed} userId={userId} householdId={householdId} identity={identity} people={people}
    onCreated={sid=>{setSeed(null);setOpenSpaceId(sid);selectTab('shared');setFeedback('Shared with your selected participants.');window.dispatchEvent(new Event('carehold:activity-changed'));}}
    onCancel={()=>setSeed(null)}/>:
  tab==='explore'?<section className="words-explore" aria-label="Prompt library">
   <div className="words-hub-section-top"><div><span className="mono kicker">A GENTLE PLACE TO BEGIN</span><h2>Find the right words.</h2><p className="muted">Browse 100+ thoughtful prompts. Share one as an invitation, or use it as inspiration for your own entry.</p></div></div>
   <div className="words-filter-row">
    <label>Relationship<select value={relationship} onChange={e=>{setRelationship(e.target.value as Relationship|'all');setTopic('All topics');setSeen([]);setSuggested(null);}}><option value="all">All relationships</option>{relationshipOptions(audience).map(r=><option value={r} key={r}>{RELATIONSHIP_LABELS[r]}</option>)}</select></label>
    <label>Category<select value={topic} onChange={e=>{setTopic(e.target.value);setSeen([]);setSuggested(null);}}><option>All topics</option>{topics.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Find a question<input value={search} onChange={e=>{setSearch(e.target.value);setSeen([]);setSuggested(null);}} placeholder="Search prompts…" maxLength={100}/></label>
   </div>
   <div className="words-explore-feature"><div className="words-hub-section-top"><span className="mono kicker">SOMETHING TO CONSIDER</span><button type="button" className="quiet small" disabled={!filtered.length} onClick={shuffle}><Shuffle size={16}/> Another prompt</button></div>
    <blockquote>{suggested?.text||filtered[0]?.text||'No prompts match those filters.'}</blockquote>
    {(suggested||filtered[0])&&<div className="words-response-actions"><button type="button" className="button outline small" onClick={()=>takePrompt(suggested||filtered[0])}><PenLine size={15}/> Write from this</button>
     <button type="button" className="button dark small" onClick={()=>startSharing({kind:'prompt',text:(suggested||filtered[0]).text,prompt:null})}><Send size={15}/> Share this prompt</button></div>}
   </div>
   <div className="words-prompts-ledger">{filtered.map((p,i)=><article key={p.id} className="words-prompt-line">
    <span className="mono kicker">{String(i+1).padStart(2,'0')} · {p.topic.toUpperCase()}</span>
    <p>{p.text}</p>
    <div className="words-response-actions"><button type="button" className="quiet small" onClick={()=>takePrompt(p)}>Write from this <ArrowRight size={14}/></button>
     <button type="button" className="quiet small" onClick={()=>startSharing({kind:'prompt',prompt:null,text:p.text})}>Share prompt <ArrowUpRight size={14}/></button></div>
   </article>)}</div>
  </section>:
  tab==='write'?<section className="words-compose" aria-label="Write a private journal entry">
   <div className="words-hub-section-top"><div><span className="mono kicker">PRIVATE UNTIL YOU CHOOSE TO SHARE</span><h2>{editing?'Continue your entry.':'Write what matters.'}</h2><p className="muted">Begin freely or select a prompt from Explore. The prompt and your writing stay together in your journal.</p></div></div>
   <form onSubmit={e=>void saveJournal(e)} className="words-journal-form">
    {draft.prompt&&<div className="words-selected-prompt"><span className="mono kicker">YOUR PROMPT</span><blockquote>{draft.prompt}</blockquote><button type="button" className="quiet small" onClick={()=>draft.setPrompt(null)}>Write without a prompt</button></div>}
    <label htmlFor="words-hub-editor">Your journal entry</label>
    <textarea id="words-hub-editor" rows={9} maxLength={2600} value={draft.text} disabled={!draft.ready||journalBusy}
     onChange={e=>draft.setText(e.target.value)} placeholder="Start wherever it feels natural…" onBlur={()=>{if(draft.enabled)void draft.flush();}}/>
    <div className="words-editor-footer"><span className="muted tiny">{draft.enabled?draft.status==='saved'?'Encrypted draft saved on this device':draft.status==='conflict'?'Another tab updated this draft':draft.status==='error'?'Local draft autosave failed':'Encrypted local draft autosave is on':'Draft autosave is off until you enable it'}</span><span className="mono tiny">{draft.text.length} / 2600</span></div>
    {draft.error&&<p className="messages-error" role="alert">{draft.error}</p>}
    {journalError&&<p className="messages-error" role="alert">{journalError}</p>}
    <div className="words-response-actions">
     {!draft.enabled&&draft.ready&&<button type="button" className="button outline small" onClick={()=>void draft.enable()}>Enable encrypted draft autosave</button>}
     {draft.status==='conflict'&&<><button type="button" className="button outline small" onClick={()=>void draft.reloadStored()}>Load other tab</button><button type="button" className="button outline small" onClick={()=>void draft.overwriteStored()}>Keep this version</button></>}
     <button type="submit" className="button outline small" disabled={!draft.ready||!draft.text.trim()||journalBusy||draft.status==='conflict'}><BookOpen size={16}/>{journalBusy?'Saving…':'Save privately'}</button>
     <button type="button" className="button dark small" disabled={!draft.ready||!draft.text.trim()||journalBusy||draft.status==='conflict'}
      onClick={()=>startSharing({kind:'journal',prompt:draft.prompt,text:draft.text})}><Users size={16}/> Share this entry</button>
    </div>
    <p className="muted tiny">Saving privately creates an encrypted journal entry on this device. Sharing creates a separate encrypted snapshot visible only to explicitly selected participants. No automatic send or silent updates.</p>
   </form>
  </section>:
  tab==='journal'?<section className="words-journal-shelf" aria-label="My private journal">
   <div className="words-hub-section-top"><div><span className="mono kicker">ONLY ON THIS DEVICE</span><h2>My journal.</h2><p className="muted">Each saved entry stays private until you deliberately share a snapshot. Clearing site data can permanently erase local entries.</p></div>
    <button type="button" className="button dark small" onClick={()=>{setEditing(null);selectTab('write');}}><PenLine size={15}/> Write something</button></div>
   {loadingJournal&&<p className="muted">Opening your local journal…</p>}
   {journalError&&<p className="messages-error" role="alert">{journalError}</p>}
   {!loadingJournal&&entries.length===0&&<p className="words-empty">No saved entries yet. The Write section is a quiet place to start.</p>}
   <div className="words-private-ledger">{entries.map(entry=><article className="words-entry-row" key={entry.id}>
    <span className="mono kicker">{new Date(entry.updatedAt).toLocaleDateString()} · ENCRYPTED ON THIS DEVICE</span>
    {entry.prompt&&<blockquote>{entry.prompt}</blockquote>}
    <p>{entry.text}</p>
    {pendingLoad?.id===entry.id&&<div className="words-audience-confirm"><span>Replace your current in-progress writing with this entry? Your existing unsaved draft will no longer be visible.</span>
     <button type="button" className="quiet small" onClick={()=>setPendingLoad(null)}>Keep draft</button>
     <button type="button" className="button dark small" onClick={()=>startJournal(entry)}>Load entry</button></div>}
    {confirmDelete===entry.id&&<div className="words-audience-confirm"><span>Delete the local entry? It cannot be recovered from Carehold.</span>
     <button type="button" className="quiet small" onClick={()=>setConfirmDelete(null)}>Keep</button>
     <button type="button" className="button dark small" disabled={journalBusy} onClick={()=>void removeJournal(entry.id)}>Delete</button></div>}
    <div className="words-response-actions">
     <button type="button" className="quiet small" onClick={()=>loadJournal(entry)}><PenLine size={15}/> Edit</button>
     <button type="button" className="quiet small" onClick={()=>startSharing({kind:'journal',text:entry.text,prompt:entry.prompt})}><Send size={15}/> Share snapshot</button>
     <button type="button" className="quiet small" onClick={()=>setConfirmDelete(entry.id)}><Trash2 size={15}/> Delete</button>
    </div>
   </article>)}</div>
  </section>:
  tab==='shared'?<SharedSpaces userId={userId} householdId={householdId} identity={identity} openSpaceId={openSpaceId}
   onPrivateSaved={()=>void reloadJournal().catch(e=>setJournalError(errorText(e)))}/>:
  <section className="words-activity" aria-label="New shared writing">
   <div className="words-hub-section-top"><div><span className="mono kicker">YOUR PRIVATE INBOX</span><h2>What's new.</h2><p className="muted">New invitations and discussion updates. No one else can see if or when you open them.</p></div>
    <button type="button" className="quiet small" onClick={()=>void reloadActivity().catch(e=>setPushError(errorText(e)))}><RotateCw size={16}/> Refresh</button></div>
   {!activity.length&&<p className="words-empty">You're caught up. There is no pressure to respond to anything you receive.</p>}
   <div className="words-activity-ledger">{activity.map(ev=><button type="button" className="words-shared-row" key={ev.id} onClick={()=>{setOpenSpaceId(ev.sourceId);selectTab('shared');}}>
    <span className="mono kicker">{new Date(ev.createdAt).toLocaleString()}</span>
    <strong>{ev.eventKind==='shared'?'Someone shared a prompt or journal entry':'A shared space has a new response'}</strong>
    <span className="muted tiny">Open the shared space at your own pace.</span>
    <ArrowUpRight size={17}/></button>)}</div>
   <div className="words-push-setting"><div><h3>Quiet device notifications</h3><p className="muted tiny">Optional notifications say only "Something new is waiting in Carehold." They never include names, prompts or writing. Read status is not shared.</p></div>
    {pushReady?<label className="words-push-choice"><input type="checkbox" checked={pushEnabled} disabled={pushBusy} onChange={e=>void setNotificationPreference(e.target.checked)}/> Notify this account about new shared writing</label>:
     <p className="muted tiny">To receive device notifications, first configure a device subscription in <a href="/settings">Settings</a>. In-app activity works without push.</p>}
    {pushError&&<p className="messages-error" role="alert">{pushError}</p>}
   </div>
  </section>}
 </div>;
}
