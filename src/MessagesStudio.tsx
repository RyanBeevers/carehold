import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Audience} from '../shared/audience';
import {api,StaleSessionRequest} from './lib/api';
import {promptsForAudience,relationshipOptions,RELATIONSHIP_LABELS,rotatePrompt,type Prompt,type Relationship} from './lib/prompts';
import {seal,unseal,type Identity,type PublicKey,type Envelope,type Content} from './lib/message-crypto';
import {MessageRecoveryGate} from './MessageRecoveryGate';
import {useWordsDraftVault} from './lib/useWordsDraftVault';
type Contact={id:string,name:string,publicKey:PublicKey|null};
type Thread={id:string,createdAt:string,participants:Contact[]};
type Wire={id:string,senderId:string,createdAt:string,envelope:Envelope};
type Visible=Wire&{content:Content|null};
export type MessageHandoff={id:number,text:string,kind:Content['kind']};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Please try again.';
export function MessagesStudio({userId,householdId,audience,handoff,onHandoffHandled}:{userId:string,householdId:string,audience:Audience,handoff:MessageHandoff|null,onHandoffHandled:(id:number)=>void}){
 const [key,setKey]=useState<Identity|null>(null),[contacts,setContacts]=useState<Contact[]>([]),[threads,setThreads]=useState<Thread[]>([]);
 const [active,setActive]=useState(''),[items,setItems]=useState<Visible[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const chosen=threads.find(t=>t.id===active);
 async function directory(){
  const [c,t]=await Promise.all([
   api<{contacts:Contact[]}>(`/messages/contacts?householdId=${encodeURIComponent(householdId)}`),
   api<{conversations:Thread[]}>(`/messages/conversations?householdId=${encodeURIComponent(householdId)}`)
  ]);
  setContacts(c.contacts);setThreads(t.conversations);
 }
 useEffect(()=>{
  setKey(null);setContacts([]);setThreads([]);setActive('');setError('');setBusy(false);
 },[userId,householdId]);
 useEffect(()=>{
  if(!key)return;
  let live=true;
  void (async()=>{
   try{
    const [c,t]=await Promise.all([
     api<{contacts:Contact[]}>(`/messages/contacts?householdId=${encodeURIComponent(householdId)}`),
     api<{conversations:Thread[]}>(`/messages/conversations?householdId=${encodeURIComponent(householdId)}`)
    ]);
    if(live){setContacts(c.contacts);setThreads(t.conversations);}
   }catch(e){if(live&&!(e instanceof StaleSessionRequest))setError(errorText(e));}
  })();
  return()=>{live=false;};
 },[key,householdId]);
 useEffect(()=>{
  if(!active||!key){setItems([]);return;}
  let live=true;
  async function load(){
   try{
    const r=await api<{messages:Wire[]}>(`/messages/threads/${encodeURIComponent(active)}`);
    const values=await Promise.all(r.messages.map(async m=>{
     try{return {...m,content:await unseal(m.envelope,key!.privateKey,active,m.id,userId)};}
     catch{return {...m,content:null};}
    }));
    if(live){
     setItems(values);
     // Do not silently dismiss unread messages if this device cannot decrypt them.
     if(values.every(item=>item.content!==null)){
      await api('/activity/seen','POST',{householdId,sourceKind:'direct',sourceId:active});
      window.dispatchEvent(new Event('carehold:activity-changed'));
     }
    }
   }catch(e){if(live&&!(e instanceof StaleSessionRequest))setError(errorText(e));}
  }
  setItems([]);void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},12000);
  return()=>{live=false;window.clearInterval(timer);};
 },[active,key,userId,refresh]);
 async function start(recipient:Contact){
  if(!recipient.publicKey)return;
  setBusy(true);setError('');
  try{
   const r=await api<{id:string}>('/messages/conversations','POST',{householdId,recipientId:recipient.id});
   await directory();setActive(r.id);
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(errorText(e));}
  finally{setBusy(false);}
 }
 return <section aria-label="Messages" className="messages-studio">
  <details className="messages-warning">
   <summary><strong>Fictional messages only.</strong> Do not send confidential family, medical, or therapeutic content. <span className="messages-warning-more">Why?</span></summary>
   <p>Security and minor/privacy reviews are still pending. Messages are encrypted in the browser, but recipient keys are not independently verified. New-account recovery and staged original-browser migration are experimental. Secure independent device revocation is unfinished.</p>
  </details>
  {!key&&<MessageRecoveryGate userId={userId} onReady={setKey} onError={setError}/>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
  {busy&&!key&&<p role="status">Preparing this device for fictional messaging…</p>}
  {handoff&&<p role="status" className="muted">You have an unsent note from Words. Choose one person, then review the draft before explicitly sending it.</p>}
  {key&&<div className="messages-layout">
   <aside className="messages-directory"><div className="messages-subhead"><h2>Conversations</h2><button className="quiet small" type="button" onClick={()=>void directory().catch(e=>setError(errorText(e)))}>Refresh</button></div>
    {threads.length===0&&<p className="muted">No conversations yet.</p>}
    {threads.map(t=><button className={active===t.id?'messages-contact selected':'messages-contact'} key={t.id} type="button" onClick={()=>setActive(t.id)}><strong>{t.participants.find(p=>p.id!==userId)?.name||'Conversation'}</strong><span>Direct conversation</span></button>)}
    <div className="messages-subhead"><h3>Start with someone</h3></div>
    {contacts.map(c=><button className="messages-contact" key={c.id} disabled={!c.publicKey||busy} type="button" onClick={()=>void start(c)}><strong>{c.name}</strong><span>{c.publicKey?'Start a message':'They must open Messages first'}</span></button>)}
    <p className="muted tiny">A medication grant or household role never exposes private messages.</p>
   </aside>
   <div className="messages-thread">
    {chosen?<><div className="messages-thread-header"><div><span className="mono kicker">ONLY EXPLICIT PARTICIPANTS</span><h2>{chosen.participants.find(p=>p.id!==userId)?.name||'Conversation'}</h2></div><button className="button outline small" type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh replies</button></div>
     <ol className="messages-history">{items.length===0&&<li className="muted">Nothing shared yet.</li>}{items.map(m=><li key={m.id} className={m.senderId===userId?'messages-entry mine':'messages-entry'}><small>{m.senderId===userId?'You':'Them'} · {new Date(m.createdAt).toLocaleString()}</small><p>{m.content?.text??'Unable to decrypt on this device.'}</p>{m.content?.kind==='prompt'&&<small>Guided prompt</small>}</li>)}</ol>
     <Composer key={chosen.id} thread={chosen} userId={userId} householdId={householdId} audience={audience} handoff={handoff} onHandoffHandled={onHandoffHandled} onSent={()=>setRefresh(n=>n+1)}/>
    </>:<div className="messages-intro"><h2>A little space to talk.</h2><p>Choose someone, then write an original message or share a gentle prompt. They can answer when they choose. No read receipts.</p></div>}
   </div>
  </div>}
 </section>;
}
function Composer({thread,userId,householdId,audience,handoff,onHandoffHandled,onSent}:{thread:Thread,userId:string,householdId:string,audience:Audience,handoff:MessageHandoff|null,onHandoffHandled:(id:number)=>void,onSent:()=>void}){
 const draft=useWordsDraftVault(userId,householdId+':direct:'+thread.id);
 const [kind,setKind]=useState<Content['kind']>('message'),[topic,setTopic]=useState('All topics'),[relationship,setRelationship]=useState<Relationship|'all'>('all');
 const [suggested,setSuggested]=useState<Prompt|null>(null),[seen,setSeen]=useState<string[]>([]);
 const [library,setLibrary]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const retry=useRef<{text:string,kind:Content['kind'],id:string,copies:Record<string,Envelope>,publicKeys:Record<string,PublicKey>}|null>(null);
 const available=promptsForAudience(audience).filter(p=>(topic==='All topics'||p.topic===topic)&&(relationship==='all'||p.relationship===relationship));
 const topics=[...new Set(promptsForAudience(audience).filter(p=>relationship==='all'||p.relationship===relationship).map(p=>p.topic))].sort();
 function rotate(){
  const result=rotatePrompt(available,seen,suggested?.id??null);
  setSuggested(result.prompt);setSeen(result.seen);
 }
 function choose(p:Prompt){draft.setText(p.text);setSuggested(p);setKind('prompt');setLibrary(false);retry.current=null;}
 async function send(e:FormEvent){
  e.preventDefault();if(!draft.ready||!draft.text.trim()||sending)return;
  setSending(true);setError('');setStatus('');
  try{
   if(thread.participants.length!==2||thread.participants.some(p=>!p.publicKey))
    throw new Error('Both participants must enroll a device key before sending.');
   const publicKeys=Object.fromEntries(thread.participants.map(p=>[p.id,p.publicKey])) as Record<string,PublicKey>;
   let attempt=retry.current;
   if(!attempt||attempt.text!==draft.text||attempt.kind!==kind||JSON.stringify(attempt.publicKeys)!==JSON.stringify(publicKeys)){
    const id=crypto.randomUUID(),copies:Record<string,Envelope>={};
    for(const p of thread.participants)copies[p.id]=await seal({kind,text:draft.text},p.publicKey!,thread.id,id,p.id);
    attempt={id,kind,text:draft.text,copies,publicKeys};retry.current=attempt;
   }
   await api(`/messages/threads/${encodeURIComponent(thread.id)}`,'POST',{id:attempt.id,copies:attempt.copies,publicKeys:attempt.publicKeys});
   retry.current=null;
   const cleared=await draft.discard();
   setKind('message');setStatus(cleared?'Sent to your chosen recipient.':'Sent, but the local draft could not be cleared. Please discard it manually.');
   onSent();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(errorText(e));}
  finally{setSending(false);}
 }
 return <div className="messages-composer">
  {handoff&&<div className="messages-prompts" role="note"><p><strong>Unsent note from Words.</strong> It will not be sent or shown to this person until you explicitly press Send. Applying it replaces any existing draft for this conversation.</p><div className="messages-actions"><button type="button" className="button dark small" disabled={!draft.ready||sending} onClick={()=>{draft.setText(handoff.text);setKind(handoff.kind);setSuggested(null);retry.current=null;onHandoffHandled(handoff.id);}}>{draft.text?'Replace this conversation draft':'Use note in this conversation'}</button><button type="button" className="button outline small" onClick={()=>onHandoffHandled(handoff.id)}>Dismiss note</button></div></div>}
  <div className="messages-subhead"><h3>Your words</h3><button className="quiet small" type="button" onClick={()=>setLibrary(v=>!v)}>{library?'Close prompts':'Guided prompts'}</button></div>
  {library&&<div className="messages-prompts"><label>Relationship<select value={relationship} onChange={e=>{setRelationship(e.target.value as Relationship|'all');setTopic('All topics');setSeen([]);setSuggested(null);}}><option value="all">All relationships</option>{relationshipOptions(audience).map(r=><option value={r} key={r}>{RELATIONSHIP_LABELS[r]}</option>)}</select></label><label>Category<select value={topic} onChange={e=>{setTopic(e.target.value);setSeen([]);setSuggested(null);}}><option>All topics</option>{topics.map(t=><option key={t}>{t}</option>)}</select></label>
   <button type="button" className="button outline small" onClick={rotate} disabled={!available.length}>Another prompt</button>
   {suggested&&<blockquote>{suggested.text}<button type="button" className="button dark small" onClick={()=>choose(suggested)}>Use and edit</button></blockquote>}
   <div className="messages-prompts-list">{available.map(p=><button type="button" key={p.id} onClick={()=>choose(p)}>{p.text}</button>)}</div>
  </div>}
  <form onSubmit={e=>void send(e)}><label htmlFor="message-draft">Private draft — visible only after you press Send</label>
   <textarea id="message-draft" rows={4} value={draft.text} maxLength={3000} disabled={!draft.ready||sending} onChange={e=>{draft.setText(e.target.value);retry.current=null;}} placeholder="Write something you’d like to share…"/>
   <div className="messages-meta"><span>{draft.enabled?draft.status==='saved'?(draft.syncEnabled&&draft.synced?'Encrypted draft synchronized privately':'Encrypted draft saved locally'):draft.status==='conflict'?(draft.remoteConflict?'Another device has a different draft':'Two tabs have edited this draft'):'Experimental encrypted autosave enabled':'Draft not saved until you opt in'}</span><span>{draft.text.length}/3000</span></div>
   {(error||draft.error)&&<p className="messages-error" role="alert">{error||draft.error}</p>}{status&&<p role="status">{status}</p>}
   <div className="messages-actions">
    {!draft.enabled&&draft.ready&&<button type="button" className="button outline small" onClick={()=>void draft.enable()}>Enable encrypted device autosave</button>}
    {draft.status==='conflict'&&<><button type="button" className="button outline small" onClick={()=>void (draft.remoteConflict?draft.loadRemote():draft.reloadStored())}>{draft.remoteConflict?'Use other device copy':'Load saved version'}</button><button type="button" className="button outline small" disabled={draft.remoteConflict&&!(draft.text.trim()||draft.title.trim()||draft.prompt)} onClick={()=>void draft.overwriteStored()}>Keep this device’s draft</button></>}
    {draft.status==='error'&&draft.syncEnabled&&<button type="button" className="button outline small" onClick={()=>void draft.retrySync()}>Retry encrypted sync</button>}
    <button type="button" className="quiet small" disabled={sending} onClick={()=>void draft.discard().then(()=>{retry.current=null;setKind('message');})}>Discard draft</button>
    <button className="button primary" disabled={!draft.ready||!draft.text.trim()||sending||draft.status==='conflict'}>{sending?'Sending…':error&&retry.current?'Retry send':'Send intentionally'}</button>
   </div>
  </form><p className="muted tiny">Only explicitly sent replies are shared. No recipient can see drafts, opens or response activity.</p>
 </div>;
}
