import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('People actions use consistent sizing with a distinct primary, secondary and archive hierarchy',()=>{
 const people=app.slice(app.indexOf('className="detail-actions"'),app.indexOf('className="linked-summary"'));
 assert.match(people,/className="detail-actions" role="group" aria-label="Profile actions"/);
 const add=people.match(/className="(profile-action [^"]+)"[^>]*onClick=\{\(\)=>newMed\(person\.id\)\}><Plus size=\{(\d+)\}/);
 const link=people.match(/className="(profile-action [^"]+)"[^>]*onClick=\{\(\)=>beginLink\(person\)\}><Link2 size=\{(\d+)\}/);
 const archive=people.match(/className="(profile-action [^"]+)"[^>]*onClick=\{\(\)=>\{setPending\(\{profile:person\}\)/);
 assert.ok(add,'Add medication action should exist');
 assert.ok(link,'Link account action should exist');
 assert.ok(archive,'Archive action should exist');
 assert.equal(add[1],'profile-action profile-action--primary');
 assert.equal(link[1],'profile-action profile-action--secondary');
 assert.equal(archive[1],'profile-action profile-action--archive');
 assert.equal(add[2],link[2],'Both primary and secondary actions have equal-sized icons');
 assert.match(people,/Archive profile/);
 assert.match(people,/Restore profile/);
 assert.match(people,/disabled=\{saving\}/);
});
test('People action row has real spacing, padding, phone layout and dark/light-aware colors',()=>{
 assert.match(css,/\.person-detail \.detail-actions\s*\{[^}]*display:flex;[^}]*flex-wrap:wrap;[^}]*gap:12px;/s);
 assert.match(css,/\.person-detail \.detail-actions \.profile-action\s*\{[^}]*min-height:46px;[^}]*padding:12px 18px;/s);
 assert.match(css,/\.profile-action--primary\s*\{[^}]*background:var\(--acid\);/s);
 assert.match(css,/\.profile-action--secondary\s*\{[^}]*background:var\(--white\);/s);
 assert.match(css,/\.profile-action--archive\s*\{[^}]*color:var\(--muted\);/s);
 assert.match(css,/@media\(max-width:560px\)\s*\{[\s\S]*?\.person-detail \.detail-actions\{align-items:stretch;flex-direction:column;gap:10px\}/);
});
