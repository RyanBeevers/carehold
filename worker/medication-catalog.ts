/**
 * RxTerms search adapter. Search metadata is descriptive, never prescribing guidance.
 * No account/person/pet identifiers are sent to the National Library of Medicine.
 * Brand/generic equivalence is not inferred from capitalization or similar names.
 */
export type CatalogOption={label:string,rxCui:string|null};
export type CatalogResult={
 name:string;
 normalizedName:string;
 brandName:null;
 conceptRxCui:string|null;
 synonyms:string[];
 strengths:CatalogOption[];
 source:'rxterms';
};
export type MedicationCatalogMetadata={
 catalogSource:'rxterms'|null;
 catalogIdentifier:string|null;
 normalizedName:string|null;
 brandName:string|null;
 productStrength:string|null;
 dosageForm:string|null;
};
export class CatalogError extends Error{
 status:number;
 constructor(status:number,message:string){super(message);this.status=status;}
}
const MAX_RESULTS=15;
const TTL_MS=10*60*1000;
const CACHE_LIMIT=200;
const cache=new Map<string,{expires:number,results:CatalogResult[]}>();
const rxCui=(v:unknown):string|null=>typeof v==='string'&&/^\d{1,20}$/.test(v)?v:null;
const text=(v:unknown,max=160):string|null=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():null;
export function normalizeMedicationSearch(value:unknown):string{
 if(typeof value!=='string')throw new CatalogError(400,'Enter a medication name to search.');
 const q=value.trim().replace(/\s+/g,' ');
 if(q.length<2||q.length>64||!/^[\p{L}\p{M}\p{N} .+/'()\-]+$/u.test(q))
  throw new CatalogError(400,'Search using 2–64 letters or numbers from a medication name.');
 return q.toLocaleLowerCase('en-US');
}
/** Official API shape: [total, codes[], extraFields{}, displayStrings[][]]. */
export function parseRxTermsResponse(body:unknown):CatalogResult[]{
 if(!Array.isArray(body)||body.length<4||!Array.isArray(body[1])||
  !body[2]||typeof body[2]!=='object'||Array.isArray(body[2])||!Array.isArray(body[3]))
  throw new CatalogError(502,'Medication directory returned an unexpected response.');
 const codes=body[1] as unknown[],extras=body[2] as Record<string,unknown>,display=body[3] as unknown[];
 if(codes.length>MAX_RESULTS||display.length!==codes.length)
  throw new CatalogError(502,'Medication directory returned an unexpected number of results.');
 const extraRows=(key:string)=>{
  const v=extras[key];
  if(v===undefined)return [];
  if(!Array.isArray(v)||v.length!==codes.length)
   throw new CatalogError(502,'Medication directory returned incomplete drug identifiers.');
  return v as unknown[];
 };
 const forms=extraRows('STRENGTHS_AND_FORMS');
 const rxcuis=extraRows('RXCUIS');
 const concepts=extraRows('SXDG_RXCUI');
 const synonyms=extraRows('DISPLAY_NAME_SYNONYM');
 return codes.map((code,i)=>{
  const row=display[i];
  if(!Array.isArray(row))throw new CatalogError(502,'Medication directory returned an invalid name.');
  const name=text(row[0]??code,150);
  if(!name)throw new CatalogError(502,'Medication directory returned an invalid medication name.');
  const rawForms=forms[i]??[];
  const rawCodes=rxcuis[i]??[];
  if(!Array.isArray(rawForms)||rawForms.length>80||!Array.isArray(rawCodes))
   throw new CatalogError(502,'Medication directory returned malformed product strengths.');
  const strengths:CatalogOption[]=rawForms.flatMap((item,j)=>{
   const label=text(item,120);
   return label?[{label,rxCui:rxCui(rawCodes[j])}]:[];
  });
  const related=synonyms[i]??[];
  return {
   name,normalizedName:name,brandName:null,conceptRxCui:rxCui(concepts[i]),
   synonyms:Array.isArray(related)?related.map(x=>text(x,150)).filter((x):x is string=>!!x).slice(0,8):[],
   strengths,source:'rxterms' as const
  };
 });
}
/** The upstream request is timeout-bounded and never carries patient identifiers. */
export async function fetchRxTerms(q:string,fetcher:typeof fetch=fetch):Promise<CatalogResult[]>{
 const url=new URL('https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search');
 url.searchParams.set('terms',q);
 url.searchParams.set('ef','STRENGTHS_AND_FORMS,RXCUIS,SXDG_RXCUI,DISPLAY_NAME_SYNONYM');
 url.searchParams.set('maxList',String(MAX_RESULTS));
 let response:Response;
 try{
  response=await fetcher(url.toString(),{signal:AbortSignal.timeout(3800),headers:{Accept:'application/json'}});
 }catch{
  throw new CatalogError(503,'The medication directory is currently unavailable. You can still enter the medication manually.');
 }
 if(!response.ok)throw new CatalogError(503,'The medication directory could not be reached. Manual entry is still available.');
 let raw:string;
 try{raw=await response.text();}catch{throw new CatalogError(503,'Medication search was interrupted. Manual entry is still available.');}
 if(raw.length>200000)throw new CatalogError(502,'The medication directory response was too large.');
 try{return parseRxTermsResponse(JSON.parse(raw));}
 catch(e){if(e instanceof CatalogError)throw e;throw new CatalogError(502,'The medication directory returned invalid data. You can still use custom entry.');}
}
export async function searchCatalog(q:string,fetcher:typeof fetch=fetch):Promise<CatalogResult[]>{
 const key=normalizeMedicationSearch(q);
 const existing=cache.get(key);
 if(existing&&existing.expires>Date.now())return existing.results;
 const results=await fetchRxTerms(key,fetcher);
 cache.set(key,{expires:Date.now()+TTL_MS,results});
 if(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value!);
 return results;
}
export async function enforceCatalogRateLimit(db:D1Database,userId:string):Promise<void>{
 const now=Date.now(),cutoff=now-60000;
 // The conditional upsert is atomic in D1: >45 search requests per minute
 // from the same authenticated user are denied, across Worker isolates.
 const update=await db.prepare(`INSERT INTO medication_catalog_search_limits(user_id,window_start_ms,request_count)
 VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET
 window_start_ms=CASE WHEN medication_catalog_search_limits.window_start_ms<? THEN excluded.window_start_ms ELSE medication_catalog_search_limits.window_start_ms END,
 request_count=CASE WHEN medication_catalog_search_limits.window_start_ms<? THEN 1 ELSE medication_catalog_search_limits.request_count+1 END
 WHERE medication_catalog_search_limits.window_start_ms<? OR medication_catalog_search_limits.request_count<45`)
 .bind(userId,now,cutoff,cutoff,cutoff).run();
 if((update.meta?.changes??0)===0)
  throw new CatalogError(429,'Too many searches. Try again in a minute or use a custom medication name.');
}
const bounded=(v:unknown,max:number):string|null=>{
 if(v===undefined||v===null||v==='')return null;
 if(typeof v!=='string'||v.trim().length>max)throw new CatalogError(400,'Medication catalog information is invalid.');
 return v.trim()||null;
};
export function parseMedicationCatalog(
 input:Record<string,unknown>,name:string,old?:MedicationCatalogMetadata&{name:string}
):MedicationCatalogMetadata{
 const none:MedicationCatalogMetadata={catalogSource:null,catalogIdentifier:null,normalizedName:null,brandName:null,productStrength:null,dosageForm:null};
 // An old client doing a PATCH must not silently erase existing matching catalog metadata.
 if(!Object.prototype.hasOwnProperty.call(input,'catalogSource')){
  if(old&&old.name===name)return {catalogSource:old.catalogSource,catalogIdentifier:old.catalogIdentifier,
   normalizedName:old.normalizedName,brandName:old.brandName,productStrength:old.productStrength,dosageForm:old.dosageForm};
  return none;
 }
 if(input.catalogSource===null||input.catalogSource===''||input.catalogSource==='manual')return none;
 if(input.catalogSource!=='rxterms')throw new CatalogError(400,'Unrecognized medication catalog source.');
 const normalizedName=bounded(input.normalizedName,150);
 if(!normalizedName||normalizedName!==name)throw new CatalogError(400,'Choose an exact catalog name or switch to custom entry.');
 const catalogIdentifier=bounded(input.catalogIdentifier,20);
 if(catalogIdentifier&&!rxCui(catalogIdentifier))throw new CatalogError(400,'Invalid RxNorm identifier.');
 return {catalogSource:'rxterms',catalogIdentifier,normalizedName,
  brandName:bounded(input.brandName,150),
  productStrength:bounded(input.productStrength,120),
  dosageForm:bounded(input.dosageForm,80)};
}
