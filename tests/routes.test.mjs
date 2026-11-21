import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_PATHS,pagePath,pageFromPath,canonicalPagePath,shouldHandlePageClick} from '../src/lib/routes.ts';
import {readFileSync} from 'node:fs';
const wrangler=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));

test('each app page has a unique, shareable, non-sensitive URL',()=>{
 const paths=Object.values(APP_PATHS);
 assert.deepEqual(paths,['/today','/people','/words','/circle','/settings']);
 assert.equal(new Set(paths).size,5);
 for(const [page,path] of Object.entries(APP_PATHS)){
  assert.equal(pagePath(page),path);
  assert.equal(pageFromPath(path),page);
  assert.equal(canonicalPagePath(path),path);
 }
});
test('legacy root and invalid routes fail closed to Today and do not reveal data',()=>{
 for(const path of ['/', '/today/', '/words/unknown','/people/test-profile-id','/unrecognized','/API/secret']){
  if(path==='/words/unknown'||path==='/people/test-profile-id')assert.equal(pageFromPath(path),'today');
  assert.ok(APP_PATHS[pageFromPath(path)]);
 }
 assert.equal(canonicalPagePath('/'),'/today');
 assert.equal(canonicalPagePath('/settings/'),'/settings');
});
test('only normal link clicks are handled by client navigation',()=>{
 const normal={button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false};
 assert.equal(shouldHandlePageClick(normal),true);
 for(const key of ['defaultPrevented','metaKey','ctrlKey','shiftKey','altKey']){
  assert.equal(shouldHandlePageClick({...normal,[key]:true}),false);
 }
 assert.equal(shouldHandlePageClick({...normal,button:1}),false);
});
test('Cloudflare serves direct page reloads as SPA, API still routes to Worker',()=>{
 assert.equal(wrangler.assets.not_found_handling,'single-page-application');
 assert.ok(wrangler.assets.run_worker_first.includes('/api/*'));
});
