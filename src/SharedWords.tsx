import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowUpRight,BookOpen,Check,LockKeyhole,MessageCircle,RotateCw,Send,Users} from 'lucide-react';
import {api,StaleSessionRequest} from './lib/api';
import {sealWord,unsealWord,type WordPayload} from './lib/words-space-crypto';
import type {Envelope,Identity,PublicKey} from './lib/message-crypto';
import {savePrivateJournal} from './lib/private-journal';
import {useWordsDraftVault} from './lib/useWordsDraftVault';

export type WordContact={id:string,name:string,publicKey:PublicKey|null};
export type ShareSeed={kind:'prompt'|'journal',prompt:string|null,text:string};
export type SpaceSummary={id:string,kind:'prompt'|'journal',createdBy:string,createdAt:string,creatorName:string,initialPostId:string,initialEnvelope:Envelope};
type SpacePost={id:string,authorId:string,kind:WordPayload['kind'],createdAt:string,envelope:Envelope};
type SpaceDetail={id:string,kind:'prompt'|'journal',createdBy:string,participants:WordContact[],posts:SpacePost[]};
type VisiblePost=SpacePost&{content:WordPayload|null};
const message=(e:unknown)=>e instanceof Error?e.message:'Something went wrong.';
export function ShareComposer({seed,userId,householdId,identity,people,onCreated,onCancel,onRefreshPeople}:{
 seed:ShareSeed,userId:string,householdId:string,identity:Identity|null,people:WordContact[],
 onCreated:(spaceId:string)=>void,onCancel:()=>void,onRefreshPeople:()=>void
}){
 const [recipients,setRecipients]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{id:string,postId:string,recipients:string,copies:Record<string,Envelope>}|null>(null);
 const eligible=people.filter(p=>p.publicKey);
 const chosen=eligible.filter(p=>recipients.includes(p.id));
 const canSend=!!identity&&chosen.length>0&&!busy;
 async function create(e:FormEvent){
  e.preventDefault();if(!canSend||!identity)return;
  setBusy(true);setError('');
  try{
   const selected=chosen.map(p=>p.id).sort();
   const fingerprint=selected.join(':');
   let attempt=pending.current;
   if(!attempt||attempt.recipients!==fingerprint){
    const sid=crypto.randomUUID(),postId=crypto.randomUUID();
    const participants=[{id:userId,name:'You',publicKey:identity.publicKey},...chosen];
    const payload:WordPayload={kind:seed.kind,text:seed.text,prompt:seed.prompt};
    const copies:Record<string,Envelope>={};
    for(const p of participants)copies[p.id]=await sealWord(payload,p.publicKey!,sid,postId,p.id);
    attempt={id:sid,postId,recipients:fingerprint,copies};
    pending.current=attempt;
   }
   await api('/words/spaces','POST',{id:attempt.id,postId:attempt.postId,householdId,kind:seed.kind,recipientIds:selected,copies:attempt.copies});
   pending.current=null;
   onCreated(attempt.id);
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
   {!identity&&<p role="status" className="muted">Preparing your device key; sharing is unavailable until this succeeds.</p>}
   <button className="button primary" type="submit" disabled={!canSend}><Send size={17}/>{busy?'Encrypting and sharing…':seed.kind==='prompt'?'Share this prompt':'Share this journal entry'}</button>
   <p className="muted tiny">Nothing is sent until this button is pressed. Fictional writing only: encryption and minor-consent review remain outstanding.</p>
  </form>
 </section>;
}
export function SharedSpaces({userId,householdId,identity,openSpaceId,onCloseSpace,onPrivateSaved}:{
 userId:string,householdId:string,identity:Identity|null,openSpaceId:string|null,onCloseSpace:()=>void,onPrivateSaved:()=>void
}){
 const [spaces,setSpaces]=useState<(SpaceSummary&{preview:WordPayload|null})[]>([]);
 const [active,setActive]=useState<string|null>(openSpaceId),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function refresh(){
  if(!identity)return;
  const r=await api<{spaces:SpaceSummary[]}>(`/words/spaces?householdId=${encodeURIComponent(householdId)}`);
  const entries=await Promise.all(r.spaces.map(async s=>{
   try{return {...s,preview:await unsealWord(s.initialEnvelope,identity.privateKey,s.id,s.initialPostId,userId)};}
   catch{return {...s,preview:null};}
  }));
  setSpaces(entries);
 }
 useEffect(()=>{
  let live=true;
  if(!identity){setLoading(false);return;}
  setLoading(true);
  void refresh().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[identity,householdId]);
 useEffect(()=>{if(openSpaceId)setActive(openSpaceId);},[openSpaceId]);
 useEffect(()=>{
  if(!identity)return;
  let live=true,lastInteracted=Date.now();
  const record=()=>{lastInteracted=Date.now();};
  const poll=()=>{if(live&&document.visibilityState==='visible'&&Date.now()-lastInteracted<90_000)
   void refresh().catch(e=>{if(live&&!(e instanceof StaleSessionRequest))setError(message(e));});};
  window.addEventListener('pointerdown',record);window.addEventListener('keydown',record);
  document.addEventListener('visibilitychange',poll);
  const interval=window.setInterval(poll,15000);
  return()=>{live=false;window.clearInterval(interval);window.removeEventListener('pointerdown',record);window.removeEventListener('keydown',record);document.removeEventListener('visibilitychange',poll);};
 },[identity,householdId]);
 if(active)return <SharedSpaceDetail key={active} spaceId={active} userId={userId} householdId={householdId} identity={identity}
  onBack={()=>{setActive(null);onCloseSpace();void refresh().catch(e=>setError(message(e)));}} onPrivateSaved={onPrivateSaved}/>;
 return <section className="words-shared" aria-label="Shared journal spaces">
  <div className="words-hub-section-top"><div><span className="mono kicker">PROMPTS & JOURNALS</span><h2>Shared spaces.</h2></div><button type="button" className="quiet small" onClick={()=>void refresh().catch(e=>setError(message(e)))}><RotateCw size={15}/> Refresh</button></div>
  {error&&<p role="alert" className="messages-error">{error}</p>}
  {loading&&<p className="muted">Finding your shared spaces…</p>}
  {!loading&&!spaces.length&&<p className="words-empty">No shared prompts or journal entries yet. Discover a prompt or write a journal entry to start one.</p>}
  <div className="words-shared-ledger">{spaces.map(s=><button type="button" key={s.id} className="words-shared-row" onClick={()=>setActive(s.id)}>
   <span className="mono kicker">{s.kind==='prompt'?'PROMPT INVITATION':'SHARED JOURNAL'} · {new Date(s.createdAt).toLocaleDateString()}</span>
   <strong>{s.preview?.prompt||(s.kind==='prompt'?s.preview?.text:null)||'Shared journal entry'}</strong>
   <span className="muted tiny">{s.creatorName} · Open the entry and its discussion</span>
   <ArrowUpRight size={18}/></button>)}</div>
 </section>;
}
function SharedSpaceDetail({spaceId,userId,householdId,identity,onBack,onPrivateSaved}:{
 spaceId:string,userId:string,householdId:string,identity:Identity|null,onBack:()=>void,onPrivateSaved:()=>void
}){
 const reflection=useWordsDraftVault(userId,householdId+':reflection:'+spaceId);
 const discussion=useWordsDraftVault(userId,householdId+':discussion:'+spaceId);
 const [detail,setDetail]=useState<(Omit<SpaceDetail,'posts'>&{posts:VisiblePost[]})|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState<'reflection'|'discussion'|'save'|null>(null),[status,setStatus]=useState('');
 const retry=useRef<{kind:'reflection'|'discussion',text:string,id:string,copies:Record<string,Envelope>}|null>(null);
 const lastInteraction=useRef(Date.now());
 async function load(){
  if(!identity)return;
  const r=await api<SpaceDetail>(`/words/spaces/${encodeURIComponent(spaceId)}`);
  const posts=await Promise.all(r.posts.map(async p=>{
   try{return {...p,content:await unsealWord(p.envelope,identity.privateKey,spaceId,p.id,userId)};}
   catch{return {...p,content:null};}
  }));
  setDetail({...r,posts});
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
 const responses=detail?.posts.filter(p=>p.kind==='reflection')||[];
 const discussionPosts=detail?.posts.filter(p=>p.kind==='discussion')||[];
 const author=(id:string)=>detail?.participants.find(p=>p.id===id)?.name||'Participant';
 async function send(kind:'reflection'|'discussion'){
  const vault=kind==='reflection'?reflection:discussion,text=vault.text;
  if(!identity||!detail||!vault.ready||!text.trim()||busy)return;
  setBusy(kind);setError('');setStatus('');
  try{
   if(detail.participants.some(p=>!p.publicKey))throw new Error('A participant has no registered device key.');
   let attempt=retry.current;
   if(!attempt||attempt.kind!==kind||attempt.text!==text){
    const postId=crypto.randomUUID(),copies:Record<string,Envelope>={};
    const payload:WordPayload={kind,text,prompt:null};
    for(const p of detail.participants)copies[p.id]=await sealWord(payload,p.publicKey!,spaceId,postId,p.id);
    attempt={kind,text,id:postId,copies};retry.current=attempt;
   }
   await api(`/words/spaces/${encodeURIComponent(spaceId)}/posts`,'POST',{id:attempt.id,kind,copies:attempt.copies});
   retry.current=null;
   const cleared=await vault.discard();
   setStatus(cleared?(kind==='reflection'?'Your journal response was shared deliberately.':'Your reply was posted.'):
    'Shared successfully, but the local draft could not be cleared. Discard it manually.');
   await load();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(null);}
 }
 async function saveReflection(){
  if(!reflection.ready||!reflection.text.trim()||busy)return;
  setBusy('save');setError('');setStatus('');
  try{
   await savePrivateJournal(userId,householdId,{id:crypto.randomUUID(),prompt:prompt||null,text:reflection.text});
   const cleared=await reflection.discard();
   setStatus(cleared?'Saved privately on this device. Nobody else can see it.':'Saved privately; discard the extra draft manually.');
   onPrivateSaved();
  }catch(e){setError(message(e));}
  finally{setBusy(null);}
 }
 return <section className="words-space-detail" aria-label="Shared prompt and discussion">
  <button type="button" className="quiet small" onClick={onBack}><ArrowLeft size={15}/> All shared spaces</button>
  {error&&<p role="alert" className="messages-error">{error}</p>}
  {!detail?<p className="muted">Opening your shared space…</p>:<>
   <header className="words-space-intro">
    <span className="mono kicker">{detail.kind==='prompt'?'SHARED PROMPT':'SHARED JOURNAL'}</span>
    {prompt&&<h2>{prompt}</h2>}
    {detail.kind==='journal'&&<div className="words-journal-quote"><span className="mono kicker">{author(first?.authorId||'')} WROTE</span><p>{first?.content?.text||'Unable to decrypt this entry on this device.'}</p></div>}
    <p className="muted tiny">Shared with {detail.participants.map(p=>p.id===userId?'you':p.name).join(', ')}. Everyone here sees posted replies, but not private drafts or whether anyone has viewed this page.</p>
   </header>
   <section className="words-response-editor" aria-label="Your journal response">
    <div className="words-hub-section-top"><div><span className="mono kicker">REFLECT FOR YOURSELF</span><h3>Your journal response</h3></div><LockKeyhole size={19}/></div>
    <p className="muted tiny">Writing here is private until you press Share response. You can also save it only in your device journal or leave it as a draft.</p>
    <textarea rows={5} maxLength={2600} aria-label="Private journal response" disabled={!reflection.ready||!!busy}
     value={reflection.text} onChange={e=>{reflection.setText(e.target.value);retry.current=null;}} placeholder="Start with what this brings up for you…"/>
    <div className="words-response-actions">
     {!reflection.enabled&&reflection.ready&&<button type="button" className="button outline small" disabled={!!busy} onClick={()=>void reflection.enable()}>Enable encrypted draft autosave</button>}
     <button type="button" className="button outline small" disabled={!reflection.ready||!reflection.text.trim()||!!busy} onClick={()=>void saveReflection()}>Save privately</button>
     <button type="button" className="button dark small" disabled={!reflection.ready||!reflection.text.trim()||!!busy||reflection.status==='conflict'} onClick={()=>void send('reflection')}>
      <Send size={15}/> {busy==='reflection'?'Sharing…':'Share response with everyone'}</button>
    </div>
    {reflection.error&&<p className="messages-error" role="alert">{reflection.error}</p>}
   </section>
   {responses.length>0&&<section className="words-shared-responses"><h3>Shared reflections</h3>
    {responses.map(r=><div key={r.id} className="words-entry-row"><span className="mono kicker">{author(r.authorId)} · {new Date(r.createdAt).toLocaleString()}</span><p>{r.content?.text||'Unable to decrypt this response.'}</p></div>)}
   </section>}
   <section className="words-space-discussion"><div className="words-hub-section-top"><div><span className="mono kicker">TALK ABOUT IT</span><h3>Discussion</h3></div><MessageCircle size={19}/></div>
    {discussionPosts.length===0&&<p className="muted">No replies yet. Anyone in this space can participate whenever they choose.</p>}
    <ol className="words-discussion-ledger">{discussionPosts.map(r=><li key={r.id}><span className="mono kicker">{author(r.authorId)} · {new Date(r.createdAt).toLocaleString()}</span><p>{r.content?.text||'Unable to decrypt this reply.'}</p></li>)}</ol>
    <label htmlFor="words-discussion-reply">Write a reply that everyone in this space can see</label>
    <textarea id="words-discussion-reply" rows={3} maxLength={2600} disabled={!discussion.ready||!!busy}
     value={discussion.text} onChange={e=>{discussion.setText(e.target.value);retry.current=null;}} placeholder="Add to the conversation…"/>
    <div className="words-response-actions">
     {!discussion.enabled&&discussion.ready&&<button type="button" className="button outline small" disabled={!!busy} onClick={()=>void discussion.enable()}>Enable encrypted draft autosave</button>}
     <button type="button" className="button dark small" disabled={!discussion.ready||!discussion.text.trim()||!!busy||discussion.status==='conflict'} onClick={()=>void send('discussion')}>
      <Send size={15}/> {busy==='discussion'?'Posting…':'Post reply'}</button>
    </div>
    {discussion.error&&<p className="messages-error" role="alert">{discussion.error}</p>}
   </section>
   {status&&<p className="words-status" role="status"><Check size={15}/>{status}</p>}
   <p className="muted tiny">No typing, read, draft or viewing indicators are shared with the author. Fictional test writing only.</p>
  </>}
 </section>;
}
