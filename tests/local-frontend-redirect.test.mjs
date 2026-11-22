import test from 'node:test';
import assert from 'node:assert/strict';
import {localFrontendRedirect} from '../worker/local-frontend-redirect.ts';

const frontend='http://localhost:5173';
const navigate=(url,method='GET',accept='text/html')=>new Request(url,{method,headers:{accept}});

test('Wrangler preview redirects HTML navigations to Vite origin',()=>{
 const response=localFrontendRedirect(navigate('http://localhost:8787/people?day=2026-11-20'),frontend);
 assert.equal(response?.status,302);
 assert.equal(response?.headers.get('location'),'http://localhost:5173/people?day=2026-11-20');
});
test('API, assets and non-navigation requests keep their original origin',()=>{
 assert.equal(localFrontendRedirect(navigate('http://localhost:8787/api/auth/passkey/verify-registration'),frontend),null);
 assert.equal(localFrontendRedirect(navigate('http://localhost:8787/assets/index.js','GET','application/javascript'),frontend),null);
 assert.equal(localFrontendRedirect(navigate('http://localhost:8787/','POST'),frontend),null);
});
test('redirect never runs outside the exact local pair',()=>{
 assert.equal(localFrontendRedirect(navigate('http://localhost:8787/'),'https://carehold.example'),null);
 assert.equal(localFrontendRedirect(navigate('https://carehold.example/'),frontend),null);
 assert.equal(localFrontendRedirect(navigate('http://localhost:5173/'),frontend),null);
 assert.equal(localFrontendRedirect(navigate('http://127.0.0.1:8787/'),frontend),null);
});
