import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import viteConfig from '../vite.config.ts';

const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url),'utf8'));

test('Vite never silently changes the configured passkey origin',()=>{
  assert.equal(viteConfig.server?.host,'localhost');
  assert.equal(viteConfig.server?.port,5173);
  assert.equal(viteConfig.server?.strictPort,true);
  assert.equal(wrangler.vars.APP_ORIGIN,'http://localhost:5173');
  assert.equal(new URL(wrangler.vars.APP_ORIGIN).port,String(viteConfig.server?.port));
});
test('Vite proxies its auth and care APIs to the local Worker',()=>{
  const proxy = viteConfig.server?.proxy;
  assert.equal(proxy?.['/api']?.target,'http://localhost:8787');
});
