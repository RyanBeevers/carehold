import {useCallback,useEffect,useRef,useState,type FormEvent,type MouseEvent} from 'react';
import {useIdleSecurity} from './lib/useIdleSecurity';
import {ArrowUpRight,Bell,BellOff,BookOpen,MessageCircle,CalendarDays,Check,ChevronLeft,ChevronRight,Copy,HeartHandshake,KeyRound,Menu,Minus,Plus,Settings2,ShieldCheck,Sun,Moon,Monitor,LockKeyhole,Link2,Archive,ArchiveRestore,Users,Wind,X} from 'lucide-react';
import {api,invalidatePendingApiResponses,StaleSessionRequest,type Household,type Person,type LinkedSelfProfile,type Medication,type Entry,type DoseEvent} from './lib/api';
import {authClient} from './lib/auth-client';
import {WordsHub} from './WordsHub';
import {RecoveryReadiness} from './RecoveryReadiness';
import {RecoverySetupGate} from './RecoverySetupGate';
import {HouseholdPicker} from './HouseholdPicker';
import {BrandLogo} from './BrandLogo';
import {BrandStory} from './BrandStory';
import {MedicationCatalogPicker} from './MedicationCatalogPicker';
import {MessagesStudio,type MessageHandoff} from './MessagesStudio';
import type {Audience} from '../shared/audience';
import {EMAIL_INPUT_PATTERN,normalizeEmailInput,isValidEmailInput} from '../shared/email';
import {localDate} from '../shared/schedule';
import {pageFromPath,pagePath,shouldHandlePageClick,restorePage,rememberPage,LAST_PAGE_KEY,type AppPage} from './lib/routes';

