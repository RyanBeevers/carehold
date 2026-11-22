import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('the short-session migration revokes all preexisting long-lived sessions',()=>{
 const migration=readFileSync(new URL('../migrations/0005_revoke_legacy_sessions.sql',import.meta.url),'utf8');
 assert.match(migration,/DELETE FROM session\s*;/);
 assert.doesNotMatch(migration,/DELETE FROM (?:user|profiles|dose_events|households)/);
});
