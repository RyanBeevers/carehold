import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('src/App.tsx');
const css=source('src/style.css');
const recovery=source('src/RecoveryReadiness.tsx');
const picker=source('src/HouseholdPicker.tsx');

test('Today permits authorized correction or later factual outcome without a person-page detour',()=>{
 const today=app.slice(app.indexOf("page==='today'&&"),app.indexOf("page==='people'&&"));
 assert.match(today,/e\.canRecordDose&&<div className="ledger-record-buttons">/);
 assert.match(today,/onClick=\{\(\)=>beginCorrection\(e\.event!\)\}/);
 assert.match(today,/onClick=\{\(\)=>beginCorrection\(e\.event!,'later'\)\}/);
 assert.match(today,/e\.event\.event_type!=='given'/);
 assert.match(app,/await api\(`\/administrations\/\$\{pending\.event\?\.id\}\/correct`,'POST'/);
 assert.match(css,/\.ledger-record-buttons/);
});
test('masthead has a single rounded sun/moon action and Settings retains system appearance',()=>{
 assert.match(app,/function ThemeIconToggle\(/);
 assert.match(app,/<ThemeIconToggle theme=\{theme\} setTheme=\{setTheme\}\/>/);
 assert.match(app,/aria-label=\{'Switch to '\+target\+' mode'\}/);
 assert.match(app,/<Moon size=\{19\}/);
 assert.match(app,/<Sun size=\{19\}/);
 assert.match(css,/\.theme-icon-toggle\{[^}]*border-radius:50%/);
 assert.match(app,/mode:'system'/);
});
test('care circle picker has display-only single-circle state and keyboard accessible listbox',()=>{
 assert.match(app,/<HouseholdPicker households=\{households\} value=\{hid\}/);
 assert.doesNotMatch(app,/className="household-select">CARE CIRCLE <select/);
 assert.match(picker,/if\(households\.length===1\)return/);
 assert.match(picker,/aria-expanded=\{open\}/);
 assert.match(picker,/aria-haspopup="listbox"/);
 assert.match(picker,/role="listbox"/);
 assert.match(picker,/role="option"/);
 for(const key of ['ArrowDown','ArrowUp','Escape','Home','End'])assert.ok(picker.includes(key));
 assert.match(css,/\.household-picker-options/);
});
test('Settings presents fresh-code generation or recovery form directly without navigating to Words',()=>{
 assert.match(recovery,/status==='setup'\|\|status==='restore'/);
 assert.match(recovery,/<MessageRecoveryGate key=\{userId\+':'\+status\}/);
 assert.match(recovery,/status==='legacy'&&<LegacyMessageMigration/);
 assert.doesNotMatch(recovery,/href="\/words">Open Words recovery/);
 assert.match(source('src/MessageRecoveryGate.tsx'),/>Generate recovery code</);
 assert.match(source('src/MessageRecoveryGate.tsx'),/>Restore my message key</);
});
test('server grace is longer than local idle lock and browser keeps explicit sign-out',()=>{
 const auth=source('worker/auth.ts'),policy=source('shared/session-policy.ts');
 assert.match(policy,/SESSION_IDLE_SECONDS=1_800/);
 assert.match(policy,/INACTIVITY_LOCK_MS=180_000/);
 assert.match(policy,/BACKGROUND_LOCK_MS=60_000/);
 assert.match(auth,/expiresIn:SESSION_IDLE_SECONDS,updateAge:SESSION_REFRESH_SECONDS/);
 assert.match(app,/lockNow\(message,false\)/);
 assert.match(app,/await authClient\.signOut\(\)/);
});
