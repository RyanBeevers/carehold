import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('People profile actions share identical button treatment and icon sizing',()=>{
 const medication=app.match(/<button className="([^"]+)" onClick=\{\(\)=>newMed\(person\.id\)\}><Plus size=\{(\d+)\}\/> Add medication<\/button>/);
 const account=app.match(/<button className="([^"]+)" onClick=\{\(\)=>beginLink\(person\)\}><Link2 size=\{(\d+)\}\/>\{person\.linked_user_id\?'Change linked account':'Link an account'\}<\/button>/);
 assert.ok(medication,'Add medication profile button must be present');
 assert.ok(account,'Link an account profile button must be present');
 assert.equal(medication[1],account[1],'Both buttons should use exactly the same visual class');
 assert.equal(medication[2],account[2],'Both buttons should show equally sized icons');
 assert.equal(medication[1],'button dark');
 assert.match(app,/LockKeyhole,Link2,Users,Wind,X\} from 'lucide-react'/);
});
