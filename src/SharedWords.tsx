import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowUpRight,Check,MessageCircle,RotateCw,Send,Trash2,Users} from 'lucide-react';
import {api,StaleSessionRequest} from './lib/api';
import {sealWord,unsealWord,type WordPayload} from './lib/words-space-crypto';
import type {Envelope,Identity,PublicKey} from './lib/message-crypto';
import {savePrivateJournal,listPrivateJournal,type JournalEntry} from './lib/private-journal';
import {saveSyncedPrivateJournal,listSyncedPrivateJournal} from './lib/synced-private-journal';
import {useWordsDraftVault} from './lib/useWordsDraftVault';

export type WordContact={id:string,name:string,publicKey:PublicKey|null};
export type ShareSeed={kind:'prompt'|'journal',prompt:string|null,text:string,title?:string,sourceEntryId?:string};
export type SpaceSummary={id:string,kind:'prompt'|'journal',createdBy:string,createdAt:string,creatorName:string,initialPostId:string,initialEnvelope:Envelope};
type SpacePost={id:string,authorId:string,kind:WordPayload['kind'],createdAt:string,envelope:Envelope};
type SpaceDetail={id:string,kind:'prompt'|'journal',createdBy:string,participants:WordContact[],posts:SpacePost[]};
type VisiblePost=SpacePost&{content:WordPayload|null};
const message=(e:unknown)=>e instanceof Error?e.message:'Something went wrong.';
export function ShareComposer({seed,userId,householdId,identity,keyError,people,onCreated,onCancel,onRefreshPeople}:{
 seed:ShareSeed,userId:string,householdId:string,identity:Identity|null,keyError:string,people:WordContact[],
 onCreated:(spaceId:string)=>Promise<void>|void,onCancel:()=>void,onRefreshPeople:()=>void
}){
 const [recipients,setRecipients]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{id:string,postId:string,recipients:string,copies:Record<string,Envelope>,publicKeys:Record<string,PublicKey>}|null>(null);
 const eligible=people.filter(p=>p.publicKey);
 const chosen=eligible.filter(p=>recipients.includes(p.id));
 const canSend=!!identity&&chosen.length>0&&!busy;
 async function create(e:FormEvent){
  e.preventDefault();if(!canSend||!identity)return;
  setBusy(true);setError('');
  try{
   const selected=chosen.map(p=>p.id).sort();
   const fingerprint=selected.join(':');
   const publicKeys=Object.fromEntries([{id:userId,publicKey:identity.publicKey},...chosen].map(p=>[p.id,p.publicKey!])) as Record<string,PublicKey>;
   let attempt=pending.current;
   if(!attempt||attempt.recipients!==fingerprint||JSON.stringify(attempt.publicKeys)!==JSON.stringify(publicKeys)){
    const sid=crypto.randomUUID(),postId=crypto.randomUUID();
    const participants=[{id:userId,name:'You',publicKey:identity.publicKey},...chosen];
    const payload:WordPayload={kind:seed.kind,text:seed.text,prompt:seed.prompt,...(seed.title?.trim()?{title:seed.title.trim()}:{})};
    const copies:Record<string,Envelope>={};
    for(const p of participants)copies[p.id]=await sealWord(payload,p.publicKey!,sid,postId,p.id);
    attempt={id:sid,postId,recipients:fingerprint,copies,publicKeys};
    pending.current=attempt;
   }
   await api('/words/spaces','POST',{id:attempt.id,postId:attempt.postId,householdId,kind:seed.kind,recipientIds:selected,copies:attempt.copies,publicKeys:attempt.publicKeys});
   pending.current=null;
   await onCreated(attempt.id);
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(false);}
 }
 return <section className="words-compose" aria-label="Share a prompt or journal entry">
  <div className="words-hub-section-top"><div><span className="mono kicker">SHARE WITH INTENTION</span><h2>Choose who joins.</h2></div><button type="button" className="quiet small" onClick={onCancel}><ArrowLeft size={15}/> Back</button></div>
  <div className="words-seed-preview"><span className="mono kicker">{seed.kind==='prompt'?'PROMPT INVITATION':'JOURNAL ENTRY'}</span>
   {seed.prompt&&<blockquote>{seed.prompt}</blockquote>}
   <p>{seed.text}</p></div>
  <form onSubmit={e=>void create(e)} className="words-share-form">
   <fieldset><legend>Who would you like to include?</legend>
    <button type="button" className="quiet small" onClick={onRefreshPeople}><RotateCw size={14}/> Refresh people</button>
    <p className="muted tiny">Select 1–10 people. Everyone selected will see the shared prompt or entry and replies in the same discussion. Private drafts and other journal entries remain separate.</p>
    <div className="words-share-people">
     {people.map(person=><label key={person.id} className="words-share-person">
      <input type="checkbox" checked={recipients.includes(person.id)} disabled={!person.publicKey||(!recipients.includes(person.id)&&recipients.length>=10)||busy}
       onChange={e=>{pending.current=null;setRecipients(v=>e.target.checked?[...v,person.id]:v.filter(id=>id!==person.id));}}/>
      <span><strong>{person.name}</strong>{!person.publicKey&&<small>Needs to open Words or Messages on their own device first</small>}</span>
     </label>)}
    </div>
    {people.length===0&&<p className="muted">Invite someone to this care circle before sharing.</p>}
   </fieldset>
   <div className="words-audience-confirm"><Users size={18}/><span>{chosen.length===0?'Nobody selected yet':`This will be shared with ${chosen.map(p=>p.name).join(', ')}. All participants can see discussion replies.`}</span></div>
   {error&&<p role="alert" className="messages-error">{error}</p>}
   {!identity&&<p role={keyError?'alert':'status'} className={keyError?'messages-error':'muted'}>{keyError?'Encrypted sharing is blocked on this browser: '+keyError+' Return to the browser profile where this account first enrolled its encryption key.':'Preparing the encrypted device key before sharing…'}</p>}
   <button className="button primary" type="submit" disabled={!canSend}><Send size={17}/>{busy?'Encrypting and sharing…':seed.kind==='prompt'?'Share this prompt':'Share this journal entry'}</button>
   <p className="muted tiny">Nothing is sent until this button is pressed. Fictional writing only: encryption and minor-consent review remain outstanding.</p>
  </form>
 </section>;
}
export function SharedSpaces({userId,householdId,identity,keyError,openSpaceId,onCloseSpace,onPrivateSaved}:{
 userId:string,householdId:string,identity:Identity|null,keyError:string,openSpaceId:string|null,onCloseSpace:()=>void,onPrivateSaved:()=>void
}){
 const [spaces,setSpaces]=useState<(SpaceSummary&{preview:WordPayload|null})[]>([]);
 const [active,setActive]=useState<string|null>(openSpaceId),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function refresh(){
  // The authenticated server list is metadata; do not hide existing spaces
  // because this browser cannot decrypt their content.
  const r=await api<{spaces:SpaceSummary[]}>(`/words/spaces?householdId=${encodeURIComponent(householdId)}`);
  const entries=await Promise.all(r.spaces.map(async item=>{
   if(!identity)return {...item,preview:null};
   try{return {...item,preview:await unsealWord(item.initialEnvelope,identity.privateKey,item.id,item.initialPostId,userId)};}
   catch{return {...item,preview:null};}
  }));
  setSpaces(entries);
  setError('');
 }
 useEffect(()=>{
  let live=true;
  setLoading(true);
  void refresh().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[identity,householdId,userId]);
 useEffect(()=>{if(openSpaceId)setActive(openSpaceId);},[openSpaceId]);
 useEffect(()=>{
  let live=true,lastInteracted=Date.now();
  const record=()=>{lastInteracted=Date.now();};
  const poll=()=>{if(live&&document.visibilityState==='visible'&&Date.now()-lastInteracted<90_000)
   void refresh().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));});};
  window.addEventListener('pointerdown',record);window.addEventListener('keydown',record);
  document.addEventListener('visibilitychange',poll);
  const interval=window.setInterval(poll,15000);
  return()=>{live=false;window.clearInterval(interval);window.removeEventListener('pointerdown',record);window.removeEventListener('keydown',record);document.removeEventListener('visibilitychange',poll);};
 },[identity,householdId]);
 if(active)return <SharedSpaceDetail key={active} spaceId={active} userId={userId} householdId={householdId} identity={identity} keyError={keyError}
  onBack={()=>{setActive(null);onCloseSpace();void refresh().catch(e=>setError(message(e)));}} onPrivateSaved={onPrivateSaved}/>;
 return <section className="words-shared" aria-label="Shared journal spaces">
  <div className="words-hub-section-top"><div><span className="mono kicker">PROMPTS & JOURNALS</span><h2>Shared spaces.</h2></div><button type="button" className="quiet small" onClick={()=>void refresh().catch(e=>setError(message(e)))}><RotateCw size={15}/> Refresh</button></div>
  {error&&<p role="alert" className="messages-error">Unable to load shared spaces: {error} <button type="button" className="quiet small" onClick={()=>void refresh().catch(e=>setError(message(e)))}>Retry</button></p>}
  {!identity&&<p role="alert" className="messages-error">{keyError?
    'Encrypted content cannot open on this browser: ' + keyError + ' If you previously used this account in another browser profile, return to that original profile. Do not clear its site data or replace the device key.':
    'Checking this browser’s encryption key. Shared writing remains encrypted until it is ready.'}</p>}
  {loading&&<p className="muted">Finding your shared spaces…</p>}
  {!loading&&!error&&spaces.length===0&&<p className="words-empty">No shared prompts or journal entries are available to this account in this care circle. Check which test account and browser profile you are using.</p>}
  <div className="words-shared-ledger">{spaces.map(s=><button type="button" key={s.id} className="words-shared-row" onClick={()=>setActive(s.id)}>
   <span className="mono kicker">{s.kind==='prompt'?'PROMPT INVITATION':'SHARED JOURNAL'} · {new Date(s.createdAt).toLocaleDateString()}</span>
   <strong>{s.preview?.title||s.preview?.prompt||(s.kind==='prompt'?s.preview?.text:null)||'Shared journal entry'}</strong>
   <span className="muted tiny">{s.creatorName} · {s.preview?'Open the entry and its discussion':'Encrypted content unavailable on this device'}</span>
   <ArrowUpRight size={18}/></button>)}</div>
 </section>;
}
function SharedSpaceDetail({spaceId,userId,householdId,identity,keyError,onBack,onPrivateSaved}:{
 spaceId:string,userId:string,householdId:string,identity:Identity|null,keyError:string,onBack:()=>void,onPrivateSaved:()=>void
}){
 const reflection=useWordsDraftVault(userId,householdId+':reflection:'+spaceId);
 const discussion=useWordsDraftVault(userId,householdId+':discussion:'+spaceId);
 const [detail,setDetail]=useState<(Omit<SpaceDetail,'posts'>&{posts:VisiblePost[]})|null>(null);
 const [privateNotes,setPrivateNotes]=useState<JournalEntry[]>([]),[sourceSaved,setSourceSaved]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState<'reflection'|'discussion'|'save'|null>(null),[status,setStatus]=useState('');
 const [confirmAction,setConfirmAction]=useState<{kind:'space'|'leave'|'post',id?:string}|null>(null),[removing,setRemoving]=useState(false);
 const retry=useRef<{kind:'reflection'|'discussion',text:string,id:string,copies:Record<string,Envelope>,publicKeys:Record<string,PublicKey>}|null>(null);
 const lastInteraction=useRef(Date.now());
 async function load(){
  if(!identity)return;
  const r=await api<SpaceDetail>(`/words/spaces/${encodeURIComponent(spaceId)}`);
  const posts=await Promise.all(r.posts.map(async p=>{
   try{return {...p,content:await unsealWord(p.envelope,identity.privateKey,spaceId,p.id,userId)};}
   catch{return {...p,content:null};}
  }));
  setDetail({...r,posts});
  try{
   const saved=await (identity.journalKey
    ?listSyncedPrivateJournal(userId,householdId,identity.journalKey)
    :listPrivateJournal(userId,householdId));
   const original=posts.find(p=>p.kind==='journal'&&p.authorId===userId)?.content;
   setSourceSaved(saved.some(e=>(e.spaceId===spaceId&&e.title!=='Private discussion note')||
    Boolean(original&&e.text===original.text&&e.prompt===original.prompt&&e.title===(original.title??''))));
   setPrivateNotes(saved.filter(e=>e.spaceId===spaceId&&e.title==='Private discussion note'&&
    !(original&&e.text===original.text&&e.prompt===original.prompt)));
  }catch(e){setError(message(e));}
  // A missing or undecipherable entry must not silently clear this recipient's inbox.
  // This acknowledgement remains recipient-private and never reaches the sender.
  if(posts.every(p=>p.content!==null)){
   await api('/activity/seen','POST',{householdId,sourceKind:'words',sourceId:spaceId});
   window.dispatchEvent(new Event('carehold:activity-changed'));
  }
 }
 useEffect(()=>{
  let live=true;
  void load().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));});
  const touch=()=>{lastInteraction.current=Date.now();};
  document.addEventListener('pointerdown',touch);document.addEventListener('keydown',touch);
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastInteraction.current<90_000)
   void load().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));});},12000);
  const resume=()=>{if(document.visibilityState==='visible'&&Date.now()-lastInteraction.current<90_000)
   void load().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));});};
  document.addEventListener('visibilitychange',resume);
  return()=>{live=false;window.clearInterval(interval);document.removeEventListener('pointerdown',touch);document.removeEventListener('keydown',touch);document.removeEventListener('visibilitychange',resume);};
 },[spaceId,identity,userId,householdId]);
 const first=detail?.posts.find(p=>p.kind==='journal'||p.kind==='prompt');
 const prompt=first?.content?.kind==='prompt'?first.content.text:first?.content?.prompt;
 const publicPosts=detail?.posts.filter(p=>p.kind==='reflection'||p.kind==='discussion')||[];
 const board=[
  ...publicPosts.map(p=>({id:p.id,at:Date.parse(p.createdAt),author:p.authorId,
   text:p.content?.text??'Unable to decrypt this response.',private:false,kind:p.kind})),
  ...privateNotes.map(p=>({id:p.id,at:p.createdAt,author:userId,text:p.text,private:true,kind:'note'}))
 ].sort((a,b)=>a.at-b.at);
 const author=(id:string)=>detail?.participants.find(p=>p.id===id)?.name||'Participant';
 async function send(kind:'reflection'|'discussion'){
  const vault=kind==='reflection'?reflection:discussion,text=vault.text;
  if(!identity||!detail||!vault.ready||!text.trim()||busy||removing)return;
  setBusy(kind);setError('');setStatus('');
  try{
   if(detail.participants.some(p=>!p.publicKey))throw new Error('A participant has no registered device key.');
   const publicKeys=Object.fromEntries(detail.participants.map(p=>[p.id,p.publicKey!])) as Record<string,PublicKey>;
   let attempt=retry.current;
   if(!attempt||attempt.kind!==kind||attempt.text!==text||JSON.stringify(attempt.publicKeys)!==JSON.stringify(publicKeys)){
    const postId=crypto.randomUUID(),copies:Record<string,Envelope>={};
    const payload:WordPayload={kind,text,prompt:null};
    for(const p of detail.participants)copies[p.id]=await sealWord(payload,p.publicKey!,spaceId,postId,p.id);
    attempt={kind,text,id:postId,copies,publicKeys};retry.current=attempt;
   }
   await api(`/words/spaces/${encodeURIComponent(spaceId)}/posts`,'POST',{id:attempt.id,kind,copies:attempt.copies,publicKeys:attempt.publicKeys});
   retry.current=null;
   const cleared=await vault.discard();
   setStatus(cleared?(kind==='reflection'?'Your journal response was shared deliberately.':'Your reply was posted.'):
    'Shared successfully, but the local draft could not be cleared. Discard it manually.');
   await load();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(null);}
 }
 async function savePrivateNote(){
  if(!discussion.ready||!discussion.text.trim()||busy||removing)return;
  setBusy('save');setError('');setStatus('');
  try{
   if(!identity)throw new Error('Set up encryption recovery before saving private notes.');
   const draft={id:crypto.randomUUID(),title:'Private discussion note',prompt:prompt||null,text:discussion.text,spaceId};
   const note=identity.journalKey
    ?await saveSyncedPrivateJournal(userId,householdId,identity.journalKey,draft)
    :await savePrivateJournal(userId,householdId,draft);
   setPrivateNotes(old=>[...old,note]);
   const cleared=await discussion.discard();
   setStatus(cleared?identity.journalKey?'Private note encrypted and synchronized. No one else can see it.':'Private note added on this device only. No one else can see it.':
    'Saved privately, but the extra device draft could not be cleared.');
   onPrivateSaved();
  }catch(e){setError(message(e));}
  finally{setBusy(null);}
 }
  async function restorePrivateJournal(){
   if(!identity||!first?.content||first.kind!=='journal'||first.authorId!==userId||busy||removing)return;
   setBusy('save');setError('');setStatus('');
   try{
    const saved=await (identity.journalKey
     ?listSyncedPrivateJournal(userId,householdId,identity.journalKey)
     :listPrivateJournal(userId,householdId));
    const original=first.content;
    if(saved.some(e=>(e.spaceId===spaceId&&e.title!=='Private discussion note')||
       (e.text===original.text&&e.prompt===original.prompt&&e.title===(original.title??'')))){
     setSourceSaved(true);setStatus('A private journal copy already exists.');
     return;
    }
    const privateCopy={id:crypto.randomUUID(),prompt:original.prompt,text:original.text,
     title:original.title??'',sharedAt:Date.now(),spaceId};
    if(identity.journalKey)await saveSyncedPrivateJournal(userId,householdId,identity.journalKey,privateCopy);
    else await savePrivateJournal(userId,householdId,privateCopy);
    setSourceSaved(true);onPrivateSaved();
    setStatus('Saved a separate private journal copy. The shared snapshot is unchanged.');
   }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
   finally{setBusy(null);}
  }
  async function removeSharedContent(){
   if(!confirmAction||removing||busy)return;
   setRemoving(true);setError('');setStatus('');
   try{
    if(confirmAction.kind==='post'){
     if(!confirmAction.id)throw new Error('Select the reply to remove.');
     await api(`/words/spaces/${encodeURIComponent(spaceId)}/posts/${encodeURIComponent(confirmAction.id)}`,'DELETE');
     await load();
     setStatus('Your reply is no longer shown in this discussion. Previously received copies cannot be recalled.');
    }else if(confirmAction.kind==='space'){
     await api(`/words/spaces/${encodeURIComponent(spaceId)}`,'DELETE',{confirmation:'DELETE SHARED SPACE'});
     window.dispatchEvent(new Event('carehold:activity-changed'));
     onBack();
    }else{
     await api(`/words/spaces/${encodeURIComponent(spaceId)}/leave`,'POST');
     window.dispatchEvent(new Event('carehold:activity-changed'));
     onBack();
    }
    setConfirmAction(null);
   }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
   finally{setRemoving(false);}
  }
  return <section className="words-space-detail" aria-label="Shared prompt and discussion">
  <button type="button" className="quiet small" onClick={onBack}><ArrowLeft size={15}/> All shared spaces</button>
  {error&&<p role="alert" className="messages-error">{error}</p>}
  {!identity?<p role="alert" className="messages-error">{keyError?
    'Encrypted content cannot open on this device: ' + keyError + ' Use the original browser profile for this account if you have switched browser profiles. No shared-space record was deleted.':
    'Waiting for your encrypted device identity. If it does not load, return to Shared spaces and review the device key warning.'}</p>:
   !detail?error?<p role="alert">Unable to open this shared space. Use Back and retry from the list.</p>:<p className="muted">Opening your shared space…</p>:<>
   <header className="words-space-intro">
    <span className="mono kicker">{detail.kind==='prompt'?'SHARED PROMPT':'SHARED JOURNAL'}</span>
    {first?.content?.title&&<p className="mono kicker">{first.content.title}</p>}
     {prompt&&<h2>{prompt}</h2>}
    {detail.kind==='journal'&&<div className="words-journal-quote"><span className="mono kicker">{author(first?.authorId||'')} WROTE</span><p>{first?.content?.text||'Unable to decrypt this entry on this device.'}</p></div>}
    <p className="muted tiny">Shared with {detail.participants.map(p=>p.id===userId?'you':p.name).join(', ')}. Everyone here sees posted replies, but not private drafts or whether anyone has viewed this page.</p>
   </header>
   {detail.kind==='journal'&&first?.authorId===userId&&first.content&&!sourceSaved&&<div className="words-response-actions">
    <button type="button" className="button outline small" disabled={!!busy||removing} onClick={()=>void restorePrivateJournal()}>
     Save a private journal copy
    </button>
    <span className="muted tiny">Useful for older shares that were never saved to your journal. This does not alter the shared entry.</span>
   </div>}
   <div className="words-space-management">
    <button type="button" className="quiet small" disabled={removing||!!busy} onClick={()=>setConfirmAction({kind:detail.createdBy===userId?'space':'leave'})}>
     <Trash2 size={15}/>{detail.createdBy===userId?'Remove shared space':'Leave this shared space'}
    </button>
    {confirmAction&&(confirmAction.kind==='space'||confirmAction.kind==='leave')&&<div className="words-audience-confirm" role="group" aria-label="Confirm shared space removal">
     <span>{confirmAction.kind==='space'
      ?'Remove this shared space and all replies from everyone’s Carehold view? Any private journal entry remains. If the shared snapshot is your only copy, save it privately before removing this space. Past copies on devices and encrypted recovery history may remain.'
      :'Leave this shared space? It will disappear from your account. Others can keep existing copies and continue without you.'}</span>
     <button type="button" className="quiet small" disabled={removing} onClick={()=>setConfirmAction(null)}>Keep space</button>
     <button type="button" className="button dark small" disabled={removing||!!busy} onClick={()=>void removeSharedContent()}>{removing?'Removing…':confirmAction.kind==='space'?'Remove for everyone':'Leave space'}</button>
    </div>}
   </div>
   <section className="words-space-discussion">
     <div className="words-hub-section-top"><div><span className="mono kicker">TALK ABOUT IT</span><h3>Discussion</h3></div><MessageCircle size={19}/></div>
     <p className="muted tiny">One place to talk together or keep a private note. Private notes are encrypted for your account and synchronized when recovery is configured; shared replies are visible to all selected participants.</p>
     {board.length===0&&<p className="muted">No notes or replies yet. Add something whenever you are ready.</p>}
     <ol className="words-discussion-ledger">
      {board.map(note=><li key={note.id} className={note.private?'words-private-note':''}>
       <span className="mono kicker">{note.private?'PRIVATE NOTE · ONLY YOU':note.kind==='reflection'?'SHARED REFLECTION':'SHARED REPLY'} · {author(note.author)} · {new Date(note.at).toLocaleString()}</span>
       <p>{note.text}</p>
       {!note.private&&note.author===userId&&<div className="words-response-actions">
        <button type="button" className="quiet small" disabled={removing||!!busy} onClick={()=>setConfirmAction({kind:'post',id:note.id})}><Trash2 size={14}/> Remove my reply</button>
       </div>}
       {confirmAction?.kind==='post'&&confirmAction.id===note.id&&<div className="words-audience-confirm" role="group" aria-label="Confirm reply removal">
        <span>Remove your reply from this discussion for everyone? This cannot recall content already seen or historical encrypted copies.</span>
        <button type="button" className="quiet small" disabled={removing} onClick={()=>setConfirmAction(null)}>Keep reply</button>
        <button type="button" className="button dark small" disabled={removing} onClick={()=>void removeSharedContent()}>{removing?'Removing…':'Remove reply'}</button>
       </div>}
      </li>)}
     </ol>
     {reflection.ready&&reflection.text.trim()&&<div className="words-audience-confirm">
      <span>An earlier private reflection draft exists on this device. Copy it into the discussion editor without sharing it; the original stays saved as a fallback.</span>
      <button type="button" className="button outline small" disabled={!discussion.ready||Boolean(discussion.text.trim())||Boolean(busy)}
       onClick={()=>discussion.setText(reflection.text)}>Copy old draft</button>
     </div>}
     <label htmlFor="words-discussion-reply">Write a reply or private note</label>
     <textarea id="words-discussion-reply" rows={5} maxLength={2600} disabled={!discussion.ready||!!busy||removing}
      value={discussion.text} onChange={e=>{discussion.setText(e.target.value);retry.current=null;}}
      placeholder="Write here first. Decide whether to keep it private or share it below…"/>
     <div className="words-response-actions">
      <button type="button" className="button outline small" disabled={!discussion.ready||!discussion.text.trim()||!!busy||removing||discussion.status==='conflict'}
       onClick={()=>void savePrivateNote()}>{busy==='save'?'Saving…':'Post private note · only me'}</button>
      <button type="button" className="button dark small" disabled={!discussion.ready||!discussion.text.trim()||!!busy||discussion.status==='conflict'} onClick={()=>void send('discussion')}>
       <Send size={15}/> {busy==='discussion'?'Posting…':'Post reply · everyone'}</button>
     </div>
     {discussion.status==='conflict'&&<div className="words-audience-confirm">
      <span>{discussion.remoteConflict?'Another device has a different encrypted draft. Neither copy was overwritten.':'Another tab edited this local draft.'}</span>
      <button type="button" className="button outline small" onClick={()=>void (discussion.remoteConflict?discussion.loadRemote():discussion.reloadStored())}>{discussion.remoteConflict?'Use other device copy':'Load local saved copy'}</button>
      <button type="button" className="button outline small" disabled={discussion.remoteConflict&&!(discussion.text.trim()||discussion.title.trim()||discussion.prompt)} onClick={()=>void discussion.overwriteStored()}>Keep this device’s draft</button>
     </div>}
     {discussion.status==='error'&&discussion.syncEnabled&&<button type="button" className="button outline small" onClick={()=>void discussion.retrySync()}>Retry encrypted draft sync</button>}
     <p className="muted tiny">{discussion.syncEnabled?(discussion.synced?'Draft encrypted and synchronized privately.':'Draft kept locally; sync may still be pending.'):'Encrypted draft stored on this device until recovery is configured.'}</p>
     {discussion.error&&<p className="messages-error" role="alert">{discussion.error}</p>}
    </section>
    {status&&<p className="words-status" role="status"><Check size={15}/>{status}</p>}
   <p className="muted tiny">No typing, read, draft or viewing indicators are shared with the author. Fictional test writing only.</p>
  </>}
 </section>;
}
