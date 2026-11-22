import {useState} from 'react';
import type {KeyChange} from './lib/recipient-key-continuity';
import {readableFingerprint} from './lib/recipient-key-continuity';

/** Exceptional key changes only: routine sharing never asks for codes. */
export function KeyChangeReview({changes,busy,onApprove,onDismiss}:{
 changes:KeyChange[],busy:boolean,onApprove:()=>void,onDismiss:()=>void
}){
 const people=changes.map(c=>c.name).join(', ');
 const [reviewing,setReviewing]=useState(false);
 return <section className="key-change-review" role="alert" aria-label="Encryption details changed">
  <strong>Check a security change before sharing.</strong>
  <p>{people} {changes.length===1?'has':'have'} updated encryption details. This sometimes happens when someone restores their account or replaces a device. Carehold paused sharing rather than automatically trusting the new information.</p>
  <details className="key-change-instructions" onToggle={event=>setReviewing(event.currentTarget.open)}>
   <summary>How to verify this change</summary>
   <p>Ask {changes.length===1?'this person':'these people'} directly, outside Carehold, to open Settings → Encrypted writing → Recovery & advanced security → My encryption verification code. Compare their complete code with the new code below. If you cannot confirm it, choose Not now.</p>
   <ul>{changes.map(item=><li key={item.id}><strong>{item.name}</strong>
    <span>New code</span><code>{readableFingerprint(item.current)}</code>
    <span className="muted tiny">Previously seen: {readableFingerprint(item.previous)}</span>
   </li>)}</ul>
  </details>
  <div className="words-response-actions">
   <button type="button" className="button outline small" disabled={busy} onClick={onDismiss}>Not now</button>
   <button type="button" className="button dark small" disabled={busy||!reviewing} onClick={onApprove}>I've verified the change</button>
  </div>
  <p className="muted tiny">A changed code is unusual. Verification is a decision you make; Carehold cannot independently confirm this person's identity.</p>
 </section>;
}
