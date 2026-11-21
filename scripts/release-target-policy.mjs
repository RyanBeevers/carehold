/**
 * Pure checks for Cloudflare release targets. Avoid an accidental migration of
 * staging/local D1 or deployment to the wrong WebAuthn relying-party origin.
 * Does not contact Cloudflare, fetch credentials, or perform a deployment.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholder=/replace|placeholder|localhost|127\.0\.0\.1|\.invalid|\.example|^0\.0\.0\.0$/i;
const configuredId=value=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';

export function checkProductionTarget(config){
 const production=config?.env?.production,staging=config?.env?.staging;
 const dbs=production?.d1_databases;
 const db=Array.isArray(dbs)&&dbs.length===1?dbs[0]:null;
 const other=staging?.d1_databases?.[0];
 const origin=production?.vars?.APP_ORIGIN,stagingOrigin=staging?.vars?.APP_ORIGIN;
 let url=null;
 try{if(typeof origin==='string')url=new URL(origin);}catch{/* Report invalid URL below. */}
 const checks=[
  ['production Worker name must be carehold-production',production?.name==='carehold-production'],
  ['exactly one production D1 binding named DB',db?.binding==='DB'],
  ['production D1 must be carehold-production',db?.database_name==='carehold-production'],
  ['production D1 UUID must be configured',configuredId(db?.database_id)],
  ['production and staging must have distinct D1 IDs',db?.database_id!==other?.database_id],
  ['production must not reuse the local development D1 ID',db?.database_id!==config?.d1_databases?.[0]?.database_id],
  ['staging and production Worker names must differ',production?.name!==staging?.name],
  ['production origin must be an HTTPS host',url?.protocol==='https:'],
  ['production origin must be exact (no slash suffix, path, credentials, fragment, query, nonstandard port)',!!url&&url.origin===origin&&url.pathname==='/'&&url.search===''&&url.hash===''&&url.username===''&&url.password===''&&url.port===''],
  ['production origin must not be a placeholder or local test host',typeof origin==='string'&&!placeholder.test(origin)],
  ['production and staging must have distinct origins',typeof origin==='string'&&origin!==stagingOrigin],
  ['production origin must be a valid hostname',!!url&&!!url.hostname&&url.hostname.includes('.')&&!url.hostname.endsWith('.localhost')]
 ];
 return checks.filter(([,passes])=>!passes).map(([message])=>message);
}
