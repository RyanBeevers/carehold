import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root = new URL('../',import.meta.url);
const content=(path)=>readFileSync(new URL(path,root));
const text=(path)=>content(path).toString('utf8');
const base='public/branding/carehold/';
function pngSize(path){
 const b=content(path);
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a',path);
 return [b.readUInt32BE(16),b.readUInt32BE(20)];
}
test('approved public raster derivatives all have their declared exact sizes',()=>{
 const fixed={
  'marks/carehold-symbol-transparent-512.png':[512,512],
  'marks/carehold-symbol-transparent-1024.png':[1024,1024],
  'icons/apple-touch-icon-light-180.png':[180,180],
  'pwa/carehold-notification-badge-96.png':[96,96],
  'pwa/carehold-any-light-192.png':[192,192],
  'pwa/carehold-any-light-512.png':[512,512],
  'pwa/carehold-maskable-light-192.png':[192,192],
  'pwa/carehold-maskable-light-512.png':[512,512],
  'social/carehold-og-light-1200x630.png':[1200,630],
 };
 for(const [path,dims] of Object.entries(fixed))assert.deepEqual(pngSize(base+path),dims,path);
 for(const variant of ['light','dark']){
  for(const size of [16,32,48,64])assert.deepEqual(pngSize(`${base}favicons/favicon-${variant}-${size}.png`),[size,size]);
  const ico=content(`${base}favicons/favicon-${variant}.ico`);
  assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);
  assert.ok(ico.readUInt16LE(4)>=1);
 }
});
test('manifest contains separate any and maskable icons with matching dimensions',()=>{
 const manifest=JSON.parse(text('public/manifest.webmanifest'));
 assert.equal(manifest.name,'Carehold');assert.equal(manifest.short_name,'Carehold');
 assert.deepEqual(manifest.icons.map(x=>x.purpose),['any','any','maskable','maskable']);
 for(const icon of manifest.icons){
  assert.equal(icon.type,'image/png');
  assert.deepEqual(pngSize('public'+icon.src),icon.sizes.split('x').map(Number));
 }
});
test('HTML has exactly one manifest and live Apple/favicon/social preview references',()=>{
 const html=text('index.html');
 assert.equal((html.match(/rel="manifest"/g)||[]).length,1);
 assert.match(html,/apple-touch-icon-light-180\.png/);
 assert.match(html,/favicon-dark-32\.png/);
 assert.match(html,/favicon-light-32\.png/);
 assert.match(html,/carehold-og-light-1200x630\.png/);
 assert.match(html,/name="twitter:card" content="summary_large_image"/);
 assert.doesNotMatch(html,/href="\/icon\.svg"/);
});
test('approved story is imported without rewriting and is reachable on member-level route',()=>{
 const story=text('docs/THE_STORY_BEHIND_OUR_ICON.md');
 const component=text('src/BrandStory.tsx');
 assert.match(component,/THE_STORY_BEHIND_OUR_ICON\.md\?raw/);
 assert.match(story,/\*\*We come from the same roots\. We are our own people\. And we grow together\.\*\*/);
 assert.match(story,/\*Carehold\. Care that connects\. Space to grow\.\*/);
 assert.match(text('src/lib/routes.ts'),/about:'\/settings\/about'/);
 assert.match(text('src/App.tsx'),/page==='about'&&<BrandStory/);
 assert.match(text('src/App.tsx'),/The Story Behind Our Icon/);
 assert.match(text('src/App.tsx'),/onClick=\{e=>followPageLink\(e,'about'\)\}/);
});
test('push worker references final icon and never caches personal content',()=>{
 const sw=text('public/sw.js');
 assert.match(sw,/carehold-any-light-192\.png/);
 assert.match(sw,/carehold-notification-badge-96\.png/);
 assert.doesNotMatch(sw,/\/icon-192\.png|\/badge-96\.png/);
 assert.doesNotMatch(sw,/caches\.open\(/);
});
test('legacy output asset paths are retired',()=>{
 const retired=['icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','badge-96.png'];
 for(const file of retired)assert.equal(existsSync(new URL('public/'+file,root)),false,file);
});
