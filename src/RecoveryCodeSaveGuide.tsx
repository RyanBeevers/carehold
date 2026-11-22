import {useEffect,useState} from 'react';

export const RECOVERY_SEARCH_LABEL='Carehold — Encryption Recovery Key';
type Storage='apple'|'manager'|'note'|'paper';
const OPTIONS:{id:Storage;name:string}[]=[
 {id:'apple',name:'Apple Passwords'},
 {id:'manager',name:'Other password manager'},
 {id:'note',name:'Locked note'},
 {id:'paper',name:'Offline copy'}
];

/** The recovery secret is displayed only for this session, never sent to a
 * credential manager, analytics, localStorage or our API. Browser pages cannot
 * reliably force iOS Passwords to create a credential. Copy is opt-in. */
export function RecoveryCodeSaveGuide({code,saved,onSavedChange}:{
 code:string,saved:boolean,onSavedChange:(saved:boolean)=>void
}){
 const [method,setMethod]=useState<Storage>('apple');
 const [feedback,setFeedback]=useState('');
 const [verifying,setVerifying]=useState(false);
 const [enteredCode,setEnteredCode]=useState('');
 // Never inherit verification from a different generated code.
 useEffect(()=>{setVerifying(false);setEnteredCode('');onSavedChange(false);},[code]);
 function beginVerification(){
  setVerifying(true);setEnteredCode('');setFeedback('');
  onSavedChange(false);
 }
 function checkSavedCode(){
  if(enteredCode.trim()!==code){
   setFeedback('That code does not match. Open the saved entry again and copy the exact CH1- code. No migration has started.');
   onSavedChange(false);return;
  }
  setEnteredCode('');
  setFeedback('The entered code matches. Finish enrollment only if you retrieved it from a separate secure place.');
  onSavedChange(true);
 }
 function showAgain(){
  setVerifying(false);setEnteredCode('');setFeedback('');
  onSavedChange(false);
 }
 async function copy(value:string,kind:string){
  setFeedback('');
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard not available.');
   await navigator.clipboard.writeText(value);
   setFeedback(kind+' copied. Paste it into your chosen secure place, then confirm you saved it.');
  }catch{setFeedback('Copy is unavailable here. You can select and copy the code shown above manually.');}
 }
 return <div className="recovery-save-guide" aria-label="Save your Carehold recovery code securely">
  <p><strong>Step 1 — Save your recovery code somewhere outside this browser.</strong> It is separate from your passkey. The code is shown only during setup; it cannot be displayed again after enrollment and Carehold does not automatically save it to Apple Passwords.</p>
  {!verifying&&<><code className="recovery-secret" aria-label="Your one-time recovery code">{code}</code>
  <div className="recovery-copy-actions">
   <button type="button" className="button outline small" onClick={()=>void copy(code,'Recovery code')}>Copy recovery code</button>
   <button type="button" className="button outline small" onClick={()=>void copy(RECOVERY_SEARCH_LABEL,'Searchable title')}>Copy searchable title</button>
  </div></>}
  {feedback&&<p className="muted tiny" role="status">{feedback}</p>}
  <p className="recovery-search-term"><strong>Find it later:</strong> Search for <span>{RECOVERY_SEARCH_LABEL}</span>. Add your account email or another identifier if you save multiple Carehold accounts.</p>
  <div className="recovery-method-options" role="group" aria-label="Choose where to save your recovery code">
   {OPTIONS.map(option=><button type="button" key={option.id} className={'recovery-method'+(method===option.id?' selected':'')} aria-pressed={method===option.id} onClick={()=>{setMethod(option.id);showAgain();}}>{option.name}</button>)}
  </div>
  {method==='apple'&&<div className="recovery-save-steps">
   <strong>iPhone / iPad — Apple Passwords</strong>
   <ol><li>Copy the recovery code above.</li><li>Open the <strong>Passwords</strong> app, tap <strong>+</strong> and create a <strong>new password</strong> entry (not a replacement for your existing login).</li><li>Use your Carehold website address, add an identifying username such as <strong>Carehold Recovery Key</strong>, and paste the code into the password field. In Notes, use the searchable title shown above.</li><li>Save, then search Passwords for <strong>Carehold</strong> and verify you can find the entry.</li><li>Make sure <strong>iCloud Passwords &amp; Keychain</strong> synchronization is enabled, or keep another secure copy that you could reach after losing this phone.</li></ol>
   <p className="muted tiny">Carehold cannot directly insert a recovery code into Apple Passwords from this website. The copy button does not save anything automatically. <a href="https://support.apple.com/en-gb/guide/iphone/iph4ebb320ea/26/ios/26" target="_blank" rel="noopener noreferrer">Apple's Passwords instructions</a></p>
  </div>}
  {method==='manager'&&<div className="recovery-save-steps">
   <strong>Other password managers (including Android)</strong>
   <ol><li>Copy the code above.</li><li>In your trusted password manager, add a separate secure note or credential named <strong>{RECOVERY_SEARCH_LABEL}</strong>.</li><li>Paste the recovery code, save it, then search for <strong>Carehold</strong> to make sure it is retrievable.</li></ol>
  </div>}
  {method==='note'&&<div className="recovery-save-steps">
   <strong>Locked note</strong>
   <ol><li>Copy the code.</li><li>Create a new note titled <strong>{RECOVERY_SEARCH_LABEL}</strong>, paste the code and <strong>lock the note</strong>.</li><li>Confirm the locked note is backed up or available on another device. An ordinary unlocked note is less secure.</li></ol>
  </div>}
  {method==='paper'&&<div className="recovery-save-steps">
   <strong>Secure offline copy</strong>
   <ol><li>Write down the code exactly, including the <strong>CH1-</strong> prefix.</li><li>Label it <strong>{RECOVERY_SEARCH_LABEL}</strong> and store it in a secure location separate from this phone.</li><li>Check the characters carefully; a missing character prevents recovery.</li></ol>
  </div>}
  <p className="muted tiny">The code is a secret: don't send it in chat, email it to yourself, share it with household members or save it in a publicly accessible document. Copying may leave it on your device clipboard.</p>
  {!verifying?<div className="recovery-verification">
   <p><strong>Step 2 — Verify that you can retrieve it.</strong> Save the code in your chosen location, then click below. The code will be hidden while you check the saved copy. You must do this before any migration begins.</p>
   <button type="button" className="button primary" onClick={beginVerification}>I've saved it — verify my copy</button>
  </div>:<div className="recovery-verification">
   {saved?<p role="status"><strong>Recovery code verified for this setup.</strong> Finish enrollment now and keep your external copy.</p>:<>
    <p><strong>Step 2 — Verify your saved copy.</strong> Return to your password manager, locked note or paper copy, retrieve the code from there, and enter it below. Do not simply paste from Carehold's copy button or an unsaved clipboard.</p>
    <label>Code retrieved from secure storage
     <input type="password" value={enteredCode} onChange={e=>{setEnteredCode(e.target.value);setFeedback('');}} placeholder="CH1-…" autoComplete="off" autoCapitalize="none" spellCheck={false}/>
    </label>
    <button type="button" className="button primary" disabled={!enteredCode.trim()} onClick={checkSavedCode}>Verify saved recovery code</button>
   </>}
   <button type="button" className="button outline small" onClick={showAgain}>Show code again / choose another storage method</button>
  </div>}
 </div>;
}
