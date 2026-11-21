export interface CareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  PILOT_ACCESS_CODE: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
export type SessionUser={id:string,email:string,name:string};
export type ProfileRow={id:string,household_id:string,display_name:string,kind:'adult'|'child'|'pet'};
export type MedicationRow={id:string,profile_id:string,name:string,form:string,dose:string,instructions:string,cadence:'daily'|'weekdays'|'interval_days'|'prn',weekdays_json:string,interval_days:number|null,anchor_date:string|null,start_date:string,end_date:string|null,clinician:string|null,refill_note:string|null};
