export type Household={id:string,name:string,timezone:string,role:'owner'|'caregiver'|'member'};
export type Person={id:string,household_id:string,display_name:string,kind:'adult'|'child'|'pet',linked_user_id?:string|null,is_self?:number};
export type Medication={id:string,profile_id:string,name:string,form:string,dose:string,instructions:string,cadence:'daily'|'weekdays'|'interval_days'|'prn',weekdays:number[],interval_days:number|null,anchor_date:string|null,start_date:string,end_date:string|null,clinician:string|null,refill_note:string|null,times:string[]};
export type DoseEvent={id:string,event_type:'given'|'skipped'|'refused'|'uncertain'|'missed',occurred_at:string,recorded_at:string,actor_user_id:string,actor_name?:string,note:string,supersedes_event_id?:string|null,med_name_snapshot?:string,dose_snapshot?:string,scheduled_date?:string|null,scheduled_time?:string|null};
export type Entry={key:string,date:string,time:string,timezone:string,dueAt:string|null,medicationId:string,medicationName:string,dose:string,instructions:string,profileId:string,person:string,kind:Person['kind'],event:DoseEvent|null};
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json','X-Carehold-Request':'1'},credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 let data:any;try{data=await response.json();}catch{data={};}
 if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
 return data as T;
}
