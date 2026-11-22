import {useEffect,useRef,useState} from 'react';
import {api,StaleSessionRequest} from './lib/api';
import type {Identity} from './lib/message-crypto';
import {pairingNumber} from './lib/trusted-device-crypto';
import {pendingTransfer} from './lib/trusted-device-vault';
import {startNewDeviceRequest,finishApprovedDeviceRequest,cancelDeviceRequest,type DeviceRequest} from './lib/trusted-device-client';

const errorText=(e:unknown)=>e instanceof Error?e.message:'Device approval was interrupted.';
export function NewDeviceApproval({userId,onReady}:{userId:string,onReady:(identity:Identity)=>void}){
 const [requestId,setRequestId]=useState<string|null>(null),[request,setRequest]=useState<DeviceRequest|null>(null);
 const [number,setNumber]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const resolving=useRef(false),done=useRef(false),onReadyRef=useRef(onReady);
 useEffect(()=>{onReadyRef.current=onReady;},[onReady]);
 useEffect(()=>{
  let live=true;
  void pendingTransfer(userId).then(p=>{if(live&&p)setRequestId(p.id);})
   .catch(e=>{if(live)setError(errorText(e));});
  return()=>{live=false;};
 },[userId]);
 useEffect(()=>{
  let live=true;
  if(!requestId)return;
  const check=async()=>{
   if(resolving.current||done.current)return;
   try{
    const next=await api<DeviceRequest>('/trusted-devices/requests/'+encodeURIComponent(requestId));
    if(!live)return;
    setRequest(next);
    const pending=await pendingTransfer(userId);
    if(!pending||pending.id!==requestId)throw new Error('This device approval belongs to another browser.');
    const code=await pairingNumber(userId,requestId,pending.publicKey);
    if(!live)return;
    setNumber(code);
    if(next.state==='approved'){
     resolving.current=true;setBusy(true);setError('');
     try{
      const identity=await finishApprovedDeviceRequest(userId,requestId);
      if(live){done.current=true;onReadyRef.current(identity);}
     }catch(e){if(live&&!(e instanceof StaleSessionRequest))setError(errorText(e));}
     finally{resolving.current=false;if(live)setBusy(false);}
    }
   }catch(e){if(live&&!(e instanceof StaleSessionRequest))setError(errorText(e));}
  };
  void check();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void check();},4500);
  return()=>{live=false;window.clearInterval(timer);};
 },[userId,requestId]);
 async function begin(){
  if(busy)return;
  setBusy(true);setError('');setRequest(null);setNumber('');
  try{const id=await startNewDeviceRequest(userId);done.current=false;setRequestId(id);}
  catch(e){if(!(e instanceof StaleSessionRequest))setError(errorText(e));}
  finally{setBusy(false);}
 }
 async function cancel(){
  if(!requestId||busy)return;
  setBusy(true);setError('');
  try{await cancelDeviceRequest(userId,requestId);setRequestId(null);setRequest(null);setNumber('');done.current=false;}
  catch(e){if(!(e instanceof StaleSessionRequest))setError(errorText(e));}
  finally{setBusy(false);}
 }
 const active=requestId&&request?.state!=='expired'&&request?.state!=='cancelled'&&request?.state!=='consumed';
 return <div className="new-device-approval" aria-label="Approve this phone with another device">
  <h4>Approve from another device</h4>
  <p>If you still have Carehold on a trusted phone or browser, you can approve this one without typing your backup code.</p>
  {!active?<button type="button" className="button primary" disabled={busy} onClick={()=>void begin()}>{busy?'Preparing…':'Request approval'}</button>:
   <div className="trusted-new-device-pairing">
    <p role="status">{busy?'Restoring your encrypted writing…':request?.state==='approved'?'Approved. Restoring your writing…':'On your existing device, open Settings → Trusted devices and approve the request.'}</p>
    <strong>Number to match on both devices</strong>
    <code className="trusted-pairing-number">{number||'Preparing…'}</code>
    <p className="muted tiny">The request expires after 15 minutes. Only approve if both devices display this same number. Your existing device needs its encrypted backup enabled to approve requests.</p>
    <button type="button" className="button outline small" disabled={busy} onClick={()=>void cancel()}>Cancel request</button>
   </div>}
  {error&&<p role="alert" className="messages-error">{error}</p>}
  <p className="muted tiny">No trusted device available? You can always recover with your saved CH1 backup code below. Neither option resets or deletes old encrypted writing.</p>
 </div>;
}
