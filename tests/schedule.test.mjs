import test from 'node:test';import assert from 'node:assert/strict';
import {scheduledOn,localToInstant,occurrenceKey,validDate,localDate} from '../shared/schedule.ts';
import {canAccess,validCapabilities} from '../shared/policy.ts';
test('daily and weekdays respect bounds',()=>{
 assert.equal(scheduledOn({cadence:'daily',startDate:'2026-11-01',endDate:'2026-11-20'},'2026-11-21'),false);
 assert.equal(scheduledOn({cadence:'weekdays',weekdays:[1,3,5],startDate:'2026-11-01'},'2026-11-20'),true);
 assert.equal(scheduledOn({cadence:'weekdays',weekdays:[1,3,5],startDate:'2026-11-01'},'2026-11-21'),false);
});
test('periodic recurrence uses anchor without drift',()=>{
 const s={cadence:'interval_days',startDate:'2026-11-01',anchorDate:'2026-11-01',intervalDays:3};
 assert.equal(scheduledOn(s,'2026-11-04'),true);assert.equal(scheduledOn(s,'2026-11-05'),false);
});
test('DST gaps fail closed; fall fold picks first instant',()=>{
 assert.equal(localToInstant('2026-03-08','02:30','America/New_York'),null);
 assert.equal(localToInstant('2026-11-01','01:30','America/New_York')?.toISOString(),'2026-11-01T05:30:00.000Z');
 assert.equal(localToInstant('2026-11-20','08:00','America/New_York')?.toISOString(),'2026-11-20T13:00:00.000Z');
});
test('occurrences stable; date strict',()=>{
 assert.equal(occurrenceKey('medA','2026-11-20','08:00'),'medA:2026-11-20:08:00');
 assert.equal(validDate('2026-02-30'),false);
 assert.equal(localDate(new Date('2026-11-21T02:00:00Z'),'America/New_York'),'2026-11-20');
});
test('profile grants separate from ownership',()=>{
 assert.equal(canAccess('caregiver',['record_dose'],'view_history'),false);
 assert.equal(canAccess('caregiver',['record_dose'],'record_dose'),true);
 assert.equal(canAccess('member',[],'view_schedule'),false);
 assert.equal(canAccess('owner',[],'view_history'),true);
 assert.equal(validCapabilities(['view_schedule','journal_read']),false);
});
