import { makeAuth } from './auth';
import { localFrontendRedirect } from './local-frontend-redirect';
import type { CareEnv, SessionUser, ProfileRow, MedicationRow } from './types';
import { scheduledOn, localDate, localToInstant, occurrenceKey, validDate, validTime, timezoneValid, scheduleError, type Schedule } from '../shared/schedule';
import { canAccess,canUseCareProfile,validMemberClassification,validCapabilities,type MemberClassification,type Role,type Capability } from '../shared/policy';
import { validAudience, type Audience } from '../shared/audience';
import { sendPushNotification } from '@mmmike/web-push/send';
import {pushConfigured} from './push-config';
import {handleMessages} from './messages';
import {handlePrivateJournal} from './private-journal';
import {handlePrivateDrafts} from './private-drafts';
import {handleRecoveryMigration} from './recovery-migration';
import {handleRecoveryRotation} from './recovery-rotation';
import {handleWordSpaces} from './words-spaces';
import {CatalogError,normalizeMedicationSearch,searchCatalog,enforceCatalogRateLimit,parseMedicationCatalog,type MedicationCatalogMetadata} from './medication-catalog';

const dataHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
class ApiError extends Error { constructor(public code:number,message:string){super(message);} }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...dataHeaders,'Content-Type':'application/json; charset=utf-8'}});
const bad=(code:number,message:string):never=>{throw new ApiError(code,message);};
const trim=(v:unknown,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const required=(v:unknown,max=120)=>{const t=trim(v,max);if(!t)bad(400,'Please fill in all required fields.');return t;};
const uuid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const stamp=(v:unknown)=>{
  const time=typeof v==='string'?Date.parse(v):NaN;
  if(Number.isNaN(time))bad(400,'Enter a valid date and time.');
  if(time>Date.now()+5*60000||time<Date.now()-366*86400000)bad(400,'Administration time must be within the past year and not in the future.');
  return new Date(time).toISOString();
};
const sha256=async(v:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const isoDay=(s:unknown)=>{if(typeof s!=='string'||!validDate(s))bad(400,'Invalid calendar date.');return s as string;};
const jsonBody=async(req:Request):Promise<Record<string,unknown>>=>{
  if(!req.headers.get('content-type')?.startsWith('application/json'))bad(415,'Use JSON.');
  if(Number(req.headers.get('content-length')||0)>16000)bad(413,'Request too large.');
  const raw=await req.text();if(raw.length>16000)bad(413,'Request too large.');
  let obj:unknown;try{obj=JSON.parse(raw);}catch{bad(400,'Invalid JSON.');}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))bad(400,'Invalid payload.');
  return obj as Record<string,unknown>;
};
function checkRequest(req:Request,env:CareEnv) {
  if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return;
  const origin=req.headers.get('origin');
  const accepted=[env.APP_ORIGIN,new URL(req.url).origin];
  if(origin&&!accepted.includes(origin))bad(403,'Untrusted origin.');
  if(!req.url.includes('/api/auth/') && req.headers.get('x-carehold-request')!=='1')bad(403,'Missing request verification.');
}
async function getUser(req:Request,env:CareEnv):Promise<SessionUser> {
  const session=await makeAuth(env).api.getSession({headers:req.headers});
  if(!session?.user?.id)bad(401,'Please sign in.');
  return {id:session!.user.id,email:session!.user.email,name:session!.user.name};
}
async function requirePasskey(db:D1Database,userId:string) {
  const row=await db.prepare('SELECT id FROM passkey WHERE userId=? LIMIT 1').bind(userId).first();
  if(!row)bad(428,'Add a passkey before accessing household care.');
}
async function member(db:D1Database,householdId:string,userId:string):Promise<Role> {
  const row=await db.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?').bind(householdId,userId).first<{role:Role}>();
  if(!row)bad(403,'You do not have access to this household.');return row!.role;
}
async function isFullCircleCaregiver(db:D1Database,hid:string,uid:string):Promise<boolean>{
 const row=await db.prepare("SELECT access_scope FROM household_members WHERE household_id=? AND user_id=? AND role='caregiver'")
  .bind(hid,uid).first<{access_scope:'limited'|'full'}>();
 return row?.access_scope==='full';
}
async function classification(db:D1Database,hid:string,uid:string):Promise<MemberClassification>{
 const row=await db.prepare('SELECT classification FROM household_member_classes WHERE household_id=? AND user_id=?')
  .bind(hid,uid).first<{classification:MemberClassification}>();
 return row?.classification??'unverified';
}
async function profileAccess(db:D1Database,profileId:string,userId:string,capability:Capability):Promise<ProfileRow> {
  const p=await db.prepare('SELECT id,household_id,display_name,kind,archived_at,linked_user_id FROM profiles WHERE id=?').bind(profileId).first<ProfileRow>();
  if(!p)bad(404,'Profile not found.');
  const role=await member(db,p!.household_id,userId);
  if(capability==='manage_medication'||capability==='record_dose'){
   const minorElsewhere=await db.prepare("SELECT 1 FROM household_member_classes WHERE user_id=? AND classification IN ('child','teen') LIMIT 1")
    .bind(userId).first();
   if(minorElsewhere)bad(403,'Minor accounts cannot edit or record medications in any care circle.');
  }
  if((p as ProfileRow&{archived_at:string|null}).archived_at&&capability!=='view_history'&&capability!=='view_schedule')
   bad(409,'This profile is archived. Restore it before changing medications or recording doses.');
  const grants=await db.prepare('SELECT capability FROM profile_grants WHERE profile_id=? AND user_id=?').bind(profileId,userId).all<{capability:Capability}>();
  if(!canUseCareProfile(role,await classification(db,p!.household_id,userId),
   (grants.results||[]).map(x=>x.capability),capability,
   p!.kind==='adult'&&(p as ProfileRow&{linked_user_id?:string|null}).linked_user_id===userId,
   await isFullCircleCaregiver(db,p!.household_id,userId)))
   bad(403,'This profile is not shared with you for that action or your account class is read-only.');
  return p!;
}
async function owner(db:D1Database,householdId:string,userId:string) {
  if(await member(db,householdId,userId)!=='owner')bad(403,'Only a household owner can do this.');
  const minor=await db.prepare("SELECT 1 FROM household_member_classes WHERE user_id=? AND classification IN ('child','teen') LIMIT 1").bind(userId).first();
  if(minor)bad(403,'Minor accounts cannot administer a household.');
}
async function medication(db:D1Database,id:string):Promise<MedicationRow> {
  const med=await db.prepare('SELECT * FROM medications WHERE id=? AND archived_at IS NULL').bind(id).first<MedicationRow>();
  if(!med)bad(404,'Medication not found.');return med!;
}
function parseSchedule(b:Record<string,unknown>):{schedule:Schedule,times:string[]} {
  const schedule:Schedule={
    cadence:b.cadence as Schedule['cadence'],startDate:isoDay(b.startDate),
    endDate:b.endDate?isoDay(b.endDate):null,
    weekdays:Array.isArray(b.weekdays)?b.weekdays as number[]:[],
    intervalDays:b.intervalDays===undefined||b.intervalDays===null?undefined:Number(b.intervalDays),
    anchorDate:b.anchorDate?isoDay(b.anchorDate):undefined,
  };
  const e=scheduleError(schedule);if(e)bad(400,e);
  const times=(Array.isArray(b.times)?b.times:[]).map(t=>String(t));
  if(schedule.cadence!=='prn'&&(times.length<1||times.length>12))bad(400,'Add between 1 and 12 scheduled times.');
  if(schedule.cadence==='prn'&&times.length)bad(400,'As-needed medicines do not have scheduled times.');
  if(times.some(t=>!validTime(t))||new Set(times).size!==times.length)bad(400,'Times must be unique in HH:MM format.');
  return {schedule,times:times.sort()};
}
function catalogFields(b:Record<string,unknown>,name:string,old?:MedicationRow):MedicationCatalogMetadata{
 const previous=old?{
  name:old.name,catalogSource:old.catalog_source,catalogIdentifier:old.catalog_identifier,
  normalizedName:old.normalized_name,brandName:old.brand_name,
  productStrength:old.product_strength,dosageForm:old.dosage_form
 }:undefined;
 try{return parseMedicationCatalog(b,name,previous);}
 catch(e){if(e instanceof CatalogError)bad(e.status,e.message);throw e;}
}
function medSchedule(m:MedicationRow):Schedule {return {cadence:m.cadence,weekdays:JSON.parse(m.weekdays_json),intervalDays:m.interval_days??undefined,anchorDate:m.anchor_date??undefined,startDate:m.start_date,endDate:m.end_date};}
type InvitationRow={
 id:string;household_id:string;role:'member'|'caregiver';grants_json:string;access_scope:'limited'|'full';
 claimed_at:string|null;revoked_at:string|null;expires_at:string;
};
async function claimInvitation(db:D1Database,invitation:InvitationRow,userId:string) {
 if(invitation.claimed_at||invitation.revoked_at||invitation.expires_at<=now())bad(409,'This invitation is expired, revoked or already used.');
 const ts=now();
 const grants=JSON.parse(invitation.grants_json) as {profileId:string,capabilities:Capability[]}[];
 if(!Array.isArray(grants)||grants.some(g=>!g||!validCapabilities(g.capabilities)||typeof g.profileId!=='string'))bad(409,'Invitation permissions are invalid.');
 try {
  await db.batch([
   db.prepare('UPDATE invitations SET claimed_by=?,claimed_at=? WHERE id=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(userId,ts,invitation.id,ts),
   db.prepare('INSERT INTO household_members(household_id,user_id,role,joined_at,access_scope) SELECT household_id,?,role,?,access_scope FROM invitations WHERE id=? AND claimed_by=? AND claimed_at=?').bind(userId,ts,invitation.id,userId,ts),
   db.prepare('INSERT INTO household_member_classes(household_id,user_id,classification,updated_at) VALUES(?,?,?,?)').bind(invitation.household_id,userId,'unverified',ts),
   ...grants.flatMap(g=>g.capabilities.map(cap=>db.prepare(`INSERT INTO profile_grants(household_id,profile_id,user_id,capability,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM household_members WHERE household_id=? AND user_id=?)`).bind(invitation.household_id,g.profileId,userId,cap,ts,invitation.household_id,userId)))
  ]);
 } catch {
  bad(409,'Invitation cannot be accepted. It may have been used or this account already belongs to the household.');
 }
 const joined=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?').bind(invitation.household_id,userId).first();
 if(!joined)bad(409,'Invitation was already claimed.');
 return {joined:true,householdId:invitation.household_id};
}
async function handle(req:Request,env:CareEnv,ctx:ExecutionContext):Promise<Response> {
  const url=new URL(req.url), path=url.pathname,db=env.DB;
  checkRequest(req,env);
  const localRedirect=localFrontendRedirect(req,env.APP_ORIGIN);
  if(localRedirect)return localRedirect;
  if(path==='/api/health'&&req.method==='GET')return json({ok:true,product:'carehold'});
  // Content-free readiness probe; confirms D1 and the latest required tables.
  if(path==='/api/health/ready'&&req.method==='GET'){
    try{
      await Promise.all([
        db.prepare('SELECT 1 FROM user LIMIT 1').first(),
        db.prepare('SELECT 1 FROM message_account_recovery LIMIT 1').first(),
        db.prepare('SELECT 1 FROM private_draft_sync LIMIT 1').first(),
        db.prepare('SELECT 1 FROM account_key_migrations LIMIT 1').first(),
        db.prepare('SELECT 1 FROM account_recovery_rotations LIMIT 1').first(),
        db.prepare('SELECT 1 FROM account_recovery_rotation_journals LIMIT 1').first(),
        db.prepare('SELECT 1 FROM account_recovery_rotation_drafts LIMIT 1').first()
      ]);
      return json({ok:true,product:'carehold'});
    }catch{
      // Never return schema details, SQL errors or account information publicly.
      return json({ok:false,product:'carehold'},503);
    }
  }
  if(path.startsWith('/api/auth/')) {
    if(path==='/api/auth/sign-up/email'&&req.method==='POST') {
      if(!env.PILOT_ACCESS_CODE||env.PILOT_ACCESS_CODE.length<16)bad(503,'Pilot registration is not configured.');
      const code=trim(req.headers.get('x-carehold-access'),512);
      const invite=await db.prepare('SELECT id FROM invitations WHERE token_hash=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>? LIMIT 1')
        .bind(await sha256(code),now()).first();
      if((!code||await sha256(code)!==await sha256(env.PILOT_ACCESS_CODE))&&!invite)bad(403,'A valid pilot or household invitation code is required.');
      const payload=await jsonBody(req);
      if(typeof payload.email==='string')payload.email=payload.email.trim().toLowerCase();
      const headers=new Headers(req.headers);headers.delete('content-length');
      return makeAuth(env).handler(new Request(req.url,{method:'POST',headers,body:JSON.stringify(payload)}));
    }
    return makeAuth(env).handler(req);
  }
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
  const user=await getUser(req,env);
  if(path==='/api/me'&&req.method==='GET') {
    const [pk,persona,pending]=await Promise.all([
      db.prepare('SELECT id FROM passkey WHERE userId=? LIMIT 1').bind(user.id).first(),
      db.prepare('SELECT audience FROM account_audiences WHERE user_id=?').bind(user.id).first<{audience:Audience}>(),
      db.prepare('SELECT invitation_id FROM pending_household_invites WHERE user_id=?').bind(user.id).first()
    ]);
    return json({user,hasPasskey:!!pk,audience:persona?.audience??null,pendingInvitation:!!pending});
  }
  // Initial audience selection and invitation staging are non-privileged onboarding.
  // They do not grant household membership and do not bypass the passkey gate.
  if(path==='/api/onboarding'&&req.method==='POST') {
    const alreadyJoined=await db.prepare('SELECT 1 FROM household_members WHERE user_id=? LIMIT 1').bind(user.id).first();
     if(alreadyJoined)bad(403,'Onboarding cannot change the audience of an existing household member.');
     const b=await jsonBody(req);
    if(!validAudience(b.audience))bad(400,'Choose parent, child or teen.');
    const inviteCode=trim(b.invitationCode,512),ts=now();
    let invitationId:string|null=null;
    if(inviteCode) {
      const invite=await db.prepare('SELECT id FROM invitations WHERE token_hash=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(await sha256(inviteCode),ts).first<{id:string}>();
      const pilotValid=env.PILOT_ACCESS_CODE&&await sha256(inviteCode)===await sha256(env.PILOT_ACCESS_CODE);
      if(!invite&&!pilotValid)bad(403,'That pilot or household invitation is invalid or expired.');
      invitationId=invite?.id??null;
    }
    const changes=[db.prepare(`INSERT INTO account_audiences(user_id,audience,updated_at) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET audience=excluded.audience,updated_at=excluded.updated_at`).bind(user.id,b.audience,ts)];
    if(invitationId)changes.push(db.prepare(`INSERT INTO pending_household_invites(user_id,invitation_id,created_at) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET invitation_id=excluded.invitation_id,created_at=excluded.created_at`).bind(user.id,invitationId,ts));
    await db.batch(changes);
    return json({audience:b.audience,pendingInvitation:!!invitationId});
  }
  await requirePasskey(db,user.id);
   if(path.startsWith('/api/recovery-rotation/'))return handleRecoveryRotation(req,env,user);
   if(path.startsWith('/api/messages/recovery/migration'))return handleRecoveryMigration(req,env,user);
   if(path.startsWith('/api/messages/'))return handleMessages(req,env,user,ctx);
   if(path==='/api/private-journal'||path.startsWith('/api/private-journal/'))return handlePrivateJournal(req,env,user);
   if(path.startsWith('/api/private-drafts/'))return handlePrivateDrafts(req,env,user);
   if(path==='/api/words/people'||path==='/api/words/push-preference'||path==='/api/words/spaces'||path.startsWith('/api/words/spaces/')||path==='/api/activity'||path==='/api/activity/seen')return handleWordSpaces(req,env,user,ctx);
  if(path==='/api/me/audience'&&req.method==='POST') {
    const restricted=await db.prepare("SELECT 1 FROM household_member_classes WHERE user_id=? AND classification IN ('teen','child') LIMIT 1").bind(user.id).first();
    if(restricted)bad(403,'A household administrator must manage a minor’s account classification and Words audience.');
    const b=await jsonBody(req);
    if(!validAudience(b.audience))bad(400,'Choose parent, child or teen.');
    await db.prepare(`INSERT INTO account_audiences(user_id,audience,updated_at) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET audience=excluded.audience,updated_at=excluded.updated_at`).bind(user.id,b.audience,now()).run();
    return json({audience:b.audience});
  }
  if(path==='/api/invitations/accept-pending'&&req.method==='POST') {
    const pending=await db.prepare(`SELECT i.* FROM pending_household_invites p JOIN invitations i ON i.id=p.invitation_id WHERE p.user_id=?`).bind(user.id).first<InvitationRow>();
    if(!pending)throw new ApiError(404,'No pending household invitation.');
    const joined=await claimInvitation(db,pending,user.id);
    await db.prepare('DELETE FROM pending_household_invites WHERE user_id=?').bind(user.id).run();
    return json(joined);
  }
  if(path==='/api/households'&&req.method==='GET') {
    const h=await db.prepare(`SELECT h.id,h.name,h.timezone,m.role,COALESCE(c.classification,'unverified') classification FROM households h JOIN household_members m ON m.household_id=h.id LEFT JOIN household_member_classes c ON c.household_id=m.household_id AND c.user_id=m.user_id WHERE m.user_id=? ORDER BY h.created_at`).bind(user.id).all();
    return json({households:h.results});
  }
  if(path==='/api/households'&&req.method==='POST') {
    const b=await jsonBody(req),name=required(b.name,80),zone=trim(b.timezone,64)||'America/New_York';
    if(!timezoneValid(zone))bad(400,'Choose a valid timezone.');
    const account=await db.prepare('SELECT audience FROM account_audiences WHERE user_id=?').bind(user.id).first<{audience:Audience}>();
    if(account?.audience!=='parent')bad(403,'Only a parent or caregiver can start a care circle in this pilot.');
     const minor=await db.prepare("SELECT 1 FROM household_member_classes WHERE user_id=? AND classification IN ('teen','child') LIMIT 1").bind(user.id).first();
     if(minor)bad(403,'Minors cannot create an administrative care circle.');
    const id=uuid(),ts=now();
    await db.batch([
      db.prepare('INSERT INTO households(id,name,timezone,created_by,created_at) VALUES(?,?,?,?,?)').bind(id,name,zone,user.id,ts),
      db.prepare('INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES(?,?,?,?)').bind(id,user.id,'owner',ts),
      db.prepare('INSERT INTO household_member_classes(household_id,user_id,classification,assigned_by,updated_at) VALUES(?,?,?,?,?)').bind(id,user.id,'adult',user.id,ts),
    ]);
    return json({id,name,timezone:zone},201);
  }
  // Identity association is distinct from authorization. The member can
  // learn only which profile is linked to their own account, not its care data.
  // Private Words is a LOCAL-ONLY prototype. Return minimal display names
  // only to authorized household members, and never journal content or email.
  // Non-owners can preview sharing with household owners, not other minors.
  if(path==='/api/words/recipient-options'&&req.method==='GET'){
    const hid=required(url.searchParams.get('householdId'));
    const viewerRole=await member(db,hid,user.id);
    const rows=await db.prepare(`SELECT u.id,u.name FROM household_members hm
      JOIN user u ON u.id=hm.user_id
      WHERE hm.household_id=? AND hm.user_id<>?
      AND (?='owner' OR hm.role='owner')
      ORDER BY hm.joined_at LIMIT 30`).bind(hid,user.id,viewerRole)
      .all<{id:string,name:string}>();
    return json({recipients:rows.results||[]});
  }
  if(path==='/api/me/linked-profile'&&req.method==='GET'){
    const hid=required(url.searchParams.get('householdId'));
    const role=await member(db,hid,user.id);
    const linked=await db.prepare(`SELECT id,display_name,kind FROM profiles
      WHERE household_id=? AND linked_user_id=? AND archived_at IS NULL LIMIT 1`).bind(hid,user.id)
      .first<{id:string,display_name:string,kind:'adult'|'child'}>();
    if(!linked)return json({profile:null});
    const grants=await db.prepare('SELECT capability FROM profile_grants WHERE profile_id=? AND user_id=?')
      .bind(linked.id,user.id).all<{capability:Capability}>();
    const values=(grants.results||[]).map(g=>g.capability);
    const accountClass=await classification(db,hid,user.id),full=await isFullCircleCaregiver(db,hid,user.id);
    return json({profile:{id:linked.id,displayName:linked.display_name,kind:linked.kind,
      canViewSchedule:canUseCareProfile(role,accountClass,values,'view_schedule',linked.kind==='adult',full),
      canRecordDose:canUseCareProfile(role,accountClass,values,'record_dose',linked.kind==='adult',full),
      canViewHistory:canUseCareProfile(role,accountClass,values,'view_history',linked.kind==='adult',full)}});
  }
  if(path==='/api/profiles'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId')),role=await member(db,hid,user.id);
    const includeArchived=role==='owner'&&url.searchParams.get('includeArchived')==='1';
    const full=await isFullCircleCaregiver(db,hid,user.id);
    const accountClass=await classification(db,hid,user.id);
    const results=await db.prepare(`SELECT p.id,p.display_name,p.kind,p.household_id,p.archived_at,
      CASE WHEN ?='owner' THEN p.linked_user_id ELSE NULL END AS linked_user_id,
      CASE WHEN p.linked_user_id=? THEN 1 ELSE 0 END AS is_self
      FROM profiles p
      WHERE p.household_id=? AND (?=1 OR p.archived_at IS NULL) AND (?='owner' OR ?=1 OR EXISTS
        (SELECT 1 FROM profile_grants g WHERE g.profile_id=p.id AND g.user_id=? AND g.capability='view_schedule') OR (p.kind='adult' AND p.linked_user_id=? AND EXISTS(SELECT 1 FROM household_member_classes c WHERE c.household_id=p.household_id AND c.user_id=? AND c.classification='adult')))
      ORDER BY p.archived_at IS NOT NULL,p.created_at`).bind(role,user.id,hid,includeArchived?1:0,role,full?1:0,user.id,user.id,user.id).all<ProfileRow&{is_self:number;archived_at:string|null}>();
    const visible=await Promise.all((results.results||[]).map(async p=>{
      const grants=await db.prepare('SELECT capability FROM profile_grants WHERE profile_id=? AND user_id=?')
        .bind(p.id,user.id).all<{capability:Capability}>();
      const values=(grants.results||[]).map(x=>x.capability),self=p.kind==='adult'&&p.is_self===1;
      return {...p,
        can_manage_medication:canUseCareProfile(role,accountClass,values,'manage_medication',self,full),
        can_record_dose:canUseCareProfile(role,accountClass,values,'record_dose',self,full)};
    }));
    return json({profiles:visible});
  }
  if(path==='/api/profiles'&&req.method==='POST') {
    const b=await jsonBody(req),hid=required(b.householdId),name=required(b.name,70),kind=b.kind;
    await owner(db,hid,user.id);
    if(!['adult','child','pet'].includes(String(kind)))bad(400,'Select adult, child or pet.');
    const id=uuid();await db.prepare('INSERT INTO profiles(id,household_id,display_name,kind,created_at) VALUES(?,?,?,?,?)').bind(id,hid,name,kind,now()).run();
    return json({id,display_name:name,kind,household_id:hid},201);
  }
  const profileArchive=path.match(/^\/api\/profiles\/([0-9a-f-]+)\/(archive|restore)$/);
  if(profileArchive&&req.method==='POST'){
    const profile=await db.prepare('SELECT id,household_id,archived_at FROM profiles WHERE id=?')
      .bind(profileArchive[1]).first<{id:string,household_id:string,archived_at:string|null}>();
    if(!profile)bad(404,'Profile not found.');
    await owner(db,profile!.household_id,user.id);
    const archive=profileArchive[2]==='archive';
    if(Boolean(profile!.archived_at)===archive)return json({archived:archive,unchanged:true});
    const when=archive?now():null;
    await db.prepare('UPDATE profiles SET archived_at=? WHERE id=? AND archived_at IS ?')
      .bind(when,profile!.id,profile!.archived_at).run();
    return json({archived:archive});
  }
  // Profile identity does not grant schedule, history or future message access.
  const profileLink=path.match(/^\/api\/profiles\/([0-9a-f-]+)\/linked-account$/);
  if(profileLink&&req.method==='PUT') {
    const p=await db.prepare(`SELECT id,household_id,kind,linked_user_id FROM profiles
      WHERE id=? AND archived_at IS NULL`).bind(profileLink[1])
      .first<{id:string,household_id:string,kind:'adult'|'child'|'pet',linked_user_id:string|null}>();
    if(!p)bad(404,'Profile not found.');
    await owner(db,p!.household_id,user.id);
    if(p!.kind==='pet')bad(400,'Pets cannot be linked to human accounts.');
    const b=await jsonBody(req),nextId=b.userId===null?null:required(b.userId);
    if(nextId) {
      const found=await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND user_id=?')
        .bind(p!.household_id,nextId).first();
      if(!found)bad(400,'Select an existing member of this care circle.');
    }
    if(p!.linked_user_id===nextId)return json({linkedUserId:nextId,unchanged:true});
    if(p!.linked_user_id&&nextId)bad(409,'Unlink the existing account first.');
    const ts=now();
    try {
      await db.batch([
        db.prepare(`INSERT INTO profile_link_changes(id,household_id,profile_id,previous_user_id,next_user_id,changed_by,changed_at)
          VALUES(?,?,?,?,?,?,?)`).bind(uuid(),p!.household_id,p!.id,p!.linked_user_id,nextId,user.id,ts),
        db.prepare('UPDATE profiles SET linked_user_id=? WHERE id=? AND household_id=? AND archived_at IS NULL')
          .bind(nextId,p!.id,p!.household_id)
      ]);
    } catch(err) {
      if(String(err).includes('UNIQUE constraint'))bad(409,'That account is already linked to another profile in this circle.');
      throw err;
    }
    return json({linkedUserId:nextId,linked:true});
  }
  if(path==='/api/medications/search'&&req.method==='GET') {
     // Search is allowed only for an account entitled to manage this profile.
     const pid=required(url.searchParams.get('profileId'));
     await profileAccess(db,pid,user.id,'manage_medication');
     try{
       const query=normalizeMedicationSearch(url.searchParams.get('q'));
       await enforceCatalogRateLimit(db,user.id);
       const results=await searchCatalog(query);
       return json({source:'rxterms',results});
     }catch(e){if(e instanceof CatalogError)bad(e.status,e.message);throw e;}
   }
   if(path==='/api/medications'&&req.method==='GET') {
    const pid=required(url.searchParams.get('profileId'));await profileAccess(db,pid,user.id,'view_schedule');
    const includeArchived=url.searchParams.get('includeArchived')==='1';
    const meds=await db.prepare('SELECT * FROM medications WHERE profile_id=? AND (?=1 OR archived_at IS NULL) ORDER BY archived_at IS NOT NULL,name').bind(pid,includeArchived?1:0).all<MedicationRow>();
    const withTimes=await Promise.all((meds.results||[]).map(async m=>({
      ...m,weekdays:JSON.parse(m.weekdays_json),times:(await db.prepare('SELECT hhmm FROM medication_times WHERE medication_id=? ORDER BY hhmm').bind(m.id).all<{hhmm:string}>()).results.map(x=>x.hhmm)
    })));
    return json({medications:withTimes});
  }
  if(path==='/api/medications'&&req.method==='POST') {
    const b=await jsonBody(req),pid=required(b.profileId),name=required(b.name,150),dose=required(b.dose,100);
    await profileAccess(db,pid,user.id,'manage_medication');
    const {schedule,times}=parseSchedule(b),id=uuid(),ts=now(),catalog=catalogFields(b,name);
    const queries=[db.prepare(`INSERT INTO medications(id,profile_id,name,form,dose,instructions,cadence,weekdays_json,interval_days,anchor_date,start_date,end_date,clinician,refill_note,created_at,updated_at,catalog_source,catalog_identifier,normalized_name,brand_name,product_strength,dosage_form)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,pid,name,trim(b.form),dose,trim(b.instructions,2000),schedule.cadence,JSON.stringify(schedule.weekdays||[]),schedule.intervalDays??null,schedule.anchorDate??null,schedule.startDate,schedule.endDate??null,trim(b.clinician),trim(b.refillNote),ts,ts,catalog.catalogSource,catalog.catalogIdentifier,catalog.normalizedName,catalog.brandName,catalog.productStrength,catalog.dosageForm),
      ...times.map(t=>db.prepare('INSERT INTO medication_times(medication_id,hhmm) VALUES(?,?)').bind(id,t)),
      db.prepare('INSERT INTO medication_changes(id,medication_id,changed_by,changed_at,before_json,after_json) VALUES(?,?,?,?,?,?)').bind(uuid(),id,user.id,ts,null,JSON.stringify({...b,...catalog,times}))];
    await db.batch(queries);return json({id},201);
  }
  const medArchive=path.match(/^\/api\/medications\/([0-9a-f-]+)\/(archive|restore)$/);
  if(medArchive&&req.method==='POST') {
    const old=await db.prepare('SELECT * FROM medications WHERE id=?').bind(medArchive[1]).first<MedicationRow>();
    if(!old)bad(404,'Medication not found.');
    await profileAccess(db,old!.profile_id,user.id,'manage_medication');
    const shouldArchive=medArchive[2]==='archive';
    if(Boolean(old!.archived_at)===shouldArchive)return json({archived:shouldArchive,unchanged:true});
    const when=now(),updated={...old,archived_at:shouldArchive?when:null,updated_at:when};
    await db.batch([
      db.prepare('UPDATE medications SET archived_at=?,updated_at=? WHERE id=? AND archived_at IS ?')
        .bind(updated.archived_at,when,old!.id,old!.archived_at),
      db.prepare('INSERT INTO medication_changes(id,medication_id,changed_by,changed_at,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(uuid(),old!.id,user.id,when,JSON.stringify(old),JSON.stringify(updated))
    ]);
    return json({archived:shouldArchive});
  }
  const medMatch=path.match(/^\/api\/medications\/([0-9a-f-]+)$/);
  if(medMatch&&req.method==='PATCH') {
    const old=await medication(db,medMatch[1]);await profileAccess(db,old.profile_id,user.id,'manage_medication');
    const b=await jsonBody(req),{schedule,times}=parseSchedule(b),ts=now(),name=required(b.name,150),dose=required(b.dose,100),catalog=catalogFields(b,name,old);
    const before=await db.prepare('SELECT hhmm FROM medication_times WHERE medication_id=?').bind(old.id).all();
    await db.batch([
      db.prepare(`UPDATE medications SET name=?,form=?,dose=?,instructions=?,cadence=?,weekdays_json=?,interval_days=?,anchor_date=?,start_date=?,end_date=?,clinician=?,refill_note=?,updated_at=?,catalog_source=?,catalog_identifier=?,normalized_name=?,brand_name=?,product_strength=?,dosage_form=? WHERE id=?`).bind(name,trim(b.form),dose,trim(b.instructions,2000),schedule.cadence,JSON.stringify(schedule.weekdays||[]),schedule.intervalDays??null,schedule.anchorDate??null,schedule.startDate,schedule.endDate??null,trim(b.clinician),trim(b.refillNote),ts,catalog.catalogSource,catalog.catalogIdentifier,catalog.normalizedName,catalog.brandName,catalog.productStrength,catalog.dosageForm,old.id),
      db.prepare('DELETE FROM medication_times WHERE medication_id=?').bind(old.id),
      ...times.map(t=>db.prepare('INSERT INTO medication_times(medication_id,hhmm) VALUES(?,?)').bind(old.id,t)),
      db.prepare('INSERT INTO medication_changes(id,medication_id,changed_by,changed_at,before_json,after_json) VALUES(?,?,?,?,?,?)').bind(uuid(),old.id,user.id,ts,JSON.stringify({...old,times:before.results.map((x:any)=>x.hhmm)}),JSON.stringify({...b,...catalog,times}))
    ]);
    return json({updated:true});
  }
  if(path==='/api/today'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId')),role=await member(db,hid,user.id);
    const household=await db.prepare('SELECT timezone FROM households WHERE id=?').bind(hid).first<{timezone:string}>();
    const date=isoDay(url.searchParams.get('date')||localDate(new Date(),household!.timezone));
     const accountClass=await classification(db,hid,user.id);
     const full=await isFullCircleCaregiver(db,hid,user.id);
     const recordGrants=await db.prepare("SELECT profile_id FROM profile_grants WHERE user_id=? AND capability='record_dose'")
      .bind(user.id).all<{profile_id:string}>();
     const writableProfiles=new Set((recordGrants.results||[]).map(g=>g.profile_id));
    const rows=await db.prepare(`SELECT m.*,p.display_name,p.kind,p.household_id,p.linked_user_id FROM medications m
      JOIN profiles p ON p.id=m.profile_id
      WHERE p.household_id=? AND p.archived_at IS NULL AND m.archived_at IS NULL
      AND (?='owner' OR ?=1 OR EXISTS(SELECT 1 FROM profile_grants g WHERE g.profile_id=p.id AND g.user_id=? AND g.capability='view_schedule') OR (p.kind='adult' AND p.linked_user_id=? AND EXISTS(SELECT 1 FROM household_member_classes c WHERE c.household_id=p.household_id AND c.user_id=? AND c.classification='adult')))`).bind(hid,role,full?1:0,user.id,user.id,user.id).all<MedicationRow&ProfileRow>();
    const entries:unknown[]=[];
    for(const m of rows.results||[]) {
      if(!scheduledOn(medSchedule(m),date))continue;
      const times=await db.prepare('SELECT hhmm FROM medication_times WHERE medication_id=? ORDER BY hhmm').bind(m.id).all<{hhmm:string}>();
      for(const x of times.results||[]) {
        const key=occurrenceKey(m.id,date,x.hhmm);
        const event=await db.prepare(`SELECT e.id,e.event_type,e.occurred_at,e.recorded_at,e.actor_user_id,e.note,e.supersedes_event_id,
           e.correction_kind,e.med_name_snapshot,e.dose_snapshot,e.occurrence_key,e.scheduled_date,e.scheduled_time
           FROM dose_events e
          WHERE e.occurrence_key=? AND NOT EXISTS(SELECT 1 FROM dose_events n WHERE n.supersedes_event_id=e.id) LIMIT 1`).bind(key).first();
        const due=localToInstant(date,x.hhmm,household!.timezone);
        entries.push({key,date,time:x.hhmm,timezone:household!.timezone,dueAt:due?.toISOString()??null,
          medicationId:m.id,medicationName:m.name,dose:m.dose,instructions:m.instructions,profileId:m.profile_id,
          person:m.display_name,kind:m.kind,event,
           canRecordDose:canUseCareProfile(role,accountClass,writableProfiles.has(m.profile_id)?['record_dose']:[],
            'record_dose',m.kind==='adult'&&(m as MedicationRow&ProfileRow&{linked_user_id?:string|null}).linked_user_id===user.id,full)});
      }
    }
    return json({date,timezone:household!.timezone,entries});
  }
  if(path==='/api/administrations'&&req.method==='POST') {
    const b=await jsonBody(req),m=await medication(db,required(b.medicationId)),p=await profileAccess(db,m.profile_id,user.id,'record_dose');
    const type=b.eventType;
    if(!['given','skipped','refused','uncertain','missed'].includes(String(type)))bad(400,'Choose an administration status.');
    const date=m.cadence==='prn'?null:isoDay(b.date),hhmm=m.cadence==='prn'?null:required(b.time,5);
    if(m.cadence!=='prn') {
      if(!validTime(hhmm!)||!scheduledOn(medSchedule(m),date!))bad(409,'This time is not on the current schedule.');
      const exists=await db.prepare('SELECT 1 FROM medication_times WHERE medication_id=? AND hhmm=?').bind(m.id,hhmm).first();
      if(!exists)bad(409,'This time is not on the current schedule.');
    }
    const zone=(await db.prepare('SELECT timezone FROM households WHERE id=?').bind(p.household_id).first<{timezone:string}>())!.timezone;
    const id=uuid(),idempotency=required(b.idempotencyKey,120),key=date?occurrenceKey(m.id,date,hhmm!):null,occurred= b.occurredAt?stamp(b.occurredAt):now(),ts=now();
    try {
      await db.prepare(`INSERT INTO dose_events(id,household_id,profile_id,medication_id,occurrence_key,scheduled_date,scheduled_time,schedule_timezone,event_type,med_name_snapshot,dose_snapshot,occurred_at,recorded_at,actor_user_id,note,supersedes_event_id,idempotency_key)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,p.household_id,p.id,m.id,key,date,hhmm,zone,type,m.name,m.dose,occurred,ts,user.id,trim(b.note,1000),null,idempotency).run();
    } catch(err) {
      const existing=await db.prepare('SELECT id,medication_id,actor_user_id,event_type,occurrence_key FROM dose_events WHERE idempotency_key=?').bind(idempotency).first<{id:string,medication_id:string,actor_user_id:string,event_type:string,occurrence_key:string|null}>();
      if(existing&&existing.actor_user_id===user.id&&existing.medication_id===m.id&&existing.event_type===type&&existing.occurrence_key===key)return json({id:existing.id,replayed:true});
      // Catch uniqueness conflict only. Unexpected DB failures must not be disguised as double-dose warning.
      if(String(err).includes('UNIQUE constraint'))bad(409,'This scheduled dose already has a record. Review it before recording anything else.');
      throw err;
    }
    return json({id,recordedAt:ts},201);
  }
  if(path==='/api/history'&&req.method==='GET') {
    const pid=required(url.searchParams.get('profileId'));await profileAccess(db,pid,user.id,'view_history');
    const results=await db.prepare(`SELECT e.id,e.medication_id,e.med_name_snapshot,e.dose_snapshot,e.occurrence_key,e.scheduled_date,e.scheduled_time,e.schedule_timezone,e.event_type,e.occurred_at,e.recorded_at,e.actor_user_id,u.name actor_name,e.note,e.supersedes_event_id,e.correction_kind,
       CASE WHEN EXISTS(SELECT 1 FROM dose_events next WHERE next.supersedes_event_id=e.id) THEN 0 ELSE 1 END is_current
      FROM dose_events e JOIN user u ON u.id=e.actor_user_id WHERE e.profile_id=? ORDER BY e.recorded_at DESC LIMIT 200`).bind(pid).all();
    return json({events:results.results});
  }
  const correction=path.match(/^\/api\/administrations\/([0-9a-f-]+)\/correct$/);
  if(correction&&req.method==='POST') {
    const prev=await db.prepare('SELECT * FROM dose_events WHERE id=?').bind(correction[1]).first<any>();
    if(!prev)bad(404,'Record not found.');
    await profileAccess(db,prev.profile_id,user.id,'record_dose');await profileAccess(db,prev.profile_id,user.id,'view_history');
    const b=await jsonBody(req),reason=required(b.reason,500),status=b.eventType;
    const correctionKind=b.correctionKind===null||b.correctionKind===undefined?null:b.correctionKind;
    if(correctionKind!==null&&correctionKind!=='not_administered')bad(400,'Invalid correction classification.');
    if(correctionKind==='not_administered'&&status!=='skipped')
      bad(400,'A not-administered correction must have the skipped status.');
    if(!['given','skipped','refused','uncertain','missed'].includes(String(status)))bad(400,'Choose a corrected status.');
    const id=uuid(),ts=now();
    try {
      await db.prepare(`INSERT INTO dose_events(id,household_id,profile_id,medication_id,occurrence_key,scheduled_date,scheduled_time,schedule_timezone,event_type,med_name_snapshot,dose_snapshot,occurred_at,recorded_at,actor_user_id,note,supersedes_event_id,idempotency_key,correction_kind)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,prev.household_id,prev.profile_id,prev.medication_id,prev.occurrence_key,prev.scheduled_date,prev.scheduled_time,prev.schedule_timezone,status,prev.med_name_snapshot,prev.dose_snapshot,b.occurredAt?stamp(b.occurredAt):prev.occurred_at,ts,user.id,reason,prev.id,required(b.idempotencyKey,120),correctionKind).run();
    } catch(err) {
      const replay=await db.prepare('SELECT id FROM dose_events WHERE idempotency_key=? AND actor_user_id=?').bind(b.idempotencyKey,user.id).first<{id:string}>();
      if(replay)return json({id:replay.id,replayed:true});
      if(String(err).includes('UNIQUE constraint'))bad(409,'This record has already been corrected. Refresh history first.');
      throw err;
    }
    return json({id,corrected:true},201);
  }
  if(path==='/api/members'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId'));await owner(db,hid,user.id);
    const result=await db.prepare(`SELECT hm.user_id,hm.role,u.name,u.email,COALESCE(mc.classification,'unverified') classification FROM household_members hm JOIN user u ON u.id=hm.user_id LEFT JOIN household_member_classes mc ON mc.household_id=hm.household_id AND mc.user_id=hm.user_id
      WHERE hm.household_id=? ORDER BY hm.joined_at`).bind(hid).all();
    return json({members:result.results});
  }
  const memberClass=path.match(/^\/api\/members\/([0-9a-zA-Z_-]+)\/classification$/);
   if(memberClass&&req.method==='PATCH'){
    const b=await jsonBody(req),hid=required(b.householdId);
    await owner(db,hid,user.id);
    if(!validMemberClassification(b.classification)||b.classification==='unverified')
     bad(400,'Choose Adult, Teen, or Child.');
    if(memberClass[1]===user.id)bad(403,'Owners cannot reclassify themselves.');
    const target=await db.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?')
     .bind(hid,memberClass[1]).first<{role:Role}>();
    if(!target)throw new ApiError(404,'Member not found.');
    if(target.role==='owner')bad(403,'Owner classification is fixed as Adult.');
    const previous=await classification(db,hid,memberClass[1]);
    if(previous===b.classification)return json({classification:previous,unchanged:true});
    const ts=now();
    const writes=[
     db.prepare('UPDATE household_member_classes SET classification=?,assigned_by=?,updated_at=? WHERE household_id=? AND user_id=?')
      .bind(b.classification,user.id,ts,hid,memberClass[1]),
     db.prepare('INSERT INTO household_member_class_changes(id,household_id,user_id,previous_class,next_class,changed_by,changed_at) VALUES(?,?,?,?,?,?,?)')
      .bind(uuid(),hid,memberClass[1],previous,b.classification,user.id,ts)
    ];
    if(b.classification==='teen'||b.classification==='child'){
     writes.push(db.prepare('INSERT INTO account_audiences(user_id,audience,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET audience=excluded.audience,updated_at=excluded.updated_at')
      .bind(memberClass[1],b.classification,ts));
    }
    await db.batch(writes);
    return json({classification:b.classification});
   }
   const memberDelete=path.match(/^\/api\/members\/([0-9a-zA-Z_-]+)$/);
  if(memberDelete&&req.method==='DELETE') {
    const hid=required(url.searchParams.get('householdId'));await owner(db,hid,user.id);
    if(memberDelete[1]===user.id)bad(400,'You cannot remove your own owner access.');
    const other=await db.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?').bind(hid,memberDelete[1]).first<{role:Role}>();
    if(!other)throw new ApiError(404,'Member not found.');
    if(other.role==='owner')bad(403,'Cannot revoke another owner from this route.');
    // A revoked member must no longer remain linked to an active profile.
    const linked=await db.prepare('SELECT id FROM profiles WHERE household_id=? AND linked_user_id=?')
      .bind(hid,memberDelete[1]).all<{id:string}>();
    const ts=now();
    await db.batch([
      ...linked.results.map(profile=>db.prepare(`INSERT INTO profile_link_changes
         (id,household_id,profile_id,previous_user_id,next_user_id,changed_by,changed_at)
         VALUES(?,?,?,?,?,?,?)`).bind(uuid(),hid,profile.id,memberDelete[1],null,user.id,ts)),
      db.prepare('UPDATE profiles SET linked_user_id=NULL WHERE household_id=? AND linked_user_id=?').bind(hid,memberDelete[1]),
      db.prepare("UPDATE direct_threads SET pair_key='revoked:'||id WHERE household_id=? AND id IN (SELECT thread_id FROM direct_thread_members WHERE user_id=?)").bind(hid,memberDelete[1]),
       db.prepare('DELETE FROM direct_thread_members WHERE user_id=? AND thread_id IN (SELECT id FROM direct_threads WHERE household_id=?)').bind(memberDelete[1],hid),
       db.prepare('DELETE FROM shared_word_participants WHERE user_id=? AND space_id IN (SELECT id FROM shared_word_spaces WHERE household_id=?)').bind(memberDelete[1],hid),
       db.prepare('DELETE FROM private_word_activity WHERE household_id=? AND user_id=?').bind(hid,memberDelete[1]),
       db.prepare('DELETE FROM household_members WHERE household_id=? AND user_id=?').bind(hid,memberDelete[1])
    ]);
    return json({revoked:true,unlinkedProfiles:linked.results.length});
  }
  if(path==='/api/invitations'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId'));await owner(db,hid,user.id);
    const result=await db.prepare('SELECT id,role,created_at,expires_at,claimed_at,revoked_at FROM invitations WHERE household_id=? ORDER BY created_at DESC LIMIT 50').bind(hid).all();
    return json({invitations:result.results});
  }
  const inviteDelete=path.match(/^\/api\/invitations\/([0-9a-f-]+)$/);
  if(inviteDelete&&req.method==='DELETE') {
    const invite=await db.prepare('SELECT household_id FROM invitations WHERE id=?').bind(inviteDelete[1]).first<{household_id:string}>();
    if(!invite)throw new ApiError(404,'Invitation not found.');
    await owner(db,invite.household_id,user.id);
    await db.prepare('UPDATE invitations SET revoked_at=? WHERE id=? AND claimed_at IS NULL').bind(now(),inviteDelete[1]).run();
    return json({revoked:true});
  }
  if(path==='/api/invitations'&&req.method==='POST') {
    const b=await jsonBody(req),hid=required(b.householdId),role=b.role;
    await owner(db,hid,user.id);
    if(role!=='member'&&role!=='caregiver')bad(400,'Invalid member role.');
    const grants=b.grants;
    if(!Array.isArray(grants)||grants.length>40)throw new ApiError(400,'Invalid profile grants.');
    const accepted:{profileId:string,capabilities:Capability[]}[]=[];
    for(const g of grants) {
      if(!g||typeof g!=='object')bad(400,'Invalid grant.');
      const gg=g as Record<string,unknown>;
      if(!validCapabilities(gg.capabilities))bad(400,'Invalid capabilities.');
      const pid=required(gg.profileId);
      const p=await db.prepare('SELECT 1 FROM profiles WHERE id=? AND household_id=? AND archived_at IS NULL').bind(pid,hid).first();
      if(!p)bad(400,'Grant references a profile outside this household.');
      accepted.push({profileId:pid,capabilities:gg.capabilities as Capability[]});
    }
    const raw=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
    const expires=new Date(Date.now()+48*3600000).toISOString();
    await db.prepare('INSERT INTO invitations(id,household_id,token_hash,role,grants_json,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(uuid(),hid,await sha256(raw),role,JSON.stringify(accepted),user.id,now(),expires).run();
    return json({code:raw,expiresAt:expires},201);
  }
  if(path==='/api/invitations/accept'&&req.method==='POST') {
    const b=await jsonBody(req),hash=await sha256(required(b.code,512));
    const invitation=await db.prepare('SELECT * FROM invitations WHERE token_hash=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(hash,now()).first<any>();
    if(!invitation)bad(404,'Invitation expired or already accepted.');
    return json(await claimInvitation(db,invitation as InvitationRow,user.id));
  }
  if(path==='/api/push/config'&&req.method==='GET') {
    const configured=pushConfigured(env);
    return json({configured,publicKey:configured?env.VAPID_PUBLIC_KEY:null});
  }
  if(path==='/api/push/status'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId'));
    await member(db,hid,user.id);
    const [pref,subs]=await Promise.all([
      db.prepare('SELECT enabled FROM push_preferences WHERE user_id=? AND household_id=?').bind(user.id,hid).first<{enabled:number}>(),
      db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=?').bind(user.id).first<{count:number}>()
    ]);
    return json({configured:pushConfigured(env),enabled:pref?.enabled===1,subscriptionCount:subs?.count??0});
  }
  if(path==='/api/push/test'&&req.method==='POST') {
    const b=await jsonBody(req),hid=required(b.householdId);
    await member(db,hid,user.id);
    if(!pushConfigured(env))bad(503,'Push is not configured for this Carehold environment. Please contact the app administrator.');
    const pref=await db.prepare('SELECT enabled FROM push_preferences WHERE user_id=? AND household_id=?').bind(user.id,hid).first<{enabled:number}>();
    if(pref?.enabled!==1)bad(409,'Enable reminders for this household before testing.');
    const subs=await db.prepare('SELECT id,endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=? LIMIT 10').bind(user.id)
      .all<{id:string,endpoint:string,p256dh:string,auth_secret:string}>();
    if(!subs.results.length)bad(409,'No push-enabled device is registered.');
    // Per-user atomic cooldown prevents notification spam.
    const ts=now(),cutoff=new Date(Date.now()-60_000).toISOString();
    const claimed=await db.prepare(`INSERT INTO push_test_rate_limits(user_id,last_sent_at) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET last_sent_at=excluded.last_sent_at
      WHERE push_test_rate_limits.last_sent_at<? RETURNING last_sent_at`).bind(user.id,ts,cutoff).first();
    if(!claimed)bad(429,'Please wait one minute before testing again.');
    // A unique test ID prevents the browser collapsing repeated test notifications
    // under an identical tag. It carries no user or medication data.
    const requestedId=typeof b.testId==='string'&&/^[0-9a-f-]{36}$/.test(b.testId)?b.testId:uuid();
    const testId=requestedId;
    let sent=0,failed=0;
    for(const sub of subs.results){
      try{
        const accepted=await sendPushNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}},
          {title:'A moment for care',body:'Your Carehold notification test arrived.',url:'/',tag:'carehold-test-'+testId},
          {publicKey:env.VAPID_PUBLIC_KEY!,privateKey:env.VAPID_PRIVATE_KEY!,subject:env.VAPID_SUBJECT!});
        if(accepted)sent++;
        else{failed++;await db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').bind(sub.id,user.id).run();}
      }catch{failed++;}
    }
    if(!sent)bad(502,'The push service did not accept the test. Check your device subscription and VAPID keys.');
    return json({accepted:sent,failed,testId});
  }
  if(path==='/api/push/subscribe'&&req.method==='POST') {
    const b=await jsonBody(req),sub=b.subscription as any;
    const endpoint=trim(sub?.endpoint,2048),urlEndpoint=(()=>{try{return new URL(endpoint);}catch{return null;}})();
    const host=urlEndpoint?.hostname.toLowerCase()||'';
    const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.apple.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com');
    if(!urlEndpoint||urlEndpoint.protocol!=='https:'||!allowed||urlEndpoint.username||urlEndpoint.password)bad(400,'Unsupported push service endpoint.');
    const currentOwner=await db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first<{user_id:string}>();
    if(currentOwner && currentOwner.user_id!==user.id)bad(409,'This push subscription is already associated with another account. Unsubscribe from that account first.');
    const p256dh=required(sub?.keys?.p256dh,256),auth=required(sub?.keys?.auth,256),id=uuid();
    await db.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth_secret,created_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth_secret=excluded.auth_secret WHERE user_id=excluded.user_id`).bind(id,user.id,endpoint,p256dh,auth,now()).run();
    return json({subscribed:true});
  }
  if(path==='/api/push/preference'&&req.method==='POST') {
    const b=await jsonBody(req),hid=required(b.householdId);await member(db,hid,user.id);
    await db.prepare(`INSERT INTO push_preferences(user_id,household_id,enabled) VALUES(?,?,?) ON CONFLICT(user_id,household_id) DO UPDATE SET enabled=excluded.enabled`).bind(user.id,hid,b.enabled===true?1:0).run();
    return json({enabled:b.enabled===true});
  }
  if(path==='/api/push/preference'&&req.method==='GET') {
    const hid=required(url.searchParams.get('householdId'));await member(db,hid,user.id);
    const found=await db.prepare('SELECT enabled FROM push_preferences WHERE user_id=? AND household_id=?').bind(user.id,hid).first<{enabled:number}>();
    return json({enabled:found?.enabled===1});
  }
  return bad(404,'Endpoint not found.');
}

async function reminders(env:CareEnv) {
  if(!pushConfigured(env)||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return;
  const db=env.DB,time=Date.now();
  const result=await db.prepare(`SELECT m.*,p.household_id,h.timezone FROM medications m JOIN profiles p ON p.id=m.profile_id JOIN households h ON h.id=p.household_id
    WHERE m.archived_at IS NULL AND p.archived_at IS NULL AND m.cadence!='prn' LIMIT 500`).all<MedicationRow&{household_id:string,timezone:string}>();
  for(const m of result.results||[]) {
    const date=localDate(new Date(time),m.timezone);
    if(!scheduledOn(medSchedule(m),date))continue;
    const medTimes=await db.prepare('SELECT hhmm FROM medication_times WHERE medication_id=?').bind(m.id).all<{hhmm:string}>();
    for(const {hhmm} of medTimes.results||[]) {
      const due=localToInstant(date,hhmm,m.timezone);
      if(!due||time-due.getTime()<0||time-due.getTime()>60*60000)continue;
      const key=occurrenceKey(m.id,date,hhmm);
      const recorded=await db.prepare('SELECT 1 FROM dose_events WHERE occurrence_key=? LIMIT 1').bind(key).first();
      if(recorded)continue;
      const users=await db.prepare(`SELECT DISTINCT s.user_id FROM push_subscriptions s
        JOIN household_members hm ON hm.user_id=s.user_id AND hm.household_id=?
        JOIN push_preferences pref ON pref.user_id=s.user_id AND pref.household_id=? AND pref.enabled=1
        WHERE hm.role='owner' OR EXISTS (SELECT 1 FROM profile_grants g WHERE g.profile_id=? AND g.user_id=s.user_id AND g.capability='view_schedule')`).bind(m.household_id,m.household_id,m.profile_id).all<{user_id:string}>();
      for(const {user_id} of users.results||[]) {
        const sent=await db.prepare(`INSERT OR IGNORE INTO push_deliveries(id,user_id,occurrence_key,state,attempts) VALUES(?,?,?,'failed',0)`).bind(uuid(),user_id,key).run();
        void sent;
        const claim=await db.prepare(`UPDATE push_deliveries SET state='sending',attempts=attempts+1,last_attempt_at=?
          WHERE user_id=? AND occurrence_key=? AND attempts<3 AND (state='failed' OR (state='sending' AND last_attempt_at<?)) RETURNING id`).bind(now(),user_id,key,new Date(Date.now()-15*60000).toISOString()).first<{id:string}>();
        if(!claim)continue;
        const subs=await db.prepare('SELECT id,endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=?').bind(user_id).all<{id:string,endpoint:string,p256dh:string,auth_secret:string}>();
        let delivered=false;
        for(const s of subs.results||[]) {
          try {
            const result=await sendPushNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_secret}},
              {title:'A moment for care',body:'Open Carehold to check your schedule.',url:'/',tag:'carehold-reminder'},
              {publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT});
            if(!result)await db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(s.id).run();
            else delivered=true;
          } catch { /* Retry up to three times; never log subscription or patient data. */ }
        }
        await db.prepare('UPDATE push_deliveries SET state=? WHERE id=?').bind(delivered?'sent':'failed',claim.id).run();
      }
    }
  }
}
export default {
  async fetch(req:Request,env:CareEnv,ctx:ExecutionContext):Promise<Response> {
    try {return await handle(req,env,ctx);}catch(e) {
      if(e instanceof ApiError)return json({error:e.message},e.code);
      console.error('Unhandled carehold request error');return json({error:'Something went wrong. Please try again.'},500);
    }
  },
  async scheduled(_event:ScheduledEvent,env:CareEnv,ctx:ExecutionContext) {
    ctx.waitUntil(reminders(env).catch(()=>console.error('Reminder cycle failed')));
  },
};
