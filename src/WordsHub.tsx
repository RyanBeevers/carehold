import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,BookOpen,Check,LockKeyhole,PenLine,RotateCw,Send,Shuffle,Trash2,Users} from 'lucide-react';
import type {Audience} from '../shared/audience';
import {api,StaleSessionRequest} from './lib/api';
import {promptsForAudience,relationshipOptions,RELATIONSHIP_LABELS,rotatePrompt,type Prompt,type Relationship} from './lib/prompts';
import {useWordsDraftVault} from './lib/useWordsDraftVault';
import {deviceIdentity,samePublicKey,type Identity,type PublicKey} from './lib/message-crypto';
import {listPrivateJournal,savePrivateJournal,deletePrivateJournal,type JournalEntry} from './lib/private-journal';
import {createEncryptedJournalBackup,openEncryptedJournalBackup} from './lib/journal-backup';
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
 const [entries,setEntries]=useState<JournalEntry[]>([]),[editing,setEditing]=useState<{id:string,revision:number,sharedAt?:number|null,spaceId?:string|null}|null>(null);
 const [pendingPrompt,setPendingPrompt]=useState<Prompt|null>(null),[pendingNew,setPendingNew]=useState(false);
 const [journalQuery,setJournalQuery]=useState(''),[journalVisibility,setJournalVisibility]=useState<'all'|'shared'|'private'>('all');
 const [journalFrom,setJournalFrom]=useState(''),[journalTo,setJournalTo]=useState(''),[journalPage,setJournalPage]=useState(0);
 const [loadingJournal,setLoadingJournal]=useState(true),[journalError,setJournalError]=useState(''),[journalBusy,setJournalBusy]=useState(false),[pendingLoad,setPendingLoad]=useState<JournalEntry|null>(null),[confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const [seed,setSeed]=useState<ShareSeed|null>(null),[openSpaceId,setOpenSpaceId]=useState<string|null>(null);
 const [activity,setActivity]=useState<ActivityEvent[]>([]),[pushEnabled,setPushEnabled]=useState(false),[pushReady,setPushReady]=useState(false),[pushPublicKey,setPushPublicKey]=useState<string|null>(null),[pushBusy,setPushBusy]=useState(false),[pushError,setPushError]=useState('');
 const [feedback,setFeedback]=useState('');
 const [backupMode,setBackupMode]=useState<'export'|'import'|null>(null);
 const [backupPassphrase,setBackupPassphrase]=useState(''),[backupFile,setBackupFile]=useState<File|null>(null);
 const [backupBusy,setBackupBusy]=useState(false),[backupError,setBackupError]=useState(''),[backupNotice,setBackupNotice]=useState('');
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
   .then(r=>{if(live)setPushReady(r.subscriptionCount>0);}).catch(()=>{});
  void api<{configured:boolean,publicKey:string|null}>('/push/config')
   .then(r=>{if(live)setPushPublicKey(r.configured?r.publicKey:null);}).catch(()=>{});
  void reloadActivity().catch(()=>{});
  const onInput=()=>{lastInput.current=Date.now();};
  const onActivity=()=>{if(live)void reloadActivity().catch(()=>{});};
  document.addEventListener('pointerdown',onInput);document.addEventListener('keydown',onInput);
  window.addEventListener('carehold:activity-changed',onActivity);
  const timer=window.setInterval(()=>{if(live&&document.visibilityState==='visible'&&Date.now()-lastInput.current<90_000)
    void reloadActivity().catch(()=>{});},15000);
  return()=>{live=false;window.clearInterval(timer);document.removeEventListener('pointerdown',onInput);document.removeEventListener('keydown',onInput);window.removeEventListener('carehold:activity-changed',onActivity);};
 },[userId,householdId]);
 async function beginFresh(prompt:string|null=null){
  const cleared=await draft.discard();
  if(!cleared){setJournalError('Could not reset the previous draft. Your writing was not replaced.');return;}
  setEditing(null);setPendingLoad(null);setPendingNew(false);setPendingPrompt(null);
  if(prompt)draft.setPrompt(prompt);
  selectTab('write');setFeedback(prompt?'New prompt selected; previous writing cleared.':'Started a new private entry.');
 }
 function takePrompt(p:Prompt){
  if(draft.text.trim()&&(draft.prompt!==p.text||!!draft.title.trim())){setPendingPrompt(p);setPendingNew(false);selectTab('write');return;}
  void beginFresh(p.text);
 }
 function shuffle(){
  const next=rotatePrompt(filtered,seen,suggested?.id||null);
  setSeen(next.seen);setSuggested(next.prompt);
 }
 function startSharing(next:ShareSeed){setSeed(next);setFeedback('');}
 const filteredJournal=entries.filter(entry=>{
  const haystack=[entry.title??'',entry.prompt??'',entry.text].join(' ').toLowerCase();
  const date=new Date(entry.createdAt).toISOString().slice(0,10);
  return (!journalQuery.trim()||haystack.includes(journalQuery.trim().toLowerCase()))&&
   (journalVisibility==='all'||(journalVisibility==='shared')===Boolean(entry.sharedAt))&&
   (!journalFrom||date>=journalFrom)&&(!journalTo||date<=journalTo);
 });
 const maxJournalPage=Math.max(0,Math.ceil(filteredJournal.length/10)-1);
 const safeJournalPage=Math.min(journalPage,maxJournalPage);
 const visibleJournal=filteredJournal.slice(safeJournalPage*10,safeJournalPage*10+10);
 function startJournal(entry:JournalEntry){
  draft.setText(entry.text);draft.setPrompt(entry.prompt);draft.setTitle(entry.title??'');
  setEditing({id:entry.id,revision:entry.revision,sharedAt:entry.sharedAt,spaceId:entry.spaceId});setPendingLoad(null);selectTab('write');setFeedback('Entry loaded for editing.');
 }
 function loadJournal(entry:JournalEntry){
  if((draft.text.trim()||draft.title.trim())&&(draft.text!==entry.text||draft.prompt!==entry.prompt||draft.title!==(entry.title??''))){setPendingLoad(entry);return;}
  startJournal(entry);
 }
 async function saveJournal(e:FormEvent){
  e.preventDefault();if(!draft.ready||!draft.text.trim()||journalBusy)return;
  setJournalBusy(true);setJournalError('');setFeedback('');
  try{
   await savePrivateJournal(userId,householdId,{id:editing?.id||crypto.randomUUID(),prompt:draft.prompt,text:draft.text,title:draft.title.trim(),sharedAt:editing?.sharedAt??null,spaceId:editing?.spaceId??null},editing?.revision??0);
   await reloadJournal();const cleared=await draft.discard();
   setEditing(null);selectTab('journal');setFeedback(cleared?'Saved privately to this device. No one else can see it.':'Entry saved, but a draft copy remains. Discard it manually.');
  }catch(e){setJournalError(errorText(e));}
  finally{setJournalBusy(false);}
 }
 async function backupJournal(e:FormEvent){
  e.preventDefault();
  if(!backupMode||backupBusy)return;
  setBackupBusy(true);setBackupError('');setBackupNotice('');
  try{
   if(backupMode==='export'){
    const fresh=await listPrivateJournal(userId,householdId);
    if(!fresh.length)throw new Error('Save at least one private entry before exporting a backup.');
    const encrypted=await createEncryptedJournalBackup(userId,householdId,fresh,backupPassphrase);
    const blob=new Blob([encrypted],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='carehold-journal-'+new Date().toISOString().slice(0,10)+'.encrypted.json';
    document.body.appendChild(anchor);
    anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
    setBackupNotice(`Encrypted backup downloaded for ${fresh.length} private journal entr${fresh.length===1?'y':'ies'}. Store it securely and keep the passphrase separately.`);
   }else{
    if(!backupFile)throw new Error('Choose a Carehold encrypted backup file.');
    if(backupFile.size>7_000_000)throw new Error('Backup file exceeds the supported size.');
    const restored=await openEncryptedJournalBackup(await backupFile.text(),userId,householdId,backupPassphrase);
    const existing=new Set((await listPrivateJournal(userId,householdId)).map(x=>x.id));
    let inserted=0;
    for(const entry of restored){
     // Restores never replace entries already present: no silent overwrites.
     if(existing.has(entry.id))continue;
     await savePrivateJournal(userId,householdId,entry);
     inserted++;
    }
    await reloadJournal();
    setBackupNotice(`Restored ${inserted} private entr${inserted===1?'y':'ies'}; skipped ${restored.length-inserted} existing entr${restored.length-inserted===1?'y':'ies'}. No shared-space keys were imported.`);
   }
   setBackupPassphrase('');setBackupFile(null);setBackupMode(null);
  }catch(e){setBackupError(errorText(e));}
  finally{setBackupBusy(false);}
 }
 async function removeJournal(entryId:string){
  setJournalBusy(true);setJournalError('');
  try{
   await deletePrivateJournal(userId,householdId,entryId);
   await reloadJournal();setConfirmDelete(null);setFeedback('The local journal entry was deleted.');
   if(editing?.id===entryId)setEditing(null);
  }catch(e){setJournalError(errorText(e));}finally{setJournalBusy(false);}
 }
 async function registerWordNotifications(){
  if(!pushPublicKey){setPushError('Device notifications are not configured for this Carehold server. In-app activity still works.');return;}
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
   setPushError('Push is unavailable in this browser. On iPhone, open Carehold from the installed Home Screen app.');
   return;
  }
  if(Notification.permission==='denied'){
   setPushError('Notifications are blocked in the browser or operating-system settings.');
   return;
  }
  // Request permission directly from this button click to preserve user activation.
  const permissionPromise=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
  setPushBusy(true);setPushError('');
  try{
   const permission=await permissionPromise;
   if(permission!=='granted')throw new Error('Notification permission was not granted.');
   const worker=await navigator.serviceWorker.register('/sw.js');
   await navigator.serviceWorker.ready;
   const encoded=pushPublicKey.replace(/-/g,'+').replace(/_/g,'/');
   const raw=atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'='));
   const key=new Uint8Array([...raw].map(c=>c.charCodeAt(0)));
   let subscription=await worker.pushManager.getSubscription();
   if(subscription?.options.applicationServerKey){
    const old=new Uint8Array(subscription.options.applicationServerKey);
    if(old.length!==key.length||old.some((v,i)=>v!==key[i])){
     await subscription.unsubscribe();subscription=null;
    }
   }
   if(!subscription)subscription=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key.buffer as ArrayBuffer});
   await api('/push/subscribe','POST',{subscription:subscription.toJSON()});
   const pref=await api<{enabled:boolean}>('/words/push-preference','POST',{householdId,enabled:true});
   setPushReady(true);setPushEnabled(pref.enabled);
  }catch(e){setPushError(errorText(e));}
  finally{setPushBusy(false);}
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
  {keyError&&<p className="messages-error" role="alert"><strong>Encrypted sharing unavailable on this browser.</strong> {keyError} Your private journal is still usable. If this is a second browser or another test profile signed into the same account, return to the original browser profile. Do not reset your account's key or clear the original browser data.</p>}
  {seed?<ShareComposer seed={seed} userId={userId} householdId={householdId} identity={identity} people={people}
    onCreated={sid=>{
    const current=seed;setSeed(null);setOpenSpaceId(sid);selectTab('shared');
    if(current?.kind==='journal'){
     if(current.sourceEntryId){
      const entry=entries.find(e=>e.id===current.sourceEntryId);
      if(entry)void savePrivateJournal(userId,householdId,{id:entry.id,prompt:entry.prompt,text:entry.text,title:entry.title??'',sharedAt:Date.now(),spaceId:entry.spaceId??null},entry.revision)
       .then(()=>reloadJournal()).catch(e=>setJournalError(errorText(e)));
     }else if(draft.text===current.text&&draft.prompt===current.prompt){
      void draft.discard().then(cleared=>{if(cleared)setEditing(null);else setJournalError('Shared, but the old device draft could not be cleared.');});
     }
    }
    setFeedback('Shared with your selected participants.');window.dispatchEvent(new Event('carehold:activity-changed'));
   }}
    onCancel={()=>setSeed(null)} onRefreshPeople={()=>void api<{people:WordContact[]}>(`/words/people?householdId=${encodeURIComponent(householdId)}`).then(r=>setPeople(r.people)).catch(e=>setKeyError(errorText(e)))}/>:
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
    {(pendingPrompt||pendingNew)&&<div className="words-audience-confirm" role="alert">
     <span>{pendingPrompt?'Start this new prompt?':'Start a fresh entry?'} Your previous unsaved draft will be cleared.</span>
     <button type="button" className="quiet small" onClick={()=>{setPendingPrompt(null);setPendingNew(false);}}>Keep writing</button>
     <button type="button" className="button dark small" onClick={()=>void beginFresh(pendingPrompt?.text??null)}>Start fresh</button>
    </div>}
    <label>Title (optional)<input maxLength={120} value={draft.title} onChange={e=>draft.setTitle(e.target.value)} placeholder="Give this entry a name"/></label>
    {draft.prompt&&<div className="words-selected-prompt"><span className="mono kicker">YOUR PROMPT</span><blockquote>{draft.prompt}</blockquote><button type="button" className="quiet small" onClick={()=>draft.setPrompt(null)}>Write without a prompt</button></div>}
    <label htmlFor="words-hub-editor">Your journal entry</label>
    <textarea id="words-hub-editor" rows={9} maxLength={2600} value={draft.text} disabled={!draft.ready||journalBusy}
     onChange={e=>draft.setText(e.target.value)} placeholder="Start wherever it feels natural…" onBlur={()=>{if(draft.enabled)void draft.flush();}}/>
    <div className="words-editor-footer"><span className="muted tiny">{draft.enabled?draft.status==='saved'?'Encrypted draft saved on this device':draft.status==='conflict'?'Another tab updated this draft':draft.status==='error'?'Local draft autosave failed':'Encrypted local draft autosave is on':'Encrypted draft autosave is starting'}</span><span className="mono tiny">{draft.text.length} / 2600</span></div>
    {draft.error&&<p className="messages-error" role="alert">{draft.error}</p>}
    {journalError&&<p className="messages-error" role="alert">{journalError}</p>}
    <div className="words-response-actions">
     
     {draft.status==='conflict'&&<><button type="button" className="button outline small" onClick={()=>void draft.reloadStored()}>Load other tab</button><button type="button" className="button outline small" onClick={()=>void draft.overwriteStored()}>Keep this version</button></>}
     <button type="submit" className="button outline small" disabled={!draft.ready||!draft.text.trim()||journalBusy||draft.status==='conflict'}><BookOpen size={16}/>{journalBusy?'Saving…':'Save privately'}</button>
     <button type="button" className="button dark small" disabled={!draft.ready||!draft.text.trim()||journalBusy||draft.status==='conflict'}
      onClick={()=>startSharing({kind:'journal',prompt:draft.prompt,text:draft.text,title:draft.title})}><Users size={16}/> Share this entry</button>
    </div>
    <p className="muted tiny">Saving privately creates an encrypted journal entry on this device. Sharing creates a separate encrypted snapshot visible only to explicitly selected participants. No automatic send or silent updates.</p>
   </form>
  </section>:
  tab==='journal'?<section className="words-journal-shelf" aria-label="My private journal">
   <div className="words-hub-section-top"><div><span className="mono kicker">ONLY ON THIS DEVICE</span><h2>My journal.</h2><p className="muted">Each saved entry stays private until you deliberately share a snapshot. Clearing site data can permanently erase local entries.</p></div>
    <button type="button" className="button dark small" onClick={()=>{selectTab('write');setPendingNew(Boolean(draft.text.trim()));if(!draft.text.trim())void beginFresh();}}><PenLine size={15}/> New entry</button></div>
   <div className="words-backup-toolbar">
     <button type="button" className="quiet small" disabled={backupBusy||entries.length===0} onClick={()=>{setBackupMode(backupMode==='export'?null:'export');setBackupError('');setBackupPassphrase('');setBackupFile(null);}}><LockKeyhole size={15}/> Export encrypted backup</button>
     <button type="button" className="quiet small" disabled={backupBusy} onClick={()=>{setBackupMode(backupMode==='import'?null:'import');setBackupError('');setBackupPassphrase('');setBackupFile(null);}}><BookOpen size={15}/> Restore encrypted backup</button>
    </div>
    {backupMode&&<form className="words-backup-form" onSubmit={e=>void backupJournal(e)} aria-label="Encrypted journal backup">
     <h3>{backupMode==='export'?'Back up private entries':'Restore private entries'}</h3>
     <p className="muted tiny">{backupMode==='export'?'Only your saved private entries are included. Protect the downloaded file and remember this passphrase.':'Restores only entries for this same account and care circle, skipping existing entries. No current writing will be overwritten.'} Shared discussion keys, medication records and unsaved drafts are not included.</p>
     {backupMode==='import'&&<label>Encrypted Carehold backup file
      <input type="file" accept=".json,application/json" required onChange={e=>setBackupFile(e.target.files?.[0]??null)}/>
     </label>}
     <label>Backup passphrase (at least 12 characters)
      <input type="password" autoComplete="off" minLength={12} maxLength={1024} required value={backupPassphrase} onChange={e=>setBackupPassphrase(e.target.value)} placeholder="Use a unique, memorable passphrase"/>
     </label>
     <div className="words-response-actions"><button type="submit" className="button dark small" disabled={backupBusy||backupPassphrase.length<12||(backupMode==='import'&&!backupFile)}>{backupBusy?'Working…':backupMode==='export'?'Download encrypted backup':'Restore entries'}</button>
      <button type="button" className="button outline small" disabled={backupBusy} onClick={()=>{setBackupMode(null);setBackupPassphrase('');setBackupFile(null);setBackupError('');}}>Cancel</button>
     </div>
     {backupError&&<p className="messages-error" role="alert">{backupError}</p>}
    </form>}
    {backupNotice&&<p className="words-status" role="status"><Check size={15}/>{backupNotice}</p>}
    {loadingJournal&&<p className="muted">Opening your local journal…</p>}
   {journalError&&<p className="messages-error" role="alert">{journalError}</p>}
   {!loadingJournal&&entries.length===0&&<p className="words-empty">No saved entries yet. The Write section is a quiet place to start.</p>}
   <div className="words-filter-row">
    <label>Search journal<input value={journalQuery} onChange={e=>{setJournalQuery(e.target.value);setJournalPage(0);}} placeholder="Title, prompt, writing…"/></label>
    <label>Sharing<select value={journalVisibility} onChange={e=>{setJournalVisibility(e.target.value as typeof journalVisibility);setJournalPage(0);}}><option value="all">All entries</option><option value="shared">Shared snapshots</option><option value="private">Not shared</option></select></label>
    <label>From<input type="date" value={journalFrom} onChange={e=>{setJournalFrom(e.target.value);setJournalPage(0);}}/></label>
    <label>To<input type="date" value={journalTo} onChange={e=>{setJournalTo(e.target.value);setJournalPage(0);}}/></label>
   </div>
   <p className="muted tiny">{filteredJournal.length} entries · showing {visibleJournal.length}. Shared status is tracked for new shares from this device; older shares may appear private.</p>
   <div className="words-private-ledger">{visibleJournal.map(entry=><article className="words-entry-row" key={entry.id}>
    <span className="mono kicker">{new Date(entry.updatedAt).toLocaleDateString()} · {entry.sharedAt?'SNAPSHOT SHARED':'PRIVATE'} · ENCRYPTED ON THIS DEVICE</span>
    {entry.title&&<h3>{entry.title}</h3>}
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
     <button type="button" className="quiet small" onClick={()=>startSharing({kind:'journal',text:entry.text,prompt:entry.prompt,title:entry.title??'',sourceEntryId:entry.id})}><Send size={15}/> Share snapshot</button>
     <button type="button" className="quiet small" onClick={()=>setConfirmDelete(entry.id)}><Trash2 size={15}/> Delete</button>
    </div>
   </article>)}</div>
   {filteredJournal.length>10&&<div className="words-response-actions">
    <button type="button" className="button outline small" disabled={safeJournalPage===0} onClick={()=>setJournalPage(Math.max(0,safeJournalPage-1))}>Previous</button>
    <span className="muted tiny">Page {safeJournalPage+1} of {Math.ceil(filteredJournal.length/10)}</span>
    <button type="button" className="button outline small" disabled={(safeJournalPage+1)*10>=filteredJournal.length} onClick={()=>setJournalPage(safeJournalPage+1)}>Next</button>
   </div>}
  </section>:
  tab==='shared'?<SharedSpaces userId={userId} householdId={householdId} identity={identity} keyError={keyError} openSpaceId={openSpaceId}
   onCloseSpace={()=>setOpenSpaceId(null)} onPrivateSaved={()=>void reloadJournal().catch(e=>setJournalError(errorText(e)))}/>:
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
     pushPublicKey?<button type="button" className="button outline small" disabled={pushBusy} onClick={()=>void registerWordNotifications()}>{pushBusy?'Enabling…':'Enable Words notifications on this device'}</button>:
     <p className="muted tiny">Device push keys are not configured here. In-app activity remains available without device notifications.</p>}
    {pushError&&<p className="messages-error" role="alert">{pushError}</p>}
   </div>
  </section>}
 </div>;
}
