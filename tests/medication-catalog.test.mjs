import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CatalogError,normalizeMedicationSearch,parseRxTermsResponse,fetchRxTerms,parseMedicationCatalog
} from '../worker/medication-catalog.ts';

const sample=[
 2,
 ['ADDERALL (Oral Pill)','Dextroamphetamine (Oral Pill)'],
 {
  STRENGTHS_AND_FORMS:[['5 mg Tab','10 mg Tab'],['5 mg Tab']],
  RXCUIS:[['197579','197580'],['197581']],
  SXDG_RXCUI:['11111','22222'],
  DISPLAY_NAME_SYNONYM:[['Adderall'],['Dextroamphetamine sulfate']]
 },
 [['ADDERALL (Oral Pill)'],['Dextroamphetamine (Oral Pill)']]
];

test('RxTerms normalizes names, synonyms and source-aligned strength-to-RxCUI mapping',()=>{
 const rows=parseRxTermsResponse(sample);
 assert.equal(rows.length,2);
 assert.equal(rows[0].name,'ADDERALL (Oral Pill)');
 assert.equal(rows[0].source,'rxterms');
 assert.equal(rows[0].conceptRxCui,'11111');
 assert.deepEqual(rows[0].strengths,[{label:'5 mg Tab',rxCui:'197579'},{label:'10 mg Tab',rxCui:'197580'}]);
 assert.equal(rows[0].synonyms[0],'Adderall');
 assert.equal(rows[1].strengths[0].rxCui,'197581');
 // Brand/generic inference is intentionally NOT guessed from the names.
 assert.equal(rows[0].brandName,null);
 assert.equal(rows[1].brandName,null);
});
test('empty results and missing optional attributes are harmless',()=>{
 assert.deepEqual(parseRxTermsResponse([0,[],{},[]]),[]);
 const rows=parseRxTermsResponse([1,['Example'],{},[['Example']]]);
 assert.deepEqual(rows[0].strengths,[]);
 assert.deepEqual(rows[0].synonyms,[]);
 assert.equal(rows[0].conceptRxCui,null);
});
test('malformed upstream responses cannot fabricate medication information',()=>{
 for(const bad of [null,{},[0,'bad',{},[]],[1,['A'],{},[]],[1,['A'],{STRENGTHS_AND_FORMS:[{}]},[['A']]]])
  assert.throws(()=>parseRxTermsResponse(bad),CatalogError);
});
test('query bounds prevent invalid input and control characters',()=>{
 assert.equal(normalizeMedicationSearch('  Adderall   XR  '),'adderall xr');
 for(const invalid of ['a','','a'.repeat(65),'\r\ncall another API','!!!',null])
  assert.throws(()=>normalizeMedicationSearch(invalid),e=>e instanceof CatalogError&&e.status===400);
});
test('worker contacts only the fixed NLM host with a bounded query and no profile identity',async()=>{
 let requested='';
 const stub=async (url,init)=>{
  requested=String(url);
  assert.equal(init.headers.Accept,'application/json');
  assert.ok(init.signal);
  return new Response(JSON.stringify(sample),{status:200});
 };
 const found=await fetchRxTerms('adderall',stub);
 assert.equal(found.length,2);
 const parsed=new URL(requested);
 assert.equal(parsed.hostname,'clinicaltables.nlm.nih.gov');
 assert.equal(parsed.searchParams.get('terms'),'adderall');
 assert.equal(parsed.searchParams.get('maxList'),'15');
 assert.ok(parsed.searchParams.get('ef').includes('RXCUIS'));
 assert.equal(requested.includes('profileId'),false);
});
test('directory timeout, upstream failure and broken JSON return safe errors',async()=>{
 const offline=async()=>{throw new Error('Network unavailable')};
 await assert.rejects(fetchRxTerms('adderall',offline),e=>e instanceof CatalogError&&e.status===503);
 const failed=async()=>new Response('Unavailable',{status:502});
 await assert.rejects(fetchRxTerms('adderall',failed),e=>e instanceof CatalogError&&e.status===503);
 const broken=async()=>new Response('{broken',{status:200});
 await assert.rejects(fetchRxTerms('adderall',broken),e=>e instanceof CatalogError&&e.status===502);
});
test('selected catalog metadata never supplies a prescribed dose or frequency',()=>{
 const meta=parseMedicationCatalog({
  catalogSource:'rxterms',catalogIdentifier:'197580',normalizedName:'ADDERALL (Oral Pill)',
  productStrength:'10 mg Tab',dosageForm:null,brandName:null
 },'ADDERALL (Oral Pill)');
 assert.deepEqual(meta,{catalogSource:'rxterms',catalogIdentifier:'197580',normalizedName:'ADDERALL (Oral Pill)',brandName:null,productStrength:'10 mg Tab',dosageForm:null});
 assert.equal(Object.hasOwn(meta,'dose'),false);
 assert.equal(Object.hasOwn(meta,'cadence'),false);
});
test('manual entry, unchanged legacy edits and new names remain compatible',()=>{
 const legacy=parseMedicationCatalog({name:'Custom vet formula'},'Custom vet formula');
 assert.deepEqual(legacy,{catalogSource:null,catalogIdentifier:null,normalizedName:null,brandName:null,productStrength:null,dosageForm:null});
 const old={...legacy,name:'Custom vet formula'};
 assert.deepEqual(parseMedicationCatalog({},'Custom vet formula',old),legacy);
 assert.deepEqual(parseMedicationCatalog({},'Renamed',old),legacy);
 const catalogOld={...parseMedicationCatalog({catalogSource:'rxterms',normalizedName:'Example',catalogIdentifier:'123'},'Example'),name:'Example'};
 assert.equal(parseMedicationCatalog({},'Example',catalogOld).catalogSource,'rxterms');
 assert.equal(parseMedicationCatalog({},'Different name',catalogOld).catalogSource,null);
 assert.equal(parseMedicationCatalog({catalogSource:null},'Custom',catalogOld).catalogSource,null);
});
test('incorrect or mismatched catalog annotations are rejected',()=>{
 assert.throws(()=>parseMedicationCatalog({catalogSource:'rxterms',normalizedName:'Other'},'Name'),CatalogError);
 assert.throws(()=>parseMedicationCatalog({catalogSource:'unknown'},'Name'),CatalogError);
 assert.throws(()=>parseMedicationCatalog({catalogSource:'rxterms',normalizedName:'Name',catalogIdentifier:'not-an-rxcui'},'Name'),CatalogError);
});
test('autocomplete suppresses stale results and keeps manual-entry option accessible',()=>{
 const picker=readFileSync(new URL('../src/MedicationCatalogPicker.tsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
 assert.match(picker,/window\.setTimeout\(\(\)=>\{[\s\S]*\},300\)/);
 assert.match(picker,/id!==request\.current/);
 assert.match(picker,/onKeyDown=\{keys\}/);
 assert.match(picker,/role="combobox"/);
 assert.match(picker,/role="listbox"/);
 assert.match(picker,/Use custom medication name/);
 assert.match(picker,/isPet&&/);
 assert.match(app,/<MedicationCatalogPicker/);
 assert.match(app,/onNameChange=\{name=>setMedForm/);
 assert.match(app,/onSelect=\{item=>setMedForm/);
 assert.match(worker,/profileAccess\(db,pid,user\.id,'manage_medication'\)/);
 assert.match(worker,/enforceCatalogRateLimit\(db,user\.id\)/);
});
