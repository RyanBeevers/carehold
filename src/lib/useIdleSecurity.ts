import {useEffect,useRef} from 'react';
import {INACTIVITY_LOCK_MS,BACKGROUND_LOCK_MS,HEARTBEAT_ACTIVE_WINDOW_MS,HEARTBEAT_INTERVAL_MS,lockReason} from '../../shared/session-policy';

/**
 * UI lock that masks the whole screen on inactivity or when returning after
 * a minute in the background. A short Better Auth session also enforces expiry
 * on the server. The background timer is checked on resume because iOS may
 * suspend JavaScript intervals while the app is not visible.
 */
export function useIdleSecurity(enabled:boolean,onLock:()=>void,onHeartbeat:()=>void){
 const lockRef=useRef(onLock),heartbeatRef=useRef(onHeartbeat);
 lockRef.current=onLock;heartbeatRef.current=onHeartbeat;
 useEffect(()=>{
   if(!enabled)return;
   let lastInteraction=Date.now(),lastHeartbeat=Date.now();
   let hiddenAt:number|null=document.visibilityState==='hidden'?Date.now():null;
   let wasLocked=false;
   const attemptLock=()=>{
     if(wasLocked)return true;
     if(lockReason(Date.now(),lastInteraction,hiddenAt)!==null){
       wasLocked=true;lockRef.current();return true;
     }
     return false;
   };
   const noteActivity=()=>{
     if(document.visibilityState!=='visible'||attemptLock())return;
     lastInteraction=Date.now();
   };
   const onVisibility=()=>{
     if(document.visibilityState==='hidden'){hiddenAt=Date.now();return;}
     // Compare BEFORE clearing hiddenAt, even if timers were frozen by the OS.
     if(attemptLock())return;
     hiddenAt=null;
   };
   const heartbeat=()=>{
     if(document.visibilityState!=='visible'||attemptLock())return;
     const now=Date.now();
     if(now-lastInteraction<HEARTBEAT_ACTIVE_WINDOW_MS&&now-lastHeartbeat>=HEARTBEAT_INTERVAL_MS){
       lastHeartbeat=now;
       heartbeatRef.current();
     }
   };
   // Input and composition events cover mobile keyboards, dictation, autofill and
   // accessibility typing that may not emit keydown. Never treat the mere
   // passage of time or a background tab as authenticated activity.
   const activityEvents=['pointerdown','keydown','touchstart','wheel','input','change','compositionupdate'];
   for(const name of activityEvents)window.addEventListener(name,noteActivity,{passive:true});
   document.addEventListener('visibilitychange',onVisibility);
   window.addEventListener('pageshow',onVisibility);
   window.addEventListener('focus',onVisibility);
   const interval=window.setInterval(heartbeat,10_000);
   return()=>{
     window.clearInterval(interval);
     for(const name of activityEvents)window.removeEventListener(name,noteActivity);
     document.removeEventListener('visibilitychange',onVisibility);
     window.removeEventListener('pageshow',onVisibility);
     window.removeEventListener('focus',onVisibility);
   };
 },[enabled]);
}
