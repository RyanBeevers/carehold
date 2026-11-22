import {useEffect,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import {storedMessageIdentity} from './lib/message-crypto';
import {pairingNumber} from './lib/trusted-device-crypto';
import {localTrustedDevice,readTrustedRecoveryCode,renameLocalTrustedDevice} from './lib/trusted-device-vault';
import {enrollLocalTrustedDevice,getTrustedDeviceDirectory,approveTrustedDeviceRequest,enableTrustedApproval,revokeTrustedDevice,type DeviceDirectory,type DeviceRequest} from './lib/trusted-device-client';
import type {MessageRecoveryEnvelope} from './lib/message-recovery';

const message=(e:unknown)=>e instanceof Error?e.message:'Unable to update devices.';
export function TrustedDevices({userId,onReviewRotation}:{userId:string,onReviewRotation:()=>void}){
 const [data,setData]=useState<DeviceDirectory|null>(null),[localId,setLocalId]=useState(''),[deviceName,setDeviceName]=useState('');
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [recoveryCode,setRecoveryCode]=useState(''),[recoveryAvailable,setRecoveryAvailable]=useState(false);
 const [selected,setSelected]=useState<DeviceRequest|null>(null),[pairing,setPairing]=useState(''),[matched,setMatched]=useState(false);
 const [removing,setRemoving]=useState<string|null>(null);
 const [needsRotation,setNeedsRotation]=useState(false);
 async function load(enroll=false){
  const device=await localTrustedDevice(userId);
  const identity=await storedMessageIdentity(userId);
  if(!identity||!identity.journalKey)throw new Error('Restore your encrypted writing before managing trusted devices.');
  // A manual-CH1-restored browser can read its writing even if another
  // trusted device must approve enrollment. Never hide the device list.
  if(enroll)try{await enrollLocalTrustedDevice(userId,identity);}
   catch(e){setError(message(e));}
  const directory=await getTrustedDeviceDirectory();
  setData(directory);setLocalId(device.id);setDeviceName(v=>v||device.name);
  setRecoveryAvailable(Boolean(await readTrustedRecoveryCode(userId,directory.accountPublicKey)));
  return directory;
 }
 useEffect(()=>{
  let live=true;
  void load(true).then(()=>{if(live)setReady(true);}).catch(e=>{if(live){setError(message(e));setReady(true);}});
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible')void load().catch(()=>{/* A temporary outage must not discard displayed device state. */});
  },10000);
  return()=>{live=false;window.clearInterval(timer);};
 },[userId]);
 useEffect(()=>{
  let live=true;setMatched(false);setPairing('');
  if(selected)void pairingNumber(userId,selected.id,selected.publicKey)
   .then(code=>{if(live)setPairing(code);}).catch(e=>{if(live)setError(message(e));});
  return()=>{live=false;};
 },[userId,selected?.id,selected?.publicKey?.x,selected?.publicKey?.y]);
 async function rename(){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await renameLocalTrustedDevice(userId,deviceName);
   const identity=await storedMessageIdentity(userId);
   if(!identity)throw new Error('Your encrypted account key is unavailable.');
   await enrollLocalTrustedDevice(userId,identity);
   await load();
   setNotice('Device name updated.');
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(false);}
 }
 async function approve(){
  if(!selected||!matched||busy||!pairing)return;
  setBusy(true);setError('');setNotice('');
  try{
   const identity=await storedMessageIdentity(userId);
   const recovery=await api<{configured:boolean,envelope:MessageRecoveryEnvelope|null}>('/messages/recovery');
   if(!identity?.journalKey||!recovery.configured||!recovery.envelope)throw new Error('Your current device needs encryption recovery before approving another.');
   await approveTrustedDeviceRequest(userId,selected,identity,recovery.envelope);
   setSelected(null);setMatched(false);setNotice('New device approved. It can finish encrypted setup.');
   await load();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(false);}
 }
 async function saveApproval(){
  if(!recoveryCode.trim()||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const recovery=await api<{configured:boolean,envelope:MessageRecoveryEnvelope|null}>('/messages/recovery');
   if(!recovery.configured||!recovery.envelope)throw new Error('This account needs its initial encrypted backup first.');
   await enableTrustedApproval(userId,recoveryCode.trim(),recovery.envelope);
   setRecoveryCode('');setRecoveryAvailable(true);setNotice('This device can now help approve a new phone or browser.');
   await load();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(false);}
 }
 async function revoke(targetId:string){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const identity=await storedMessageIdentity(userId);
   if(!identity)throw new Error('Cannot verify this account encryption key.');
   await revokeTrustedDevice(userId,identity,targetId);
   setRemoving(null);setNeedsRotation(true);
   setNotice('Device removed from approvals. It can no longer authorize new devices, but it may still decrypt writing encrypted with your existing account key.');
   await load();
  }catch(e){if(!(e instanceof StaleSessionRequest))setError(message(e));}
  finally{setBusy(false);}
 }
 const active=data?.devices.filter(d=>!d.revokedAt&&d.keyCurrent)??[];
 const stale=data?.devices.filter(d=>d.revokedAt||!d.keyCurrent)??[];
 const thisDeviceTrusted=active.some(d=>d.id===localId);
 return <section className="trusted-device-settings" aria-label="Trusted devices and device approvals">
  <div className="setting-section"><div>
   <h2>Trusted devices</h2>
   <p>Approve a new phone from a device you already trust, without entering a recovery code on the new phone. Only your own account can manage its devices.</p>
   {!ready&&<p role="status">Checking your enrolled devices…</p>}
   {error&&<p className="messages-error" role="alert">{error}</p>}
   {notice&&<p className="words-status" role="status">{notice}</p>}
   {needsRotation&&<button type="button" className="button outline small" onClick={onReviewRotation}>Protect future writing — review key rotation</button>}
   {ready&&data&&!thisDeviceTrusted&&<p className="muted tiny" role="status">This browser can use your restored writing but isn't currently authorized to approve other devices. If your old devices are available, approve this one from them. If they're permanently lost, use Advanced Security to rotate your encryption identity before enrolling this browser.</p>}
  </div><button type="button" className="button outline small" onClick={()=>void load(true).catch(e=>setError(message(e)))} disabled={busy}>Refresh devices</button></div>
  {data&&<div className="trusted-device-body">
   <div className="trusted-device-group">
    <h3>Your devices</h3>
    {active.length===0?<p className="muted">No trusted devices enrolled yet. Refresh to enroll this browser.</p>:
     active.map(d=><div key={d.id} className="trusted-device-row">
      <div><strong>{d.name} {d.id===localId?'(this device)':''}</strong><p className="muted tiny">Added {new Date(d.createdAt).toLocaleDateString()}</p></div>
      {d.id!==localId&&<button type="button" className="button outline small" disabled={busy} onClick={()=>{setRemoving(d.id);setSelected(null);}}>Remove</button>}
     </div>)}
    {removing&&<div className="key-change-review" role="group" aria-label="Confirm device removal">
     <strong>Remove this device from trusted approvals?</strong>
     <p>This prevents it from approving new devices, but does not erase keys or writing already stored there. To prevent it decrypting future writing, rotate your account encryption key under Advanced Security afterward.</p>
     <div className="words-response-actions"><button type="button" className="button outline small" disabled={busy} onClick={()=>setRemoving(null)}>Keep device</button>
      <button type="button" className="button dark small" disabled={busy} onClick={()=>void revoke(removing)}>Remove device</button></div>
    </div>}
    <details className="recovery-storage-alternatives">
     <summary>Rename this device</summary>
     <form onSubmit={e=>{e.preventDefault();void rename();}} className="trusted-device-rename">
      <label>Device name<input maxLength={60} required value={deviceName} onChange={e=>setDeviceName(e.target.value)} placeholder="My iPhone"/></label>
      <button type="submit" className="button outline small" disabled={busy||!deviceName.trim()}>Save name</button>
     </form>
    </details>
    {stale.length>0&&<details className="recovery-storage-alternatives">
     <summary>Previously removed or outdated devices ({stale.length})</summary>
     {stale.map(d=><p className="muted tiny" key={d.id}>{d.name} — {d.revokedAt?'Removed':'Needs to re-enroll after an account-key change'}</p>)}
    </details>}
   </div>
   <div className="trusted-device-group">
    <h3>New device requests</h3>
    {!data.pendingRequests.length?<p className="muted tiny">No pending approvals. Start a new-device request from the phone or browser you're adding, then open this screen on a trusted device.</p>:
     data.pendingRequests.filter(r=>r.deviceId!==localId).map(request=><div key={request.id} className="trusted-device-row">
      <div><strong>{request.deviceName}</strong><p className="muted tiny">Waiting for approval</p></div>
      <button type="button" className="button outline small" disabled={busy||!recoveryAvailable||!thisDeviceTrusted} onClick={()=>{setSelected(request);setMatched(false);}}>Review</button>
     </div>)}
    {data.pendingRequests.length>0&&(!recoveryAvailable||!thisDeviceTrusted)&&<p className="muted tiny">Approving a device requires both verified recovery on this browser and active trusted enrollment. If needed, enable recovery below or complete account-key rotation after losing all other devices.</p>}
    {selected&&<div className="key-change-review" role="group" aria-label="Approve another device">
     <strong>Approve {selected.deviceName}?</strong>
     <p>Confirm the eight digits below match those shown on your new device. Do not approve a request you did not start.</p>
     <code className="trusted-pairing-number">{pairing||'Preparing…'}</code>
     <label className="recovery-confirm"><input type="checkbox" checked={matched} disabled={!pairing||busy} onChange={e=>setMatched(e.target.checked)}/>The numbers match on both of my devices.</label>
     <div className="words-response-actions">
      <button type="button" className="button outline small" onClick={()=>setSelected(null)} disabled={busy}>Not now</button>
      <button type="button" className="button dark small" disabled={!matched||!pairing||busy} onClick={()=>void approve()}>{busy?'Approving…':'Approve this device'}</button>
     </div>
    </div>}
   </div>
   {!recoveryAvailable&&<details className="recovery-storage-alternatives">
    <summary>Enable approvals on this device</summary>
    <p>Enter your saved CH1 recovery code once to allow this existing device to securely approve new devices. Carehold checks it locally and stores only a device-encrypted backup; it never uploads the code. If you lost it, keep your current browser intact and use the separate recovery-code replacement process.</p>
    <label>Saved recovery code<input type="password" autoComplete="off" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} placeholder="CH1-…" spellCheck={false}/></label>
    <button type="button" className="button outline" disabled={busy||!recoveryCode.trim()} onClick={()=>void saveApproval()}>{busy?'Verifying…':'Enable trusted-device approvals'}</button>
   </details>}
   {recoveryAvailable&&<p className="muted tiny">{thisDeviceTrusted?'This browser can approve a new device while signed in.':'Encrypted recovery backup is stored locally, but this browser cannot approve another until trusted enrollment is completed.'} Your private backup code stays encrypted on this device.</p>}
   <p className="muted tiny">Removing a device does not yet revoke its already-imported account encryption key. A key rotation is required to protect future content after a lost or compromised device; older copies cannot be recalled.</p>
  </div>}
 </section>;
}
