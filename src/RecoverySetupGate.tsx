import {useCallback,useEffect,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {samePublicKey,storedMessageIdentity,type Identity,type PublicKey} from './lib/message-crypto';
import {MessageRecoveryGate} from './MessageRecoveryGate';
import {LegacyMessageMigration} from './LegacyMessageMigration';

type State='checking'|'fresh'|'restore'|'legacy'|'blocked';
const info=(e:unknown)=>e instanceof Error?e.message:'Encrypted account setup could not be checked.';

/**
 * Required step 03 of onboarding. A new account cannot reach its household or
 * medication data before the recovery envelope is enrolled and its local
 * private key matches the registered identity. Never silently create keys
 * for a legacy account or overwrite a key from another browser.
 */
export function RecoverySetupGate({userId,onVerified,onSignOut}:{
 userId:string,onVerified:(id:string)=>void,onSignOut:()=>void
}){
 const [state,setState]=useState<State>('checking');
 const [error,setError]=useState('');
 const [checkNonce,setCheckNonce]=useState(0);
 const verify=useCallback(async()=>{
  const [registered,recovery,local]=await Promise.all([
   api<{publicKey:PublicKey|null}>('/messages/keys/me'),
   api<{configured:boolean}>('/messages/recovery'),
   storedMessageIdentity(userId)
  ]);
  if(recovery.configured&&registered.publicKey&&local&&
   samePublicKey(local.publicKey,registered.publicKey)&&local.journalKey){
   onVerified(userId);
   return 'ready' as const;
  }
  if(!registered.publicKey&&!recovery.configured&&!local)return 'fresh' as const;
  if(recovery.configured&&registered.publicKey)return 'restore' as const;
  if(registered.publicKey&&!recovery.configured&&local&&samePublicKey(registered.publicKey,local.publicKey))
   return 'legacy' as const;
  return 'blocked' as const;
 },[userId,onVerified]);
 useEffect(()=>{
  let active=true;setState('checking');setError('');
  void verify().then(status=>{if(active&&status!=='ready')setState(status);})
   .catch(e=>{if(active&&!(e instanceof StaleSessionRequest)){setState('blocked');setError(info(e));}});
  return()=>{active=false;};
 },[verify,checkNonce]);
 const onRecovered=useCallback((_identity:Identity)=>{
  setState('checking');setCheckNonce(n=>n+1);
 },[]);
 return <div className="onboard-shell recovery-onboarding">
  <header className="onboard-top"><span className="brand-text">carehold.</span>
   <button type="button" className="quiet small" onClick={onSignOut}>Sign out</button></header>
  <main className="onboard-main">
   <div className="eyebrow"><span className="signal"/> 03 / KEEP YOUR WRITING SAFE</div>
   <h1>Your recovery<br/><em>belongs to you.</em></h1>
   <p>Your passkey signs you in. Your separate recovery code is what restores encrypted messages, Words and synchronized private writing on another phone or browser.</p>
   {state==='checking'&&<p role="status">Checking secure recovery setup…</p>}
   {(state==='fresh'||state==='restore')&&<MessageRecoveryGate key={userId+':'+state} userId={userId} onReady={onRecovered}/>}
   {state==='legacy'&&<><p role="status">Your account has an older encryption key. It must be upgraded from its original browser without deleting previous messages.</p>
    <LegacyMessageMigration userId={userId} onComplete={()=>setCheckNonce(n=>n+1)}/>
    <button type="button" className="button outline small" onClick={()=>setCheckNonce(n=>n+1)}>Check recovery setup again</button></>}
   {state==='blocked'&&<div className="recovery-gate">
    <p role="alert">{error||'This account has an encryption identity this browser cannot safely replace. Return to the original browser, or restore with its saved recovery code. No data has been deleted.'}</p>
    <button type="button" className="button outline" onClick={()=>setCheckNonce(n=>n+1)}>Retry recovery check</button>
   </div>}
   <p className="fine-print">Save the one-time CH1- code outside this browser, then retrieve and re-enter it to finish setup. Never send it to another household member. Carehold cannot automatically save it to Apple Passwords. Use fictional information in this unaudited pilot.</p>
  </main>
 </div>;
}
