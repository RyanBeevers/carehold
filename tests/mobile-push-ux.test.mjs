import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('touch-device form controls use iOS-safe font sizing', () => {
 const css = read('src/style.css');
 assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
 assert.match(css, /input:not\(\[type="checkbox"\]\)[\s\S]*?select,[\s\S]*?textarea\s*\{\s*font-size:\s*16px\s*!important/);
});

test('mobile double-tap handling leaves pinch zoom available', () => {
 const html = read('index.html');
 const css = read('src/style.css');
 assert.doesNotMatch(html, /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1/i);
 assert.match(css, /touch-action:\s*manipulation/);
});

test('deployed push errors do not tell people to edit local secrets', () => {
 const ui = read('src/App.tsx');
 const worker = read('worker/index.ts');
 assert.match(ui, /PUSH_UNAVAILABLE_MESSAGE/);
 assert.doesNotMatch(ui, /\.dev\.vars|restart Wrangler/);
 assert.doesNotMatch(worker, /Push is not configured\. Add VAPID keys to local secrets/);
});
