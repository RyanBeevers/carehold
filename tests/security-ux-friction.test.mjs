import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('normal Words and direct-message sends do not expose recipient verification codes',()=>{
 const shared=read('src/SharedWords.tsx'),direct=read('src/MessagesStudio.tsx');
 assert.doesNotMatch(shared,/KeyFingerprintDetails|Compare recipient encryption codes/);
 assert.doesNotMatch(direct,/KeyFingerprintDetails|Compare recipient encryption codes/);
 for(const text of [shared,direct]){
  assert.match(text,/await checkRecipientKeyContinuity\(/);
  assert.match(text,/RecipientKeyChangedError/);
  assert.match(text,/KeyChangeReview/);
 }
});

test('unexpected key changes stay blocking and technical codes are behind an intentional disclosure',()=>{
 const review=read('src/RecipientKeyReview.tsx');
 assert.match(review,/role="alert"/);
 assert.match(review,/Carehold paused sharing rather than automatically trusting/);
 assert.match(review,/<details className="key-change-instructions"/);
 assert.match(review,/onToggle=\{event=>setReviewing\(event\.currentTarget\.open\)\}/);
 assert.match(review,/disabled=\{busy\|\|!reviewing\}/);
 assert.match(review,/How to verify this change/);
 assert.match(review,/readableFingerprint\(item.current\)/);
 assert.match(review,/onClick=\{onApprove\}/);
 assert.match(review,/onClick=\{onDismiss\}/);
});

test('routine Settings keeps recovery details collapsed; onboarding still requires a verified secure backup',()=>{
 const readiness=read('src/RecoveryReadiness.tsx');
 const guide=read('src/RecoveryCodeSaveGuide.tsx');
 const recovery=read('src/MessageRecoveryGate.tsx');
 assert.match(readiness,/configured:'Encrypted writing is ready on this device.'/);
 assert.match(readiness,/<details className="recovery-advanced-settings">/);
 assert.match(readiness,/Recovery &amp; advanced security/);
 assert.match(readiness,/My encryption verification code/);
 assert.match(guide,/One-time backup/);
 assert.match(guide,/Copy recovery code/);
 assert.match(guide,/<details className="recovery-storage-alternatives">/);
 assert.match(guide,/enteredCode.trim\(\)!==code/);
 assert.match(guide,/onSavedChange\(true\)/);
 assert.match(recovery,/disabled=\{!saved\|\|busy\}/);
 assert.match(recovery,/Set up secure backup/);
 assert.match(recovery,/Restore my writing/);
 assert.doesNotMatch(guide,/localStorage\.|sessionStorage\.|fetch\(/);
});
