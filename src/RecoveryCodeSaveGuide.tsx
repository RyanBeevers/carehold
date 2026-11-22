import {useEffect,useState} from 'react';

export const RECOVERY_SEARCH_LABEL='Carehold — Encryption Recovery Key';

/**
 * A compact one-time rescue-code flow shared by fresh, legacy, and rotation
 * enrollments. Never store the CH1 secret in browser storage or send it to
 * the server; an explicit retrieval check remains mandatory until a reviewed
 * passkey-assisted or trusted-device recovery method is implemented.
 */
export function RecoveryCodeSaveGuide({code,saved,onSavedChange}:{
 code:string,saved:boolean,onSavedChange:(saved:boolean)=>void
}){
 const [verifying,setVerifying]=useState(false);
 const [enteredCode,setEnteredCode]=useState('');
 const [feedback,setFeedback]=useState('');
 useEffect(()=>{setVerifying(false);setEnteredCode('');setFeedback('');onSavedChange(false);},[code]);

 function beginVerification(){
  setVerifying(true);setEnteredCode('');setFeedback('');onSavedChange(false);
 }
 function checkSavedCode(){
  if(enteredCode.trim()!==code){
   setFeedback('That code does not match. Open your saved copy and paste the full code. No migration or enrollment has started.');
   onSavedChange(false);return;
  }
  setEnteredCode('');setFeedback('Backup verified. You can finish setup.');
  onSavedChange(true);
 }
 function showAgain(){
  setVerifying(false);setEnteredCode('');setFeedback('');onSavedChange(false);
 }
 async function copy(value:string,kind:string){
  setFeedback('');
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable.');
   await navigator.clipboard.writeText(value);
   setFeedback(kind+' copied. Save it in your secure password manager, not just your clipboard.');
  }catch{setFeedback('Copy is unavailable. Select the code and copy it manually.');}
 }
 return <div className="recovery-save-guide" aria-label="Save your Carehold recovery code securely">
  <p><strong>One-time backup.</strong> Save this code once in Apple Passwords or another trusted password manager. You will not need to enter it to send messages or use Carehold normally. It is separate from your passkey.</p>
  {!verifying&&<>
   <p><strong>Step 1 — Save your recovery code.</strong> Create a new saved item named <strong>{RECOVERY_SEARCH_LABEL}</strong> in your password manager. This is not a replacement for your existing login.</p>
   <code className="recovery-secret" aria-label="Your one-time recovery code">{code}</code>
   <div className="recovery-copy-actions">
    <button type="button" className="button primary" onClick={()=>void copy(code,'Recovery code')}>Copy recovery code</button>
   </div>
   <p className="muted tiny">In Apple Passwords, create a separate new password entry and paste this code there. Keep password syncing or another backup enabled so it remains accessible if this phone is lost. Copying does not save it automatically.</p>
   <details className="recovery-storage-alternatives">
    <summary>Other safe ways to store the code</summary>
    <p>You can use another trusted password manager, a backed-up Locked note, or a Secure offline copy on paper. Keep the exact <strong>CH1-</strong> prefix. Carehold cannot directly insert a recovery code into Apple Passwords from this website.</p>
    <p className="muted tiny">The code is secret: never send it to household members or put it in shared messages, email or public documents. Your clipboard may temporarily retain it.</p>
   </details>
  </>}
  {!verifying?<div className="recovery-verification">
   <p><strong>Step 2 — Verify your saved copy.</strong> Open the item you saved and confirm you can retrieve it. This is the only extra check before setup finishes.</p>
   <button type="button" className="button outline" onClick={beginVerification}>I've saved it — verify my copy</button>
  </div>:<div className="recovery-verification">
   {saved?<p role="status"><strong>Recovery backup verified.</strong> Finish setup to continue.</p>:<>
    <p>Paste the code from your saved Passwords entry or secure copy. Do not paste an unsaved clipboard copy.</p>
    <label>Saved recovery code
     <input type="password" value={enteredCode} onChange={e=>{setEnteredCode(e.target.value);setFeedback('');}} placeholder="CH1-…" autoComplete="off" autoCapitalize="none" spellCheck={false}/>
    </label>
    <button type="button" className="button primary" disabled={!enteredCode.trim()} onClick={checkSavedCode}>Verify code</button>
   </>}
   {!saved&&<button type="button" className="button outline small" onClick={showAgain}>Show code again</button>}
  </div>}
  {feedback&&<p className="muted tiny" role="status">{feedback}</p>}
 </div>;
}
