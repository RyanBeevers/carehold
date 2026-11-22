import {useEffect,useState} from 'react';
import type {KeyContact,KeyChange} from './lib/recipient-key-continuity';
import {fingerprintPublicKey,readableFingerprint} from './lib/recipient-key-continuity';

export function KeyChangeReview({changes,busy,onApprove,onDismiss}:{
 changes:KeyChange[],busy:boolean,onApprove:()=>void,onDismiss:()=>void
}){
 return <section className="key-change-review" role="alert" aria-label="Encryption key changed">
  <strong>A participant's encryption key changed. Sharing is paused.</strong>
  <p>Ask the person directly, outside Carehold, to open Settings → Encrypted data recovery and read their encryption verification code. Compare the full code below. Do not approve a change you can't explain.</p>
  <ul>{changes.map(item=><li key={item.id}><strong>{item.name}</strong>
   <span>New verification code</span><code>{readableFingerprint(item.current)}</code>
   <span className="muted tiny">Previously seen code: {readableFingerprint(item.previous)}</span>
  </li>)}</ul>
  <div className="words-response-actions">
   <button type="button" className="button outline small" disabled={busy} onClick={onDismiss}>Cancel and refresh</button>
   <button type="button" className="button dark small" disabled={busy} onClick={onApprove}>I compared and verified these codes</button>
  </div>
  <p className="muted tiny">Verification is an explicit trust decision. Carehold cannot confirm someone else's identity for you.</p>
 </section>;
}

export function KeyFingerprintDetails({contacts}:{contacts:readonly KeyContact[]}){
 const [codes,setCodes]=useState<{id:string,name:string,code:string}[]>([]);
 const [error,setError]=useState('');
 const version=JSON.stringify(contacts.map(p=>[p.id,p.name,p.publicKey]));
 useEffect(()=>{
  let live=true;setCodes([]);setError('');
  void Promise.all(contacts.filter(p=>p.publicKey).map(async person=>({
   id:person.id,name:person.name,code:readableFingerprint(await fingerprintPublicKey(person.publicKey!))
  }))).then(items=>{if(live)setCodes(items);})
   .catch(()=>{if(live)setError('Unable to calculate verification codes on this device.');});
  return()=>{live=false;};
 },[version]);
 if(!contacts.length)return null;
 return <details className="recipient-key-details">
  <summary>Compare recipient encryption codes</summary>
  <p className="muted tiny">For extra confidence, compare these codes with people face-to-face before your first share. Carehold remembers the first code seen on this browser and blocks later changes until you approve them.</p>
  {codes.map(item=><div key={item.id} className="recipient-key-line"><strong>{item.name}</strong><code>{item.code}</code></div>)}
  {error&&<p role="alert">{error}</p>}
 </details>;
}