type Page=AppPage;
type Mode='system'|'light'|'dark';
const PUSH_UNAVAILABLE_MESSAGE='Reminders are not available yet because Web Push is not configured for this Carehold environment. Please contact the app administrator.';
const NAV_ITEMS=[['today','Today',CalendarDays],['people','People',Users],['words','Words',BookOpen],['messages','Messages',MessageCircle],['circle','Care circle',HeartHandshake],['settings','Settings',Settings2]] as const;
const todayOnDevice=()=>localDate(new Date(),Intl.DateTimeFormat().resolvedOptions().timeZone||'America/New_York');
const stamp=(date:Date)=>date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const statuses=['given','skipped','refused','uncertain','missed'] as const;
const statusNames:{[k:string]:string}={given:'Taken / given',skipped:'Not administered / skipped',refused:'Refused',uncertain:'Not sure',missed:'Confirmed missed'};
const doseLabel=(e:Pick<DoseEvent,'event_type'|'correction_kind'>)=>e.correction_kind==='not_administered'?'Not administered · earlier record corrected':statusNames[e.event_type];
const weekdayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const preference=():Mode=>{try{const v=localStorage.getItem('carehold-theme');return v==='light'||v==='dark'?v:'system';}catch{return 'system';}};
const shortDate=(v:string)=>new Date(v+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
const datetimeField=(value:Date)=>new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
const changeDay=(v:string,n:number)=>new Date(Date.parse(v+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const initials=(s:string)=>s.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
function Mark({size=36}:{size?:number}){return <img src="/branding/carehold/marks/carehold-symbol-transparent-512.png" width={size} height={size} alt="" className="mark"/>;}
const APPEARANCE_OPTIONS=[
 {mode:'system',label:'System',Icon:Monitor},
 {mode:'light',label:'Light',Icon:Sun},
 {mode:'dark',label:'Dark',Icon:Moon},
] as const;
function AppearanceSwitch({theme,setTheme,compact=false}:{theme:Mode,setTheme:(v:Mode)=>void,compact?:boolean}){
 return <div className={`appearance-switch${compact?' is-compact':''}`} role="group" aria-label="Appearance">
  {APPEARANCE_OPTIONS.map(({mode,label,Icon})=><button key={mode} type="button" className={`appearance-option${theme===mode?' is-active':''}`} aria-label={`${label} theme`} aria-pressed={theme===mode} title={`${label} theme`} onClick={()=>setTheme(mode)}><Icon aria-hidden="true" size={16} strokeWidth={1.9}/><span className="appearance-name">{label}</span></button>)}
 </div>;
}
const AUDIENCE_LABELS:Record<Audience,string>={parent:'Adult / parent',child:'Child',teen:'Teen'};
function AudienceField({value,onChange}:{value:Audience,onChange:(next:Audience)=>void}){
 return <label>I'm joining as<select value={value} onChange={e=>onChange(e.target.value as Audience)}><option value="parent">Adult / parent</option><option value="child">Child</option><option value="teen">Teen</option></select></label>;
}
function ThemeIconToggle({theme,setTheme}:{theme:Mode,setTheme:(v:Mode)=>void}){
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{
  const query=window.matchMedia('(prefers-color-scheme: dark)');
  const changed=()=>setSystemDark(query.matches);
  query.addEventListener('change',changed);
  return()=>query.removeEventListener('change',changed);
 },[]);
 const dark=theme==='dark'||(theme==='system'&&systemDark);
 const target=dark?'light':'dark';
 return <button type="button" className="theme-icon-toggle" aria-label={'Switch to '+target+' mode'}
  title={'Switch to '+target+' mode'} onClick={()=>setTheme(target)}>
  {dark?<Sun size={19} aria-hidden="true"/>:<Moon size={19} aria-hidden="true"/>}
 </button>;
}
function Header({theme,setTheme,user,logout,lockNow}:{theme:Mode,setTheme:(v:Mode)=>void,user:{name:string},logout:()=>void,lockNow:()=>void}){
 return <header className="masthead"><div className="masthead-inner"><div className="brand"><BrandLogo className="masthead-logo"/></div><span className="masthead-note">THE LITTLE THINGS WE HOLD TOGETHER</span><div className="masthead-actions"><ThemeIconToggle theme={theme} setTheme={setTheme}/><button className="icon-control" type="button" aria-label="Lock Carehold now" title="Lock now" onClick={lockNow}><LockKeyhole size={18}/></button><div className="user-tag" title={user.name}>{initials(user.name)}</div><button className="quiet small" onClick={logout}>Sign out</button></div></div></header>;
}
function PageTitle({eyebrow,title,subtitle}:{eyebrow:string,title:string,subtitle:string}) {return <div className="page-heading"><div className="eyebrow"><span className="signal"/>{eyebrow}</div><h1>{title}<span className="title-point">.</span></h1><p>{subtitle}</p></div>;}
function IconLabel({kind}:{kind:Person['kind']}) {return <span className={`person-stamp ${kind}`} aria-hidden="true">{kind==='pet'?'✳':kind==='child'?'✺':'●'}</span>;}
function Banner({kind,text,close}:{kind:'error'|'success',text:string,close:()=>void}){return <div className={`banner ${kind}`} role={kind==='error'?'alert':'status'}><span>{text}</span><button aria-label="Dismiss notification" onClick={close}><X size={16}/></button></div>;}
const blankMed=()=>({name:'',form:'',dose:'',instructions:'',cadence:'daily',weekdays:[1,2,3,4,5],intervalDays:'2',startDate:todayOnDevice(),endDate:'',anchorDate:todayOnDevice(),times:['08:00'],clinician:'',refillNote:'',catalogSource:null as 'rxterms'|null,catalogIdentifier:null as string|null,normalizedName:null as string|null,brandName:null as string|null,productStrength:null as string|null,dosageForm:null as string|null});

type Pending={entry?:Entry,event?:DoseEvent,medication?:Medication,profile?:Person};
type LockedCorrectionDraft={
 userId:string,householdId:string,event:DoseEvent,reason:string,
 status:(typeof statuses)[number]|null,kind:'not_administered'|null,
 mode:'correction'|'later',actualAt:string,idempotencyKey:string
};
type CareCapability='view_schedule'|'record_dose'|'view_history'|'manage_medication';
type CareScope='limited'|'full';
type Member={user_id:string,name:string,email?:string,role:'owner'|'caregiver'|'member',classification?:'adult'|'teen'|'child'|'unverified',access_scope?:CareScope,grants?:{profileId:string,capabilities:CareCapability[]}[]};
const DEFAULT_CARE_CAPABILITIES:CareCapability[]=['view_schedule','record_dose','view_history'];
const CARE_PERMISSION_OPTIONS:[CareCapability,string][]=[
 ['record_dose','Record administrations'],['view_history','View medication history'],['manage_medication','Manage medication plans']
];
export default function App(){
 const [theme,setTheme]=useState<Mode>(preference);
 const emailInputRef=useRef<HTMLInputElement|null>(null);
 const [user,setUser]=useState<{id:string,email:string,name:string}|null>(null);
 const [hasPasskey,setHasPasskey]=useState(false);
 const [recoveryCompletedUser,setRecoveryCompletedUser]=useState<string|null>(null);
 const [locked,setLocked]=useState(false),[lockError,setLockError]=useState('');
 const lockingRef=useRef(false),authEpochRef=useRef(0);
 const logoutInFlight=useRef<Promise<unknown>|null>(null);
 // Temporary same-tab memory only, never localStorage or an API payload.
 // Cleared on explicit sign-out or switching accounts. Masked behind passkey lock.
 const correctionAfterLock=useRef<LockedCorrectionDraft|null>(null);
 const [toast,setToast]=useState<{id:number,kind:'success'|'error'|'info',message:string}|null>(null);
 const toastSequence=useRef(0);
 const [loading,setLoading]=useState(true);
 const [households,setHouseholds]=useState<Household[]>([]),[hid,setHid]=useState('');
 const [profiles,setProfiles]=useState<Person[]>([]),[entries,setEntries]=useState<Entry[]>([]);
 const [myProfile,setMyProfile]=useState<LinkedSelfProfile|null>(null);
 const myProfileRequest=useRef(0);
 const [planFocusTarget,setPlanFocusTarget]=useState<string|null>(null);
 const [members,setMembers]=useState<Member[]>([]),[memberToRemove,setMemberToRemove]=useState<Member|null>(null);
 const [page,setPage]=useState<Page>(()=>restorePage(window.location.pathname,()=>window.localStorage.getItem(LAST_PAGE_KEY))),[selected,setSelected]=useState(''),[meds,setMeds]=useState<Medication[]>([]),[history,setHistory]=useState<DoseEvent[]>([]);
 // Public navigation remains in the URL through reloads, sign-out, the passkey
 // gate and idle locks. No care records or private text are encoded in paths.
 useEffect(()=>{
   // On an installed PWA icon launch, "/" can be a new navigation; recover
   // only the harmless last page label. Explicit deep links always win.
   const canonical=pagePath(page);
   if(window.location.pathname!==canonical)window.history.replaceState(window.history.state,'',canonical);
   rememberPage(page,(key,value)=>window.localStorage.setItem(key,value));
   const onPopState=()=>{
     const next=pageFromPath(window.location.pathname);
     setPage(next);
     rememberPage(next,(key,value)=>window.localStorage.setItem(key,value));
   };
   window.addEventListener('popstate',onPopState);
   return()=>window.removeEventListener('popstate',onPopState);
 },[]);
 function navigate(next:Page){
   const path=pagePath(next);
   if(window.location.pathname!==path)window.history.pushState(null,'',path);
   setPage(next);
   rememberPage(next,(key,value)=>window.localStorage.setItem(key,value));
 }
 function followPageLink(event:MouseEvent<HTMLAnchorElement>,next:Page){
   if(!shouldHandlePageClick(event))return;
   event.preventDefault();
   navigate(next);
 }
 const [messageHandoff,setMessageHandoff]=useState<(MessageHandoff&{userId:string,householdId:string})|null>(null);
 const handoffSequence=useRef(0);
  useEffect(()=>{if(page!=='messages')setMessageHandoff(null);},[page]);
 useEffect(()=>{setMessageHandoff(null);},[hid]);
 const [unread,setUnread]=useState({words:0,direct:0});
 useEffect(()=>{
   if(!user||!hid||!hasPasskey||recoveryCompletedUser!==user.id||locked){setUnread({words:0,direct:0});return;}
   let live=true,lastInput=Date.now();
   const refresh=async()=>{
     try{
       const result=await api<{counts:{words:number,direct:number}}>(`/activity?householdId=${encodeURIComponent(hid)}`);
       if(live)setUnread({words:result.counts.words||0,direct:result.counts.direct||0});
     }catch(e){if(live&&!(e instanceof StaleSessionRequest))setUnread({words:0,direct:0});}
   };
   const input=()=>{lastInput=Date.now();};
   const updated=()=>{if(live&&document.visibilityState==='visible')void refresh();};
   void refresh();
   document.addEventListener('pointerdown',input);document.addEventListener('keydown',input);
   window.addEventListener('carehold:activity-changed',updated);
   document.addEventListener('visibilitychange',updated);
   const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastInput<90_000)void refresh();},15000);
   return()=>{live=false;window.clearInterval(timer);document.removeEventListener('pointerdown',input);document.removeEventListener('keydown',input);window.removeEventListener('carehold:activity-changed',updated);document.removeEventListener('visibilitychange',updated);};
 },[user?.id,hid,hasPasskey,recoveryCompletedUser,locked]);
 const pageUnread=(id:Page)=>id==='words'?unread.words:id==='messages'?unread.direct:0;

 const [date,setDate]=useState(''),[error,setError]=useState('');
 const [modal,setModal]=useState<'profile'|'med'|'dose'|'correct'|'archive-profile'|'archive-med'|'invite'|'remove'|'link'|'access'|null>(null),[pending,setPending]=useState<Pending>({});
 const [saving,setSaving]=useState(false),[accessCode,setAccessCode]=useState(''),[inviteInput,setInviteInput]=useState('');
 const [inviteCreated,setInviteCreated]=useState('');
 const [audience,setAudience]=useState<Audience|null>(null),[signupAudience,setSignupAudience]=useState<Audience>('parent');
 const [pendingInvitation,setPendingInvitation]=useState(false),[invitationBusy,setInvitationBusy]=useState(false);
 const triedAutoInvite=useRef(new Set<string>());
 const [copyFeedback,setCopyFeedback]=useState<{key:string,success:boolean,message:string}|null>(null);
 const [pushEnabled,setPushEnabled]=useState(false),[installEvent,setInstallEvent]=useState<any>(null);
 const [pushConfig,setPushConfig]=useState<{configured:boolean,publicKey:string|null}|null>(null);
 const [pushFeedback,setPushFeedback]=useState<{kind:'error'|'success'|'info',text:string}|null>(null);
 const [pushSubscriptionCount,setPushSubscriptionCount]=useState(0);
 const [pushTrace,setPushTrace]=useState<{id:string,accepted:boolean,received:boolean,displayRequested:boolean,displayError:boolean}|null>(null);
 const [localNotificationFeedback,setLocalNotificationFeedback]=useState('');
 const [linkUserId,setLinkUserId]=useState('');
 const [authMode,setAuthMode]=useState<'signup'|'signin'>('signin'),[authName,setAuthName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [personName,setPersonName]=useState(''),[personKind,setPersonKind]=useState<Person['kind']>('adult');
 const [medForm,setMedForm]=useState(blankMed),[medProfile,setMedProfile]=useState('');
 const [showArchivedProfiles,setShowArchivedProfiles]=useState(false),[showArchivedMeds,setShowArchivedMeds]=useState(false);
 const [doseStatus,setDoseStatus]=useState<(typeof statuses)[number]|null>(null),[doseNote,setDoseNote]=useState(''),[doseIdempotency,setDoseIdempotency]=useState(''),[doseActualAt,setDoseActualAt]=useState(datetimeField(new Date()));
 const [correctionReason,setCorrectionReason]=useState('');
 const [correctionKind,setCorrectionKind]=useState<'not_administered'|null>(null),[correctionMode,setCorrectionMode]=useState<'correction'|'later'>('correction');
 const [inviteRole,setInviteRole]=useState<'caregiver'|'member'>('caregiver'),[inviteProfiles,setInviteProfiles]=useState<string[]>([]);
 const [inviteScope,setInviteScope]=useState<CareScope>('limited'),[inviteCapabilities,setInviteCapabilities]=useState<CareCapability[]>([...DEFAULT_CARE_CAPABILITIES]);
 const [accessMember,setAccessMember]=useState<Member|null>(null),[accessScope,setAccessScope]=useState<CareScope>('limited');
 const [accessProfiles,setAccessProfiles]=useState<string[]>([]),[accessCapabilities,setAccessCapabilities]=useState<CareCapability[]>([...DEFAULT_CARE_CAPABILITIES]);
 const active=households.find(h=>h.id===hid),owner=active?.role==='owner';
 const showToast=(kind:'success'|'error'|'info',message:string)=>setToast({id:++toastSequence.current,kind,message});
 const notice=(message:string)=>{if(lockingRef.current)return;showToast('success',message);setError('');};
 const fail=(e:unknown)=>{
   if(lockingRef.current||e instanceof StaleSessionRequest)return;
   const message=e instanceof Error?e.message:String(e);
   if(!user||!hasPasskey||locked)setError(message);
   else showToast('error',message);
 };
 useEffect(()=>{
   if(!toast)return;
   const timeout=window.setTimeout(()=>setToast(current=>current?.id===toast.id?null:current),5000);
   return()=>window.clearTimeout(timeout);
 },[toast?.id]);
 useEffect(()=>{
   const update=()=>{const dark=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#191b1a':'#f4f1e9');};
   update();const media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',update);try{localStorage.setItem('carehold-theme',theme);}catch{}return()=>media.removeEventListener('change',update);
 },[theme]);
 useEffect(()=>{const cb=(e:Event)=>{e.preventDefault();setInstallEvent(e);};window.addEventListener('beforeinstallprompt',cb);return()=>window.removeEventListener('beforeinstallprompt',cb);},[]);
 useEffect(()=>{if(!copyFeedback)return;const timeout=window.setTimeout(()=>setCopyFeedback(null),3200);return()=>window.clearTimeout(timeout);},[copyFeedback]);
 useEffect(()=>{
   if(!('serviceWorker' in navigator))return;
   const receive=(e:MessageEvent)=>{
     const value=e.data;
     if(value?.type!=='carehold:push-test'||typeof value.testId!=='string')return;
     if(!['received','display-requested','display-error'].includes(value.stage))return;
     setPushTrace(current=>current!==null&&current.id===value.testId?{
       ...current,
       received:current.received||value.stage==='received',
       displayRequested:current.displayRequested||value.stage==='display-requested',
       displayError:current.displayError||value.stage==='display-error'
     }:current);
   };
   navigator.serviceWorker.addEventListener('message',receive);
   return()=>navigator.serviceWorker.removeEventListener('message',receive);
 },[]);
 const clearSensitive=useCallback(()=>{
   invalidatePendingApiResponses();myProfileRequest.current+=1;
   setUser(null);setHasPasskey(false);setRecoveryCompletedUser(null);setAudience(null);setPendingInvitation(false);
   setHouseholds([]);setHid('');setProfiles([]);setMyProfile(null);setEntries([]);setMeds([]);setHistory([]);setMembers([]);
   setSelected('');setMessageHandoff(null);setModal(null);setPending({});setInviteCreated('');setPassword('');setEmail('');
   setMedForm(blankMed());setDoseNote('');setCorrectionReason('');setPersonName('');
   setPushEnabled(false);setPushConfig(null);setPushFeedback(null);setPushSubscriptionCount(0);setPushTrace(null);setLocalNotificationFeedback('');
   setError('');setToast(null);setAuthMode('signin');
 },[]);
 const lockNow=(reason='',revokeSession=true)=>{
   if(lockingRef.current)return;
   // Preserve a draft only across the same-tab passkey lock; do not retain
   // plaintext in browser storage or share it with another signed-in account.
   if(modal==='correct'&&pending.event&&user?.id&&hid){
     correctionAfterLock.current={userId:user.id,householdId:hid,event:pending.event,
       reason:correctionReason,status:doseStatus,kind:correctionKind,mode:correctionMode,
       actualAt:doseActualAt,idempotencyKey:doseIdempotency};
   }else correctionAfterLock.current=null;
   lockingRef.current=true;authEpochRef.current+=1;
   setLocked(true);setLockError(reason);
   clearSensitive();
   // Validate the current browser session before revoking it. Another tab
   // may have switched the shared cookie to a different household account.
   const expectedUserId=user?.id;
   logoutInFlight.current=revokeSession&&expectedUserId?
     fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store',
       headers:{Accept:'application/json'}}).then(async response=>{
        if(!response.ok)return;
        const session=await response.json() as {user?:{id:string}|null}|null;
        if(session?.user?.id===expectedUserId)await authClient.signOut();
       }).catch(()=>{setLockError('Unable to verify or revoke this session. Reconnect before unlocking.');}):
     Promise.resolve();
 };
 const refreshIdentity=useCallback(async()=>{
   const epoch=authEpochRef.current;
   try{
     const result=await api<{user:{id:string,name:string,email:string},hasPasskey:boolean,audience:Audience|null,pendingInvitation:boolean}>('/me');
     if(epoch!==authEpochRef.current||lockingRef.current)return;
     setUser(result.user);setHasPasskey(result.hasPasskey);setAudience(result.audience);setPendingInvitation(result.pendingInvitation);
   }catch{
     if(epoch!==authEpochRef.current||lockingRef.current)return;
     setUser(null);setHasPasskey(false);setRecoveryCompletedUser(null);setAudience(null);setPendingInvitation(false);
   }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refreshIdentity();},[refreshIdentity]);
 async function unlockWithPasskey(){
   setSaving(true);setLockError('');
   try{
     await logoutInFlight.current;
     const result=await authClient.signIn.passkey();
     if(result.error)throw new Error(result.error.message||'Passkey authentication did not complete.');
     authEpochRef.current+=1;lockingRef.current=false;
     await refreshIdentity();
     setLocked(false);
   }catch(e){
     lockingRef.current=true;setLockError(e instanceof Error?e.message:'Could not unlock. Try again.');
   }finally{setSaving(false);}
 }
 async function showPasswordSignin(){
   await logoutInFlight.current;
   correctionAfterLock.current=null;
   lockingRef.current=false;setLocked(false);setAuthMode('signin');setLockError('');
 }
 useIdleSecurity(Boolean(user&&hasPasskey&&!locked&&!loading),(reason)=>{
    // An auto-lock protects THIS tab's screen, not the browser-wide cookie.
    // Signing out here would unexpectedly evict an actively used second tab.
    const message=reason==='away'
      ? 'This tab locked after one minute in the background. Unlock with your passkey to continue.'
      : 'This tab locked after three minutes without detected activity. Unlock with your passkey to continue.';
    lockNow(message,false);
  },()=>{
   const epoch=authEpochRef.current,expectedUserId=user?.id;
   if(!expectedUserId)return;
   const stillCurrent=()=>epoch===authEpochRef.current&&!lockingRef.current;
   // A real auth endpoint request refreshes Better Auth's sliding session.
   // If it reports a missing/mismatched session, confirm that with a second
   // authenticated request before locking an otherwise active Carehold tab.
   void (async()=>{
     const response=await fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store',
       headers:{Accept:'application/json'}});
     if(!stillCurrent())return;
     if(!response.ok&&response.status!==401&&response.status!==403)return;
     const session=response.ok
       ? await response.json() as {user?:{id:string}|null}|null
       : null;
     if(!stillCurrent()||session?.user?.id===expectedUserId)return;
     const confirmed=await fetch('/api/me',{credentials:'same-origin',cache:'no-store',
       headers:{Accept:'application/json','X-Carehold-Request':'1'}});
     if(!stillCurrent())return;
     if(confirmed.ok){
       const state=await confirmed.json() as {user?:{id:string}|null};
       if(!stillCurrent()||state.user?.id===expectedUserId)return;
     }else if(confirmed.status!==401&&confirmed.status!==403){
       // Worker/network trouble alone does not prove the user signed out.
       return;
     }
     if(stillCurrent())lockNow('This browser’s session expired or switched accounts. Your unfinished correction is retained in this tab for the same account.',false);
   })().catch(()=>{/* Connectivity or parse errors must not force sign-out. */});
 });
 const refreshHouseholds=useCallback(async()=>{
   if(!user||!hasPasskey||recoveryCompletedUser!==user.id)return;
   try{const r=await api<{households:Household[]}>('/households');setHouseholds(r.households);setHid(old=>r.households.some(x=>x.id===old)?old:(r.households[0]?.id||''));}catch(e){fail(e);}
 },[user,hasPasskey,recoveryCompletedUser]);
 useEffect(()=>{void refreshHouseholds();},[refreshHouseholds]);
 async function acceptStagedInvitation(){
   if(invitationBusy)return;
   setInvitationBusy(true);
   try{await api('/invitations/accept-pending','POST',{});setPendingInvitation(false);await refreshHouseholds();notice('Invitation accepted. Your care circle is ready.');}
   catch(e){fail(e);}finally{setInvitationBusy(false);}
 }
 useEffect(()=>{
   if(!user?.id||!hasPasskey||recoveryCompletedUser!==user.id||!pendingInvitation||triedAutoInvite.current.has(user.id))return;
   triedAutoInvite.current.add(user.id);
   void acceptStagedInvitation();
 },[user?.id,hasPasskey,recoveryCompletedUser,pendingInvitation]);
 const refreshMembers=useCallback(async()=>{
   if(!hid||(active?.role!=='owner'&&active?.role!=='caregiver'))return;
   try{const result=await api<{members:Member[]}>(`/members?householdId=${encodeURIComponent(hid)}`);setMembers(result.members);}catch(e){fail(e);}
 },[hid,active?.role]);
 useEffect(()=>{if((page==='circle'&&active?.role!=='member')||(page==='people'&&owner))void refreshMembers();},[page,active?.role,owner,refreshMembers]);
 async function setMemberClassification(memberId:string,next:Member['classification']){
  if(!hid||!owner||next==='unverified')return;
  setSaving(true);
  try{
   await api('/members/'+encodeURIComponent(memberId)+'/classification','PATCH',{householdId:hid,classification:next});
   await refreshMembers();
   notice('Account classification updated. Medication permissions are enforced by the server.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 function beginManageAccess(member:Member){
  setAccessMember(member);setAccessScope(member.access_scope==='full'?'full':'limited');
  setAccessProfiles(member.grants?.map(g=>g.profileId)||[]);
  const caps=new Set<CareCapability>(['view_schedule',...(member.grants||[]).flatMap(g=>g.capabilities)]);
  setAccessCapabilities([...caps]);setModal('access');
 }
 async function saveMemberAccess(e:FormEvent){
  e.preventDefault();if(!accessMember||!owner)return;
  setSaving(true);
  try{
   const grants=accessScope==='full'?[]:accessProfiles.map(profileId=>({profileId,capabilities:accessCapabilities}));
   await api('/members/'+encodeURIComponent(accessMember.user_id)+'/access','PATCH',{householdId:hid,accessScope,grants});
   setModal(null);setAccessMember(null);
   await Promise.all([refreshMembers(),refreshProfiles(),refreshToday()]);
   notice('Caregiver access updated. Private Words and messages were not shared.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 async function revokeMember(e:FormEvent){e.preventDefault();if(!memberToRemove)return;setSaving(true);try{
  await api(`/members/${encodeURIComponent(memberToRemove.user_id)}?householdId=${encodeURIComponent(hid)}`,'DELETE');
  setModal(null);setMemberToRemove(null);await refreshMembers();notice('Caregiver access was revoked.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 const refreshMyProfile=useCallback(async()=>{
   const requestId=++myProfileRequest.current;
   if(!hid||!user?.id||!hasPasskey){setMyProfile(null);return;}
   try{
     const result=await api<{profile:LinkedSelfProfile|null}>(`/me/linked-profile?householdId=${encodeURIComponent(hid)}`);
     if(requestId===myProfileRequest.current)setMyProfile(result.profile);
   }catch(e){
     if(requestId!==myProfileRequest.current||e instanceof StaleSessionRequest)return;
     setMyProfile(null);
     fail(e);
   }
 },[hid,user?.id,hasPasskey]);
 useEffect(()=>{setMyProfile(null);void refreshMyProfile();},[refreshMyProfile]);
 const refreshProfiles=useCallback(async()=>{
   if(!hid)return;
   try{const r=await api<{profiles:Person[]}>(`/profiles?householdId=${encodeURIComponent(hid)}${active?.role==='owner'?'&includeArchived=1':''}`);
    setProfiles(r.profiles);
    setSelected(old=>r.profiles.some(x=>x.id===old&&!x.archived_at)?old:(r.profiles.find(x=>!x.archived_at)?.id||''));}catch(e){fail(e);}
 },[hid,active?.role]);
 useEffect(()=>{void refreshProfiles();if(hid){const zone=households.find(h=>h.id===hid)?.timezone||'America/New_York';setDate(localDate(new Date(),zone));void api<{enabled:boolean,subscriptionCount:number}>(`/push/status?householdId=${encodeURIComponent(hid)}`).then(r=>{setPushEnabled(r.enabled);setPushSubscriptionCount(r.subscriptionCount);}).catch(e=>setPushFeedback({kind:'error',text:e instanceof Error?e.message:'Could not read notification status.'}));}},[refreshProfiles,hid,households]);
 useEffect(()=>{if(!user||!hasPasskey)return;void api<{configured:boolean,publicKey:string|null}>('/push/config').then(setPushConfig).catch(e=>setPushFeedback({kind:'error',text:e instanceof Error?e.message:'Could not check notification configuration.'}));},[user?.id,hasPasskey]);
 const refreshToday=useCallback(async()=>{
   if(!hid||!date)return;
   try{const r=await api<{entries:Entry[]}>(`/today?householdId=${encodeURIComponent(hid)}&date=${date}`);setEntries(r.entries.sort((a,b)=>a.time.localeCompare(b.time)||a.person.localeCompare(b.person)));}catch(e){fail(e);}
 },[hid,date]);
 useEffect(()=>{void refreshToday();},[refreshToday]);
 const refreshPerson=useCallback(async()=>{
   if(!selected)return;try{const [m,h]=await Promise.all([api<{medications:Medication[]}>(`/medications?profileId=${selected}&includeArchived=1`),api<{events:DoseEvent[]}>(`/history?profileId=${selected}`).catch(()=>({events:[]}))]);setMeds(m.medications);setHistory(h.events);}catch(e){fail(e);}
 },[selected]);
 useEffect(()=>{void refreshPerson();},[refreshPerson]);
 async function authSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');
  // Keep text replacement delimiters until the browser has expanded them.
  const cleanEmail=normalizeEmailInput(emailInputRef.current?.value??email);
  if(emailInputRef.current){
    emailInputRef.current.value=cleanEmail;
    emailInputRef.current.setCustomValidity(isValidEmailInput(cleanEmail)?'':'Enter a valid email address.');
  }
  setEmail(cleanEmail);
  if(!e.currentTarget.reportValidity())return;
  emailInputRef.current?.setCustomValidity('');
  setSaving(true);
  try{
   const result=authMode==='signup'?await authClient.signUp.email({name:authName.trim(),email:cleanEmail,password},{headers:{'X-Carehold-Access':accessCode.trim()}}):await authClient.signIn.email({email:cleanEmail,password});
   if(result.error)throw new Error(result.error.message||'Authentication failed.');
   if(authMode==='signup'){
   try{await api('/onboarding','POST',{audience:signupAudience,invitationCode:accessCode.trim()});setAccessCode('');}
   catch{throw new Error('Your account was created, but setup was interrupted. Sign in and complete setup; keep your invitation code until joined.');}
 }
 setPassword('');await refreshIdentity();
   if(authMode==='signup')notice('Account created. Secure it with your passkey next.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 async function signInWithPasskey(){setSaving(true);setError('');try{
  const result=await authClient.signIn.passkey();
  if(result.error)throw new Error(result.error.message||'Passkey sign-in failed.');
  await refreshIdentity();
 }catch(e){fail(e);}finally{setSaving(false);}}
 async function addPasskey(){setSaving(true);setError('');try{const r=await authClient.passkey.addPasskey({name:'My device'});if(r.error)throw new Error(r.error.message||'Could not add passkey.');await refreshIdentity();notice('Your passkey is ready.');}catch(e){fail(e);}finally{setSaving(false);}}
 async function logout(){
   correctionAfterLock.current=null;
   authEpochRef.current+=1;clearSensitive();setLocked(false);lockingRef.current=false;
   try{await authClient.signOut();}catch{showToast('error','Could not contact the server. Your session will expire shortly.');}
 }
 async function createHousehold(e:FormEvent){e.preventDefault();const form=new FormData(e.currentTarget as HTMLFormElement);setSaving(true);try{const r=await api<{id:string}>('/households','POST',{name:String(form.get('name')),timezone:String(form.get('timezone'))});setHid(r.id);await refreshHouseholds();notice('Your care circle is ready. Add the people you care for.');}catch(e){fail(e);}finally{setSaving(false);}}
 async function joinHousehold(e:FormEvent){e.preventDefault();setSaving(true);try{await api('/invitations/accept','POST',{code:inviteInput.trim()});setInviteInput('');await refreshHouseholds();notice('Invitation accepted. Welcome to your circle.');}catch(e){fail(e);}finally{setSaving(false);}}
 function beginLink(profile:Person) {
   setError('');setPending({profile});setLinkUserId(profile.linked_user_id||'');setModal('link');
 }
 async function saveLink(e:FormEvent){
   e.preventDefault();if(!pending.profile)return;
   setSaving(true);
   try{
     await api(`/profiles/${pending.profile.id}/linked-account`,'PUT',{userId:linkUserId||null});
     setModal(null);await Promise.all([refreshProfiles(),refreshMyProfile()]);
     notice(linkUserId?'Account linked to profile. No medication permissions were changed.':'Account unlinked. Medication history remains unchanged.');
   }catch(e){fail(e);}finally{setSaving(false);}
 }
 async function saveProfile(e:FormEvent){e.preventDefault();setSaving(true);try{await api('/profiles','POST',{householdId:hid,name:personName.trim(),kind:personKind});setModal(null);setPersonName('');await refreshProfiles();notice('Person added to your care circle.');}catch(e){fail(e);}finally{setSaving(false);}}
 function newMed(profileId:string,med?:Medication){setMedProfile(profileId);setMedForm(med?{
   name:med.name,form:med.form,dose:med.dose,instructions:med.instructions,cadence:med.cadence,weekdays:med.weekdays,intervalDays:String(med.interval_days||2),startDate:med.start_date,endDate:med.end_date||'',anchorDate:med.anchor_date||med.start_date,times:med.times,clinician:med.clinician||'',refillNote:med.refill_note||'',catalogSource:med.catalog_source,catalogIdentifier:med.catalog_identifier,normalizedName:med.normalized_name,brandName:med.brand_name,productStrength:med.product_strength,dosageForm:med.dosage_form}:{...blankMed(),startDate:localDate(new Date(),active?.timezone||'America/New_York'),anchorDate:localDate(new Date(),active?.timezone||'America/New_York')});setPending({medication:med});setModal('med');}
 async function saveMed(e:FormEvent){e.preventDefault();setSaving(true);try{
  const body={...medForm,profileId:medProfile,intervalDays:Number(medForm.intervalDays),endDate:medForm.endDate||null,anchorDate:medForm.anchorDate||medForm.startDate};
  await api(pending.medication?`/medications/${pending.medication.id}`:'/medications',pending.medication?'PATCH':'POST',body);
  setModal(null);await Promise.all([refreshPerson(),refreshToday()]);notice(pending.medication?'Medication updated. Past administration records were preserved.':'Medication added.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 async function archiveMedication(e:FormEvent){
  e.preventDefault();if(!pending.medication)return;
  setSaving(true);try{
   await api(`/medications/${pending.medication.id}/archive`,'POST',{});
   setModal(null);await Promise.all([refreshPerson(),refreshToday()]);
   notice('Medication archived. Future scheduled occurrences are hidden; administration history remains.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 async function restoreMedication(m:Medication){
  setSaving(true);try{
   await api(`/medications/${m.id}/restore`,'POST',{});
   await Promise.all([refreshPerson(),refreshToday()]);
   notice('Medication restored to its previous plan. Review the schedule before relying on it.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 async function archiveProfile(e:FormEvent){
  e.preventDefault();if(!pending.profile)return;
  setSaving(true);try{
   await api(`/profiles/${pending.profile.id}/archive`,'POST',{});
   setModal(null);await Promise.all([refreshProfiles(),refreshToday()]);
   notice('Profile archived. Dose history and old conversations are retained; the linked account remains a member.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 async function restoreProfile(p:Person){
  setSaving(true);try{
   await api(`/profiles/${p.id}/restore`,'POST',{});
   await Promise.all([refreshProfiles(),refreshToday()]);
   notice('Profile restored. Review medications and household grants before using it.');
  }catch(e){fail(e);}finally{setSaving(false);}
 }
 function beginDose(entry?:Entry,medication?:Medication){setPending({entry,medication});setDoseStatus(null);setDoseNote('');setDoseActualAt(datetimeField(new Date()));setDoseIdempotency(crypto.randomUUID());setModal('dose');}
 async function saveDose(e:FormEvent){e.preventDefault();if(!doseStatus){showToast('error','Choose what actually happened before recording a dose.');return;}setSaving(true);try{
   const entry=pending.entry,med=pending.medication;
   await api('/administrations','POST',{medicationId:entry?.medicationId||med?.id,date:entry?.date,time:entry?.time,eventType:doseStatus,idempotencyKey:doseIdempotency,note:doseNote,occurredAt:new Date(doseActualAt).toISOString()});
   setModal(null);await Promise.all([refreshToday(),refreshPerson()]);notice('Recorded with caregiver and timestamp.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 function beginCorrection(event:DoseEvent,mode:'correction'|'later'='correction'){
  setPending({event});setCorrectionMode(mode);setCorrectionKind(mode==='correction'?event.correction_kind??null:null);
  setDoseStatus(mode==='later'?null:event.event_type);
  setCorrectionReason('');setDoseActualAt(datetimeField(mode==='later'?new Date():new Date(event.occurred_at)));
  setDoseIdempotency(crypto.randomUUID());setModal('correct');
 }
 async function correctDose(e:FormEvent){e.preventDefault();if(!doseStatus){showToast('error','Select what actually happened.');return;}setSaving(true);try{
  await api(`/administrations/${pending.event?.id}/correct`,'POST',{eventType:doseStatus,correctionKind,reason:correctionReason,idempotencyKey:doseIdempotency,occurredAt:new Date(doseActualAt).toISOString()});
  setModal(null);await Promise.all([refreshToday(),refreshPerson()]);notice('Correction appended. The original record is preserved.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 async function createInvite(e:FormEvent){e.preventDefault();setSaving(true);try{
  const grants=inviteScope==='full'&&inviteRole==='caregiver'?[]:inviteProfiles.map(profileId=>({profileId,capabilities:inviteCapabilities}));
  const r=await api<{code:string}>('/invitations','POST',{householdId:hid,role:inviteRole,accessScope:inviteRole==='caregiver'?inviteScope:'limited',grants});setInviteCreated(r.code);notice('One-time invitation created. It expires in 48 hours.');
 }catch(e){fail(e);}finally{setSaving(false);}}
 const enablePush=async()=>{
   setPushFeedback(null);
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
     setPushFeedback({kind:'error',text:'Web Push is unsupported in this browser. On iPhone, install Carehold to the Home Screen and open that app.'});return;
   }
   if(!pushConfig?.configured||!pushConfig.publicKey){
     setPushFeedback({kind:'error',text:PUSH_UNAVAILABLE_MESSAGE});return;
   }
   if(Notification.permission==='denied'){
     setPushFeedback({kind:'error',text:'Notifications are blocked. Allow them for this site in your browser and operating-system notification settings.'});return;
   }
   // Request permission directly from the click, without fetching first.
   const requested=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
   setSaving(true);
   try{
     const permission=await requested;
     if(permission!=='granted')throw new Error('Notification permission was not granted. Change site permissions to enable reminders.');
     const worker=await navigator.serviceWorker.register('/sw.js');
     await navigator.serviceWorker.ready;
     const encoded=pushConfig.publicKey.replace(/-/g,'+').replace(/_/g,'/');
     const raw=atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'='));
     const key=new Uint8Array([...raw].map(c=>c.charCodeAt(0)));
     let sub=await worker.pushManager.getSubscription();
     if(sub?.options.applicationServerKey){
       const current=new Uint8Array(sub.options.applicationServerKey);
       if(current.length!==key.length||current.some((v,i)=>v!==key[i])){
         await sub.unsubscribe();sub=null;
       }
     }
     if(!sub)sub=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key.buffer as ArrayBuffer});
     await api('/push/subscribe','POST',{subscription:sub.toJSON()});
     await api('/push/preference','POST',{householdId:hid,enabled:true});
     setPushEnabled(true);setPushSubscriptionCount(n=>Math.max(1,n));
     setPushFeedback({kind:'success',text:'This device is subscribed. Use Send test notification to verify actual delivery.'});
   }catch(e){setPushFeedback({kind:'error',text:e instanceof Error?e.message:'Notification setup failed.'});}
   finally{setSaving(false);}
 };
 const disablePush=async()=>{setSaving(true);setPushFeedback(null);try{
   await api('/push/preference','POST',{householdId:hid,enabled:false});setPushEnabled(false);
   setPushFeedback({kind:'info',text:'Reminders paused for this household. The browser subscription remains available for re-enabling.'});
 }catch(e){setPushFeedback({kind:'error',text:e instanceof Error?e.message:'Could not pause reminders.'});}finally{setSaving(false);}};
 async function testPush(){
   setSaving(true);setPushFeedback(null);
   const id=crypto.randomUUID();
   setPushTrace({id,accepted:false,received:false,displayRequested:false,displayError:false});
   try{
     // Fetching test status only confirms acceptance by the push gateway.
     // The service worker reports separately if the browser receives it.
     const result=await api<{accepted:number,failed:number,testId:string}>('/push/test','POST',{householdId:hid,testId:id});
     setPushTrace(p=>p?.id===result.testId?{...p,accepted:result.accepted>0}:p);
     setPushFeedback({kind:'info',text:`Push service accepted ${result.accepted} send(s). Check the diagnostic steps below to see whether this browser actually received it. OS display still needs visual confirmation.`});
   }catch(e){setPushFeedback({kind:'error',text:e instanceof Error?e.message:'The test push failed.'});}
   finally{setSaving(false);}
 }
 async function testLocalNotification(){
   setLocalNotificationFeedback('');
   try{
     if(!('Notification' in window)||!('serviceWorker' in navigator))throw new Error('Notifications are not supported by this browser.');
     if(Notification.permission!=='granted')throw new Error('Site notifications are not allowed. Check browser site settings first.');
     const reg=await navigator.serviceWorker.ready;
     await reg.showNotification('A moment for care',{
       body:'This is a local Carehold notification display test.',
       tag:'carehold-local-'+crypto.randomUUID(),
       icon:'/branding/carehold/pwa/carehold-any-light-192.png',badge:'/branding/carehold/pwa/carehold-notification-badge-96.png',
     });
     setLocalNotificationFeedback('Browser display was requested. Check your device notification settings, Notification Center, and Focus/Do Not Disturb if no alert appears.');
   }catch(e){setLocalNotificationFeedback(e instanceof Error?e.message:'Local display test failed.');}
 }

 const install=async()=>{if(installEvent){await installEvent.prompt();setInstallEvent(null);}else notice('On iPhone: Share → Add to Home Screen. On desktop: use your browser’s Install app command.');};
 async function copy(value:string,key:string){
   try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(value);setCopyFeedback({key,success:true,message:'Copied to clipboard'});}
   catch{setCopyFeedback({key,success:false,message:'Could not copy. Select the text manually.'});}
 }
 async function saveAudience(next:Audience){
   setSaving(true);
   try{await api('/me/audience','POST',{audience:next});setAudience(next);notice('Prompt preferences updated.');}
   catch(e){fail(e);}finally{setSaving(false);}
 }
 useEffect(()=>{
   if(locked||!user?.id)return;
   const draft=correctionAfterLock.current;
   if(!draft)return;
   if(draft.userId!==user.id){correctionAfterLock.current=null;return;}
   if(hid!==draft.householdId)return;
   correctionAfterLock.current=null;
   setPending({event:draft.event});
   setCorrectionReason(draft.reason);setDoseStatus(draft.status);
   setCorrectionKind(draft.kind);setCorrectionMode(draft.mode);
   setDoseActualAt(draft.actualAt);setDoseIdempotency(draft.idempotencyKey);
   setModal('correct');
   showToast('info','Your unfinished correction was restored after passkey unlock.');
 },[locked,user?.id,hid]);
 const person=profiles.find(x=>x.id===selected);
 useEffect(()=>{
  if(page!=='people'||!planFocusTarget||person?.id!==planFocusTarget)return;
  const heading=document.getElementById('carehold-medication-plan-heading');
  if(!heading)return;
  heading.scrollIntoView({behavior:'smooth',block:'center'});
  heading.focus({preventScroll:true});
  setPlanFocusTarget(null);
 },[page,planFocusTarget,person?.id]);
 const visibleProfiles=profiles.filter(p=>showArchivedProfiles||!p.archived_at);
 const visibleMeds=meds.filter(m=>showArchivedMeds||!m.archived_at);
 const toastView=toast&&<div className={`app-toast ${toast.kind}`} role={toast.kind==='error'?'alert':'status'} aria-live={toast.kind==='error'?'assertive':'polite'} aria-atomic="true">
   <span className="toast-icon">{toast.kind==='success'?<Check size={18}/>:toast.kind==='error'?<X size={18}/>:<ShieldCheck size={18}/>}</span>
   <p>{toast.message}</p>
   <button type="button" aria-label="Dismiss message" onClick={()=>setToast(null)}><X size={17}/></button>
 </div>;

 if(locked)return <div className="gate-shell lock-screen"><div className="lock-mark"><Mark size={67}/></div><div className="form-index">YOUR CIRCLE IS PROTECTED</div><h1>Carehold is<br/><em>locked.</em></h1><p>We lock after three minutes without activity, or one minute away from Carehold. Unlock with your passkey to continue.</p>{correctionAfterLock.current&&<p className="muted">Your unfinished correction is temporarily retained in this tab. Unlock with the same account to resume; closing this tab will discard it.</p>}{lockError&&<Banner kind="error" text={lockError} close={()=>setLockError('')}/>}<button className="button primary big" type="button" disabled={saving} onClick={()=>void unlockWithPasskey()}><KeyRound size={19}/>{saving?'Verifying…':'Unlock with passkey'}</button><button className="text-link" type="button" disabled={saving} onClick={()=>void showPasswordSignin()}>Use email and password instead</button><p className="fine-print">Your care data stays hidden until you authenticate again.</p></div>;
 if(loading)return <div className="loading"><Mark size={70}/><p>Finding your place…</p></div>;
 if(!user)return <>{toastView}<div className="entry-shell"><div className="entry-aside"><BrandLogo stacked className="entry-identity"/><div className="entry-tag">NOTHING GETS LOST IN THE SHUFFLE</div><h1>Care, held<br/><em>together.</em></h1><div className="hand-drawn-rule"/><p>The small everyday moments matter. One gentle place to keep track of them.</p><div className="entry-foot">PRIVATE HOUSEHOLD PILOT <span>✳</span> BUILT WITH CARE</div></div><div className="entry-panel"><div className="entry-toolbar"><AppearanceSwitch theme={theme} setTheme={setTheme}/></div><div className="form-index">01 / WELCOME IN</div><h2>{authMode==='signup'?'Make room for care.':'Welcome back.'}</h2><p>{authMode==='signup'?'Create your account, add a passkey, then save and verify an encryption recovery code before entering your care circle. You’ll need a pilot or household invitation code.':'Your circle is waiting.'}</p>{error&&<Banner kind="error" text={error} close={()=>setError('')}/>}<form onSubmit={authSubmit} className="form-stack" noValidate>
 {authMode==='signup'&&<><label>Your name<input required autoComplete="name" value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="What should we call you?"/></label><AudienceField value={signupAudience} onChange={setSignupAudience}/><p className="fine-print">This chooses age-appropriate conversation starters, not medication access. Professional accounts come later. We do not collect children's birth dates in this pilot.</p></>}
 <label>Email address<input ref={emailInputRef} type="text" inputMode="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} pattern={EMAIL_INPUT_PATTERN} value={email} onChange={e=>{e.currentTarget.setCustomValidity('');setEmail(e.target.value);}} onBlur={e=>setEmail(normalizeEmailInput(e.currentTarget.value))} placeholder="you@example.com"/></label>
 <label>Password<input type="password" required minLength={10} autoComplete={authMode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 10 characters"/></label>
 {authMode==='signup'&&<label>Pilot / invitation code<input required autoComplete="off" value={accessCode} onChange={e=>setAccessCode(e.target.value)} placeholder="Enter once — a household invitation follows you through setup"/></label>}
 <button className="button primary big" disabled={saving} type="submit">{saving?'One moment…':authMode==='signup'?'Create my account':'Sign in'} <ArrowUpRight size={18}/></button></form>{authMode==='signin'&&<button className="button outline" disabled={saving} onClick={signInWithPasskey}><KeyRound size={17}/> Sign in with a passkey</button>}<button className="text-link" onClick={()=>{setAuthMode(authMode==='signup'?'signin':'signup');setError('');}}>{authMode==='signup'?'Already have an account? Sign in':'New to Carehold? Create an account'}</button><div className="entry-notice"><ShieldCheck size={17}/>Setup requires a passkey and a separately saved, verified encryption recovery code before you can use Carehold. Private writing remains experimental.</div></div></div></>;
 if(!hasPasskey)return <>{toastView}<div className="gate-shell"><div className="appearance-corner"><AppearanceSwitch theme={theme} setTheme={setTheme}/></div><Mark size={70}/><div className="form-index">02 / SECURE YOUR PLACE</div><h1>One more layer<br/><em>of care.</em></h1><p>A passkey protects access to your household’s information using your device’s unlock method. It’s required before you begin.</p>{error&&<Banner kind="error" text={error} close={()=>setError('')}/>}<button className="button primary big" disabled={saving} onClick={addPasskey}><KeyRound size={18}/> {saving?'Setting up…':'Add my passkey'}</button><button className="text-link" onClick={logout}>Sign out instead</button><div className="fine-print">If your device cannot create a passkey, use a supported browser or device. Passkeys do not encrypt future private journal content.</div></div></>;
 if(recoveryCompletedUser!==user.id)return <>{toastView}<RecoverySetupGate key={user.id} userId={user.id} onVerified={setRecoveryCompletedUser} onSignOut={()=>void logout()}/></>;
 if(!audience)return <>{toastView}<div className="onboard-shell"><header className="onboard-top"><BrandLogo className="onboard-logo"/><div className="onboard-top-actions"><AppearanceSwitch theme={theme} setTheme={setTheme} compact/><button className="quiet" onClick={logout}>Sign out</button></div></header><div className="onboard-main audience-onboarding"><div className="eyebrow"><span className="signal"/>04 / YOUR SPACE</div><h1>Words for<br/><em>you.</em></h1><p>Choose the prompts that feel right. This choice does not change your care permissions.</p>{error&&<Banner kind="error" text={error} close={()=>setError('')}/>}<form className="lined-form" onSubmit={e=>{e.preventDefault();void saveAudience(signupAudience);}}><AudienceField value={signupAudience} onChange={setSignupAudience}/><button disabled={saving} className="button primary big">Continue <ArrowUpRight size={18}/></button><p className="fine-print">Different prompts for parents, children and teens. Doctor accounts and birth-date collection are not enabled yet.</p></form></div></div></>;
 if(!households.length)return <>{toastView}<div className="onboard-shell"><header className="onboard-top"><BrandLogo className="onboard-logo"/><div className="onboard-top-actions"><AppearanceSwitch theme={theme} setTheme={setTheme} compact/><button className="quiet" onClick={logout}>Sign out</button></div></header><div className="onboard-main"><div className="eyebrow"><span className="signal"/>05 / THE FIRST CIRCLE</div><h1>Every circle<br/>starts <em>somewhere.</em></h1><p>{audience==='parent'?'Build a space for the people and pets you care for, or join an existing circle by invitation.':'A trusted adult can invite you into your care circle.'}</p>{pendingInvitation&&<div className="invitation-in-progress" role="status"><span>{invitationBusy?'Joining your invited care circle…':'Your invitation is saved for this account.'}</span><button className="button outline small" disabled={invitationBusy} onClick={()=>void acceptStagedInvitation()}>{invitationBusy?'Joining…':'Finish joining'}</button></div>}<div className="onboard-choices">{audience==='parent'&&<form onSubmit={createHousehold} className="lined-form"><h2>Start a care circle</h2><label>What do you call your household?<input name="name" required maxLength={80} placeholder="Our household"/></label><label>Your timezone<select name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone||'America/New_York'}><option value="America/New_York">Eastern</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option><option value="America/Phoenix">Arizona</option><option value="Pacific/Honolulu">Hawaii</option></select></label><button disabled={saving} type="submit" className="button primary">Create my circle <ArrowUpRight size={18}/></button></form>}{!pendingInvitation&&<form className="lined-form" onSubmit={joinHousehold}><h2>Join a care circle</h2><label>Invitation code<input required autoComplete="off" value={inviteInput} onChange={e=>setInviteInput(e.target.value)} placeholder="Paste the one-time code"/></label><button disabled={saving} type="submit" className="button outline">Join with invitation</button></form>}</div></div></div></>;
 return <>{toastView}<div className="app-shell"><Header theme={theme} setTheme={setTheme} user={user} logout={logout} lockNow={()=>lockNow()}/>
 <div className="workspace"><aside className="sidebar"><div className="sidebar-label">YOUR SPACE <span>01 — 06</span></div><nav aria-label="Main navigation" className="main-nav">{NAV_ITEMS.map(([id,label,Icon])=><a key={id as string} href={pagePath(id)} aria-current={page===id?'page':undefined} className={page===id?'nav-item active':'nav-item'} onClick={e=>followPageLink(e,id)}><Icon size={19}/><span>{label as string}</span>{pageUnread(id)>0&&<span className="nav-unread" aria-label={`${pageUnread(id)} unread`}>{pageUnread(id)>99?'99+':pageUnread(id)}</span>}{page===id&&<span className="nav-mark">↗</span>}</a>)}</nav><div className="sidebar-footer"><span className="soft-asterisk">✳</span><p>Good care is made<br/>of little things.</p><div>carehold. / 2026</div></div></aside>
 <main className="main-content"><div className="topline"><div className="household-select"><span>CARE CIRCLE</span><HouseholdPicker households={households} value={hid} onChange={next=>{setHid(next);navigate('today');}}/></div><div className="topline-right"><span className="private-label"><ShieldCheck size={15}/> INVITE ONLY</span><span className="date-label">{new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span></div></div>
 
 {page==='today'&&<><PageTitle eyebrow="THE DAILY LEDGER" title="A little care, today" subtitle="A clear place for the moments you’re looking after. No guesswork, no automatic checkmarks."/>
  <div className="day-toolbar"><div className="day-nav"><button aria-label="Previous day" onClick={()=>setDate(changeDay(date,-1))}><ChevronLeft size={20}/></button><label><span className="sr-only">Date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button aria-label="Next day" onClick={()=>setDate(changeDay(date,1))}><ChevronRight size={20}/></button></div><div className="day-name">{date?shortDate(date):''}</div><button className="quiet small" onClick={()=>setDate(localDate(new Date(),active!.timezone))}>Jump to today</button></div>
  <div className="summary-strip"><div><span className="mono kicker">ON THE LEDGER</span><strong>{entries.length.toString().padStart(2,'0')}</strong><span>scheduled moments</span></div><div><span className="mono kicker">RECORDED</span><strong>{entries.filter(x=>x.event).length.toString().padStart(2,'0')}</strong><span>with a status</span></div><div className="summary-phrase">A record is a record.<br/><em>Not a reminder to guess.</em></div></div>
  <div className="ledger-heading"><span>TIME / PERSON</span><span>MEDICATION &amp; RECORD</span></div><div className="ledger">{entries.length===0?<div className="empty-state"><span className="empty-star">✳</span><h2>Nothing on this day’s ledger.</h2><p>{profiles.length?'You can review another day, or add a scheduled medication under People.':'Start by adding a person to your care circle.'}</p><a className="button outline" href={pagePath('people')} onClick={e=>followPageLink(e,'people')}>Go to people <ArrowUpRight size={16}/></a></div>:entries.map(e=>{const overdue=!e.event&&e.dueAt&&Date.parse(e.dueAt)<Date.now();return <div className="ledger-row" key={e.key}><div className="ledger-when"><time>{e.time}</time><div className="ledger-person"><IconLabel kind={e.kind}/><span>{e.person}</span></div></div><div className="ledger-detail"><div className="ledger-title"><h3>{e.medicationName}</h3><span className={`status-pill ${e.event?.event_type|| (overdue?'overdue':'pending')}`}>{e.event?doseLabel(e.event):overdue?'Overdue • unrecorded':'Not recorded yet'}</span></div><p>{e.dose}{e.instructions?` · ${e.instructions}`:''}</p><div className="ledger-action">{e.event?<div className="ledger-record-actions"><span className="ledger-recorded"><Check size={16}/> Recorded {stamp(new Date(e.event.recorded_at))}</span>{e.canRecordDose&&<div className="ledger-record-buttons"><button type="button" className="button outline small" onClick={()=>beginCorrection(e.event!)}>Correct record</button>{e.event.event_type!=='given'&&<button type="button" className="button outline small" onClick={()=>beginCorrection(e.event!,'later')}>Record a later outcome</button>}</div>}</div>:
   e.canRecordDose?<button className="button dark" onClick={()=>beginDose(e)}>Record this dose <ArrowUpRight size={16}/></button>:<span className="muted tiny">View only · a caregiver records this dose</span>}</div></div></div>})}</div><div className="footnote"><Wind size={18}/><span>Overdue only means that no one has recorded an outcome. It never means a dose was automatically marked missed.</span></div>
 </>}
 {page==='people'&&<><PageTitle eyebrow="THOSE WE HOLD CLOSE" title="Your people & pets" subtitle="A home for each person’s medication schedule, past records, and trusted caregivers."/>{myProfile&&<section className="my-profile-summary" aria-label="My linked care profile">
   <div><span className="mono kicker">MY CARE PROFILE</span><h2>{myProfile.displayName}</h2><p>{myProfile.canViewSchedule?'This account has been granted medication schedule access.':'This account is linked to your profile, but schedule details have not been shared with you.'} Your identity link does not grant private journal or conversation access.</p></div>
   {myProfile.canViewSchedule&&<button className="button outline" type="button" onClick={()=>{setSelected(myProfile.id);setPlanFocusTarget(myProfile.id);}}><ArrowUpRight size={16}/> View my medication plan</button>}
 </section>}<div className="section-heading"><span>ACTIVE PROFILES / {profiles.filter(p=>!p.archived_at).length.toString().padStart(2,'0')}</span>{owner&&<div className="words-response-actions">
   {profiles.some(p=>p.archived_at)&&<button type="button" className="button outline small" onClick={()=>{
    const next=!showArchivedProfiles;setShowArchivedProfiles(next);
    if(next&&!selected)setSelected(profiles.find(p=>p.archived_at)?.id||'');
    if(!next&&person?.archived_at)setSelected(profiles.find(p=>!p.archived_at)?.id||'');
   }}>{showArchivedProfiles?'Hide archived':'Show archived'}</button>}
   <button className="button outline" onClick={()=>{setPersonName('');setPersonKind('adult');setModal('profile');}}><Plus size={16}/> Add a person or pet</button>
  </div>}</div>
  {profiles.filter(p=>!p.archived_at).length===0&&!showArchivedProfiles?<div className="empty-state"><span className="empty-star">✺</span><h2>Who are we looking after?</h2><p>Add an adult, child, or pet to start the medication ledger.</p>{owner&&<button className="button primary" onClick={()=>setModal('profile')}>Add the first profile</button>}</div>:<div className="person-layout"><div className="person-list" aria-label="Choose a profile">{visibleProfiles.map(p=><button key={p.id} className={p.id===selected?'person-list-item selected':'person-list-item'} onClick={()=>setSelected(p.id)}><IconLabel kind={p.kind}/><span>{p.display_name}<small>{p.archived_at?'Archived · ':''}{p.kind}</small></span><ArrowUpRight size={18}/></button>)}</div><section className="person-detail">{person&&<><div className="detail-intro"><span className="form-index">PROFILE / {person.kind.toUpperCase()}</span><h2>{person.display_name}<span>.</span></h2><div className="detail-actions" role="group" aria-label="Profile actions">
   {!person.archived_at&&person.can_manage_medication&&<button type="button" className="profile-action profile-action--primary" disabled={saving} onClick={()=>newMed(person.id)}><Plus size={17} aria-hidden="true"/> Add medication</button>}
   {owner&&!person.archived_at&&person.kind!=='pet'&&<button type="button" className="profile-action profile-action--secondary" disabled={saving} onClick={()=>beginLink(person)}><Link2 size={17} aria-hidden="true"/>{person.linked_user_id?'Change linked account':'Link an account'}</button>}
   {owner&&(person.archived_at?
    <button type="button" className="profile-action profile-action--secondary" disabled={saving} onClick={()=>void restoreProfile(person)}><ArchiveRestore size={17} aria-hidden="true"/> Restore profile</button>:
    <button type="button" className="profile-action profile-action--archive" disabled={saving} onClick={()=>{setPending({profile:person});setModal('archive-profile');}}><Archive size={17} aria-hidden="true"/> Archive profile</button>)}
  </div></div>{person.kind!=='pet'&&(person.linked_user_id||person.is_self===1)&&<p className="linked-summary"><Check size={15}/>{person.is_self===1?'This profile is linked to your account.':owner?`Linked to ${members.find(x=>x.user_id===person.linked_user_id)?.name||'a circle member'}.`:'Linked account'}</p>}<h3 id="carehold-medication-plan-heading" tabIndex={-1} className="subsection-title">Medication plan <span>{meds.filter(m=>!m.archived_at).length.toString().padStart(2,'0')}</span></h3>
  {meds.some(m=>m.archived_at)&&<button type="button" className="quiet small" onClick={()=>setShowArchivedMeds(v=>!v)}>{showArchivedMeds?'Hide archived medications':'Show archived medications'}</button>}
  {visibleMeds.length===0?<p className="muted">No active medications.</p>:visibleMeds.map(m=><div className="med-row" key={m.id}><div><span className="mono muted tiny">{m.archived_at?'ARCHIVED · ':''}{m.cadence.replace('_',' ').toUpperCase()} · {m.catalog_source==='rxterms'?'RXTERMS MATCH':'CUSTOM ENTRY'}</span><h4>{m.name}</h4><p>{m.dose} {m.form?` · ${m.form}`:''}</p>{m.product_strength&&<p className="muted tiny">Catalog product: {m.product_strength} (not the prescribed dose)</p>}<p className="muted tiny">{m.cadence==='prn'?'As-needed medication':m.times.join(' / ')}</p></div><div className="med-row-actions">
   {m.archived_at?
    person.can_manage_medication&&<button type="button" className="button outline small" disabled={saving||Boolean(person.archived_at)} onClick={()=>void restoreMedication(m)}>Restore</button>:
    !person.archived_at&&<>
     {person.can_manage_medication&&<button className="quiet small" onClick={()=>newMed(person.id,m)}>Edit</button>}
     {m.cadence==='prn'&&person.can_record_dose&&<button className="button outline small" onClick={()=>beginDose(undefined,m)}>Record PRN</button>}
     {person.can_manage_medication&&<button type="button" className="quiet small" onClick={()=>{setPending({medication:m});setModal('archive-med');}}>Archive</button>}
    </>}
  </div></div>)}<h3 className="subsection-title history-title">Administration history <span>{history.length.toString().padStart(2,'0')}</span></h3><p className="muted tiny">Corrections append to this ledger; the original entries remain.</p>{history.length===0?<p className="muted">No administration history yet.</p>:history.map(e=><div className="history-row" key={e.id}><div><b>{e.med_name_snapshot||'Medication'}</b><span className="history-status">{doseLabel(e)}</span><small>{e.actor_name||'Caregiver'} · {stamp(new Date(e.occurred_at))}{e.supersedes_event_id?' · corrected':''}</small></div>{e.is_current===0?<span className="muted tiny">Superseded · preserved in history</span>:
   person.can_record_dose&&<div className="med-row-actions">
    <button type="button" className="quiet small" onClick={()=>beginCorrection(e)}>Correct record</button>
    {e.event_type!=='given'&&<button type="button" className="button outline small" onClick={()=>beginCorrection(e,'later')}>Record a later outcome</button>}
   </div>}</div>)}</>}</section></div>}
 </>}
 {page==='words'&&<><PageTitle eyebrow="WORDS THAT OPEN DOORS" title="What matters, in your words" subtitle="Private journaling, thoughtful prompts, and shared spaces that make room for conversation."/><WordsHub key={user.id+':'+hid+':'+audience} userId={user.id} householdId={hid} audience={audience}/></>}
 {page==='messages'&&<><PageTitle eyebrow="WORDS WE SHARE" title="Conversations, gently" subtitle="Intentional questions and replies, without pressure or read receipts."/><MessagesStudio key={user.id+':'+hid} userId={user.id} householdId={hid} audience={audience} handoff={messageHandoff?.userId===user.id&&messageHandoff.householdId===hid?messageHandoff:null} onHandoffHandled={id=>setMessageHandoff(current=>current?.id===id?null:current)}/></>}
  {page==='circle'&&<>
   <PageTitle eyebrow="CARE IS A SHARED THING" title="Your care circle" subtitle="See who belongs here and manage only the care permissions intentionally granted."/>
   <div className="circle-hero"><div><span className="mono kicker">HOUSEHOLD</span><h2>{active?.name}</h2><p>Medication access is separate from private writing and messages.</p></div><div className="circle-stamp">✳</div></div>
   <div className="section-heading"><span>TRUSTED ACCESS</span>{owner&&<button className="button dark" onClick={()=>{
     setInviteCreated('');setInviteProfiles([]);setInviteRole('caregiver');setInviteScope('limited');
     setInviteCapabilities([...DEFAULT_CARE_CAPABILITIES]);setModal('invite');
   }}><Plus size={16}/> Invite a caregiver</button>}</div>
   <p className="muted">{owner?'Full-circle caregivers can manage medication care for all current and new profiles. Limited caregivers get only selected care permissions.':'You can see who is in the circle; medication details remain limited to what the owner granted.'}</p>
   <div className="words-audience-confirm"><span><strong>Privacy boundary:</strong> No caregiver access level grants private journals, drafts, personal messages, or conversations automatically. Only the owner can change care access. Child and teen accounts remain read-only for medication records.</span></div>
   {(owner||active?.role==='caregiver')&&<section className="member-section">
    <h3 className="subsection-title">Circle members <span>{members.length.toString().padStart(2,'0')}</span></h3>
    {members.map(m=><div className="history-row" key={m.user_id}>
     <div><b>{m.name} {m.user_id===user.id?'(you)':''}</b><small>{m.role}{owner&&m.role==='caregiver'?' · '+(m.access_scope==='full'?'Full circle':'Limited access'):''}{owner&&m.email?' · '+m.email:''}</small></div>
     {owner&&m.role!=='owner'&&<div className="member-controls">
      <label>Account class<select aria-label={'Account classification for '+m.name} value={m.classification||'unverified'} disabled={saving} onChange={e=>void setMemberClassification(m.user_id,e.target.value as NonNullable<Member['classification']>)}><option value="unverified" disabled>Unverified</option><option value="adult">Adult</option><option value="teen">Teen</option><option value="child">Child</option></select></label>
      <button className="quiet small" onClick={()=>beginManageAccess(m)}>Manage access</button>
      <button className="quiet small" onClick={()=>{setMemberToRemove(m);setModal('remove');}}>Revoke access</button>
     </div>}
    </div>)}
   </section>}
   <div className="join-inline"><h3>Have another invitation?</h3><form onSubmit={joinHousehold}><input required autoComplete="off" value={inviteInput} onChange={e=>setInviteInput(e.target.value)} placeholder="Enter one-time code"/><button className="button outline" disabled={saving}>Join circle</button></form></div>
  </>}
 {page==='settings'&&<><PageTitle eyebrow="MAKE IT YOURS" title="Little preferences" subtitle="The details that make Carehold feel like your place."/><div className="setting-section"><div><h2>Appearance</h2><p>Light, dark, or let your device decide.</p></div><AppearanceSwitch theme={theme} setTheme={setTheme}/></div><div className="setting-section"><div><h2>Conversation prompts</h2><p>Choose the Words prompts that appear for you. This doesn't change care permissions.</p></div><div className="setting-audience">{active?.classification==='teen'||active?.classification==='child'?<p className="muted">A household administrator manages this account's Words audience.</p>:<AudienceField value={audience} onChange={next=>void saveAudience(next)}/>}</div></div><div className="setting-section notifications-section"><div><h2>Gentle reminders</h2><p>Opt-in device notifications with no medication or personal details on the lock screen. These are reminders, not a guaranteed medical alarm.</p><p className="notification-status">{pushConfig===null?'Checking notification configuration…':!pushConfig.configured?PUSH_UNAVAILABLE_MESSAGE:pushEnabled?`Reminders enabled · ${pushSubscriptionCount} registered device(s)`:'Reminders paused for this household.'}</p>{pushFeedback&&<p role="status" aria-live="polite" className={`notification-feedback ${pushFeedback.kind}`}>{pushFeedback.text}</p>}<div className="push-diagnostics" aria-live="polite"><span className="mono kicker">DELIVERY DIAGNOSTICS</span><p><strong>Browser permission:</strong> {typeof Notification==='undefined'?'Unsupported':Notification.permission}</p><p><strong>Service-worker push received:</strong> {pushTrace?(pushTrace.received?'Yes':'Not observed in this tab'):'No test sent yet'}</p><p><strong>Browser display requested:</strong> {pushTrace?(pushTrace.displayRequested?'Yes':pushTrace.displayError?'Failed':'Not observed yet'):'No test sent yet'}</p><p><strong>Push gateway accepted:</strong> {pushTrace?(pushTrace.accepted?'Yes':'Awaiting / failed'):'No test sent yet'}</p><p className="muted tiny">A browser display request does not guarantee that your device shows an alert. Check device notification settings and Focus/Do Not Disturb if local display succeeds but nothing appears.</p>{localNotificationFeedback&&<p className="notification-feedback info" role="status">{localNotificationFeedback}</p>}</div></div><div className="notification-actions"><button disabled={saving} className="button outline" onClick={pushEnabled?disablePush:enablePush}>{pushEnabled?<BellOff size={17}/>:<Bell size={17}/>} {pushEnabled?'Pause reminders':'Enable reminders'}</button>{pushEnabled&&pushConfig?.configured&&<button className="button outline" disabled={saving} onClick={()=>void testPush()}><Bell size={17}/> Send push test</button>}<button className="button outline" disabled={saving} onClick={()=>void testLocalNotification()}><Bell size={17}/> Test local display</button></div></div><div className="setting-section"><div><h2>Install Carehold</h2><p>Keep your circle a tap away with the matching icon on your home screen.</p></div><button className="button outline" onClick={install}><Plus size={17}/> Add to home screen</button></div><div className="setting-section"><div><h2>Auto-lock</h2><p>Carehold locks after 3 minutes without activity or 1 minute away from the app. Unlock quickly with your passkey.</p></div><button className="button outline" type="button" onClick={()=>lockNow()}><LockKeyhole size={17}/> Lock now</button></div><RecoveryReadiness userId={user.id}/><div className="setting-section"><div><h2>Account security</h2><p>Passkeys help keep your account protected. You can add another for a second device.</p></div><button className="button outline" onClick={addPasskey} disabled={saving}><KeyRound size={17}/> Add another passkey</button></div><div className="setting-section"><div><h2>About Carehold</h2><p>The story behind our icon and the values it represents.</p></div><a className="button outline setting-about-link" href={pagePath('about')} onClick={e=>followPageLink(e,'about')}>The Story Behind Our Icon <ArrowUpRight size={17}/></a></div><div className="setting-footer">carehold. — a place for the everyday things that matter.</div></>}
 {page==='about'&&<BrandStory onNavigateBack={e=>followPageLink(e,'settings')}/>}
 </main></div><nav className="mobile-nav" aria-label="Mobile navigation">{NAV_ITEMS.map(([id,label,Icon])=><a key={id as string} href={pagePath(id)} aria-current={page===id?'page':undefined} className={page===id?'active':''} onClick={e=>followPageLink(e,id)}><Icon size={20}/><span>{id==='circle'?'Circle':label}</span>{pageUnread(id)>0&&<span className="mobile-unread" aria-label={`${pageUnread(id)} unread`}>{pageUnread(id)>99?'99+':pageUnread(id)}</span>}</a>)}</nav></div>
 {modal&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="modal-sheet" role="dialog" aria-modal="true" aria-label="Carehold form"><div className="modal-top"><span className="form-index">CAREHOLD / {modal.toUpperCase()}</span><button className="icon-control" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={20}/></button></div>{modal==='profile'&&<><h2>Someone to care for<span>.</span></h2><p>People and pets each have their own independent medication records.</p><form onSubmit={saveProfile} className="form-stack"><label>Name<input autoFocus required maxLength={70} value={personName} onChange={e=>setPersonName(e.target.value)} placeholder="First name or nickname"/></label><label>Who is this?<select value={personKind} onChange={e=>setPersonKind(e.target.value as Person['kind'])}><option value="adult">Adult</option><option value="child">Child / teen</option><option value="pet">Pet</option></select></label><button className="button primary big" disabled={saving}>Add to circle <ArrowUpRight size={18}/></button></form></>}
 {modal==='med'&&<><h2>{pending.medication?'Adjust the plan':'Add a medication'}<span>.</span></h2><p>Enter the directions as prescribed. Carehold never suggests doses or changes them.</p><form className="form-stack" onSubmit={saveMed}><MedicationCatalogPicker key={medProfile+':'+(pending.medication?.id||'new')} profileId={medProfile} value={medForm.name}
   catalog={{catalogSource:medForm.catalogSource,catalogIdentifier:medForm.catalogIdentifier,normalizedName:medForm.normalizedName,brandName:medForm.brandName,productStrength:medForm.productStrength,dosageForm:medForm.dosageForm}}
   isPet={profiles.find(p=>p.id===medProfile)?.kind==='pet'} disabled={saving}
   onNameChange={name=>setMedForm(v=>({...v,name,catalogSource:null,catalogIdentifier:null,normalizedName:null,brandName:null,productStrength:null,dosageForm:null}))}
   onSelect={item=>setMedForm(v=>({...v,name:item.name,form:'',catalogSource:'rxterms',catalogIdentifier:item.conceptRxCui,normalizedName:item.name,brandName:item.brandName,productStrength:null,dosageForm:null}))}
   onProduct={(option,conceptRxCui)=>setMedForm(v=>({...v,form:option?'':v.form,catalogIdentifier:option?.rxCui??conceptRxCui,productStrength:option?.label??null,dosageForm:null}))}
   onManual={()=>setMedForm(v=>({...v,catalogSource:null,catalogIdentifier:null,normalizedName:null,brandName:null,productStrength:null,dosageForm:null}))}/>
   {medForm.catalogSource==='rxterms'?
   <p className="muted tiny">Catalog identification: {medForm.productStrength||medForm.name}. You only need to enter the actual prescribed dose and schedule below.</p>:
   <label>Form (optional)<input value={medForm.form} onChange={e=>setMedForm(v=>({...v,form:e.target.value}))} placeholder="Tablet, liquid, etc."/></label>}<label>Prescribed dose, including units<input required value={medForm.dose} onChange={e=>setMedForm(v=>({...v,dose:e.target.value}))} placeholder="As prescribed, e.g. one tablet"/></label><label>Instructions (optional)<textarea rows={2} value={medForm.instructions} onChange={e=>setMedForm(v=>({...v,instructions:e.target.value}))} placeholder="Copy label instructions without interpretation"/></label><label>How often?<select value={medForm.cadence} onChange={e=>setMedForm(v=>({...v,cadence:e.target.value,times:e.target.value==='prn'?[]:(v.times.length?v.times:['08:00'])}))}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="interval_days">Every N days</option><option value="prn">As needed (PRN)</option></select></label>
 {medForm.cadence==='weekdays'&&<div className="weekday-set" role="group" aria-label="Days of the week">{weekdayNames.map((d,i)=><button type="button" className={medForm.weekdays.includes(i)?'active':''} key={d} onClick={()=>setMedForm(v=>({...v,weekdays:v.weekdays.includes(i)?v.weekdays.filter(n=>n!==i):[...v.weekdays,i].sort()}))}>{d}</button>)}</div>}
 {medForm.cadence==='interval_days'&&<div className="two-col"><label>Repeat every (days)<input type="number" min={1} max={365} value={medForm.intervalDays} onChange={e=>setMedForm(v=>({...v,intervalDays:e.target.value}))}/></label><label>Anchor date<input type="date" value={medForm.anchorDate} onChange={e=>setMedForm(v=>({...v,anchorDate:e.target.value}))}/></label></div>}
 {medForm.cadence!=='prn'&&<div className="times-editor"><span className="form-label">Scheduled times</span>{medForm.times.map((t,i)=><div key={i} className="time-edit"><input aria-label={`Scheduled time ${i+1}`} type="time" required value={t} onChange={e=>setMedForm(v=>({...v,times:v.times.map((x,k)=>k===i?e.target.value:x)}))}/><button type="button" className="quiet small" onClick={()=>setMedForm(v=>({...v,times:v.times.filter((_,k)=>k!==i)}))} aria-label="Remove time"><Minus size={16}/></button></div>)}<button type="button" className="text-link" onClick={()=>setMedForm(v=>({...v,times:[...v.times,'20:00']}))}><Plus size={14}/> Another time</button></div>}
 <div className="two-col"><label>Start date<input required type="date" value={medForm.startDate} onChange={e=>setMedForm(v=>({...v,startDate:e.target.value}))}/></label><label>End date (optional)<input type="date" value={medForm.endDate} onChange={e=>setMedForm(v=>({...v,endDate:e.target.value}))}/></label></div><div className="two-col"><label>Prescriber / vet (optional)<input value={medForm.clinician} onChange={e=>setMedForm(v=>({...v,clinician:e.target.value}))}/></label><label>Refill note (optional)<input value={medForm.refillNote} onChange={e=>setMedForm(v=>({...v,refillNote:e.target.value}))}/></label></div><button className="button primary big" disabled={saving}>{saving?'Saving…':pending.medication?'Save changes':'Save medication'} <Check size={18}/></button></form></>}
 {modal==='dose'&&<><h2>Record with care<span>.</span></h2><p>Confirm the right person, medication, and actual outcome before saving.</p><div className="dose-confirm"><span className="form-index">YOU ARE RECORDING</span><h3>{pending.entry?.person||person?.display_name||'Selected person'}</h3><p>{pending.entry?.medicationName||pending.medication?.name}</p><strong>{pending.entry?.dose||pending.medication?.dose}</strong>{pending.entry&&<span className="mono tiny">SCHEDULED {pending.entry.date} AT {pending.entry.time} ({pending.entry.timezone})</span>}</div><form onSubmit={saveDose} className="form-stack"><span className="form-label">What actually happened?</span><div className="status-choices">{statuses.map(s=><button type="button" key={s} className={doseStatus===s?'chosen':''} onClick={()=>setDoseStatus(s)}>{statusNames[s]}</button>)}</div><label>When did this actually happen? (your device’s local time)<input required type="datetime-local" value={doseActualAt} onChange={e=>setDoseActualAt(e.target.value)}/></label><label>Note (optional)<textarea value={doseNote} onChange={e=>setDoseNote(e.target.value)} rows={2} placeholder="Anything helpful to remember"/></label><button className="button primary big" disabled={saving||!doseStatus}>{saving?'Recording…':doseStatus?'Confirm this record':'Select an outcome first'} <Check size={18}/></button><p className="fine-print">Recording is a factual observation—not medical advice. If unsure whether a dose was given, select “Not sure” rather than guessing.</p></form></>}
 {modal==='correct'&&<><h2>{correctionMode==='later'?'Record what happened later':'Correct a record'}<span>.</span></h2>
  <p>{correctionMode==='later'?'Add a later factual outcome to the same scheduled occurrence. The earlier status remains in history. This does not advise or authorize another dose.':'Correct a mistaken entry without erasing its original audit history.'}</p>
  <div className="dose-confirm"><strong>{pending.event?.med_name_snapshot||'Medication'}</strong>
   <p>Previous status: {pending.event?doseLabel(pending.event):''}</p></div>
  <form className="form-stack" onSubmit={correctDose}>
   <span className="form-label">What actually happened?</span>
   <div className="status-choices">{statuses.map(s=><button type="button" key={s}
    className={doseStatus===s&&!correctionKind?'chosen':''}
    onClick={()=>{setDoseStatus(s);setCorrectionKind(null);}}>{statusNames[s]}</button>)}</div>
   <button type="button" className={correctionKind==='not_administered'?'button dark':'button outline'}
    onClick={()=>{setDoseStatus('skipped');setCorrectionKind('not_administered');}}>
     Not administered — earlier record was entered in error
   </button>
   <p className="fine-print">“Not administered” corrects a mistaken log; it does not reset a dose for automatic re-administration. Review the actual administration history and prescription before any further administration.</p>
   <label>Actual date/time (your device’s local time)<input required type="datetime-local" value={doseActualAt} onChange={e=>setDoseActualAt(e.target.value)}/></label>
   <label>{correctionMode==='later'?'What happened since the earlier record?':'Why is the original record incorrect?'}
    <textarea required minLength={3} value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)} placeholder="Explain the observation factually"/></label>
   <button className="button primary big" disabled={saving||!doseStatus}>{saving?'Recording…':correctionMode==='later'?'Append later outcome':'Append correction'} <Check size={18}/></button>
  </form></>}
  {modal==='archive-med'&&pending.medication&&<><h2>Archive this medication?</h2>
   <p>“{pending.medication.name}” will leave upcoming schedules and Today. Its dose history and corrections stay intact. You can restore it later.</p>
   <form className="form-stack" onSubmit={archiveMedication}>
    <button type="submit" className="button primary big" disabled={saving}>Archive medication</button>
    <button type="button" className="button outline" onClick={()=>setModal(null)}>Keep active</button>
   </form></>}
  {modal==='archive-profile'&&pending.profile&&<><h2>Archive this person or pet?</h2>
   <p>“{pending.profile.display_name}” will leave active medication schedules and new-conversation suggestions. Old recorded doses and shared conversations remain. Archiving does not revoke the linked account's access to existing household content.</p>
   <form className="form-stack" onSubmit={archiveProfile}>
    <button type="submit" className="button primary big" disabled={saving}>Archive profile</button>
    <button type="button" className="button outline" onClick={()=>setModal(null)}>Keep active</button>
   </form></>}
  {modal==='remove'&&<><h2>Remove access<span>.</span></h2><p>This immediately revokes {memberToRemove?.name}'s household membership and medication grants. It does not erase the history of actions they recorded.</p><form className="form-stack" onSubmit={revokeMember}><button className="button primary big" disabled={saving}>Revoke access <Check size={18}/></button><button className="quiet" type="button" onClick={()=>setModal(null)}>Keep their access</button></form></>}
 {modal==='link'&&<><h2>Link an account<span>.</span></h2><p>Connect this medication profile to a person who already joined your circle. Linking identifies the person; it does not grant medication access or expose future private writing.</p><div className="dose-confirm"><span className="form-index">PROFILE</span><h3>{pending.profile?.display_name}</h3></div><form className="form-stack" onSubmit={saveLink}><label>Circle member<select value={linkUserId} onChange={e=>setLinkUserId(e.target.value)}><option value="">Not linked to an account</option>{members.map(m=><option value={m.user_id} key={m.user_id}>{m.name} ({m.email})</option>)}</select></label><p className="fine-print">Only existing household members can be linked. One account can be linked to one person per care circle. Existing permission grants remain unchanged.</p><button className="button primary big" disabled={saving}>{saving?'Saving…':'Save account link'} <Check size={17}/></button></form></>}{modal==='invite'&&<><h2>Invite with intention<span>.</span></h2><p>Share only the profiles needed. This invitation expires in 48 hours and works once.</p>{inviteCreated?<div className="invite-result"><label>One-time invitation code<textarea readOnly rows={3} value={inviteCreated}/></label><button className="button primary" onClick={()=>void copy(inviteCreated,'invite')}>{copyFeedback?.key==='invite'&&copyFeedback.success?<Check size={17}/>:<Copy size={17}/>} {copyFeedback?.key==='invite'&&copyFeedback.success?'Copied':'Copy code'}</button><span className={`copy-feedback ${copyFeedback?.key==='invite'&&!copyFeedback.success?'is-error':''}`} role="status" aria-live="polite">{copyFeedback?.key==='invite'?copyFeedback.message:''}</span><p className="fine-print">Share privately. The invitation is not emailed automatically. New recipients enter this code once during sign-up; it follows them into passkey setup. Existing users can accept it from the care circle.</p></div>:<form className="form-stack" onSubmit={createInvite}><label>Access type<select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'caregiver'|'member')}><option value="caregiver">Caregiver</option><option value="member">Household member</option></select></label><div className="form-label">Medication access for</div>{profiles.map(p=><label key={p.id} className="check-row"><input type="checkbox" checked={inviteProfiles.includes(p.id)} onChange={e=>setInviteProfiles(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))}/>{p.display_name} <span className="tiny muted">{p.kind}</span></label>)}<p className="fine-print">Selected profiles grant schedule viewing, administration recording, and history viewing—not medication editing or private communication access.</p><button className="button primary big" disabled={saving}>Create invitation <ArrowUpRight size={18}/></button></form>}</>}
 </section></div>}
 </>;
}
