/** Pure scheduling and timezone utilities, shared by the browser and worker. */
export type Cadence = 'daily' | 'weekdays' | 'interval_days' | 'prn';
export type Schedule = { cadence: Cadence; weekdays?: number[]; intervalDays?: number; anchorDate?: string; startDate: string; endDate?: string | null };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validDate(v:string) { if (!YMD.test(v)) return false; const d = new Date(v+'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v; }
export function validTime(v:string) { return HM.test(v); }
export function localDate(now:Date, zone:string):string { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2'); }
export function timezoneValid(zone:string) { try { new Intl.DateTimeFormat('en',{timeZone:zone}); return true; } catch { return false; } }
export function dateDelta(a:string,b:string):number { return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z')) / 86400000); }
export function scheduledOn(schedule:Schedule, date:string):boolean {
  if (!validDate(date) || date < schedule.startDate || (schedule.endDate && date > schedule.endDate)) return false;
  if (schedule.cadence === 'prn') return false;
  if (schedule.cadence === 'daily') return true;
  if (schedule.cadence === 'weekdays') { const day = new Date(date+'T12:00:00Z').getUTCDay(); return Boolean(schedule.weekdays?.includes(day)); }
  const n=schedule.intervalDays ?? 0,anchor=schedule.anchorDate ?? schedule.startDate;
  return n >= 1 && validDate(anchor) && dateDelta(date,anchor)>=0 && dateDelta(date,anchor)%n===0;
}
export function occurrenceKey(medicationId:string,date:string,hhmm:string):string { if(!validDate(date)||!validTime(hhmm)) throw new Error('Invalid occurrence'); return `${medicationId}:${date}:${hhmm}`; }
const formatParts=(d:Date,zone:string) => {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value])) as Record<string,string>;
};
/** Find earliest exact time in ambiguous DST fold. Nonexistent local times return null (no silent shift). */
export function localToInstant(date:string,hhmm:string,zone:string):Date|null {
  if(!validDate(date)||!validTime(hhmm)||!timezoneValid(zone)) return null;
  const approx=Date.parse(`${date}T${hhmm}:00Z`); const hits:number[]=[];
  for(let m=-14*60;m<=14*60;m+=15){
    const t=approx + m*60000; const p=formatParts(new Date(t),zone);
    if(`${p.year}-${p.month}-${p.day}`===date && `${p.hour}:${p.minute}`===hhmm) hits.push(t);
  }
  return hits.length?new Date(Math.min(...hits)):null;
}
export function scheduleError(s:Schedule):string|null {
  if (!validDate(s.startDate) || (s.endDate && (!validDate(s.endDate)||s.endDate < s.startDate))) return 'Invalid start or end date';
  if (!['daily','weekdays','interval_days','prn'].includes(s.cadence)) return 'Invalid recurrence';
  if (s.cadence==='weekdays' && (!Array.isArray(s.weekdays)||s.weekdays.length===0||s.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6))) return 'Select at least one valid weekday';
  if (s.cadence==='interval_days' && (!Number.isInteger(s.intervalDays)||s.intervalDays!<1||!validDate(s.anchorDate??''))) return 'Provide interval and anchor date';
  return null;
}
