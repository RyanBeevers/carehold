/**
 * Wrangler serves a previously built SPA at localhost:8787. That makes
 * WebAuthn register against :8787, but our single configured app origin is
 * the Vite dev frontend on :5173. Redirect browser DOCUMENT requests only.
 *
 * Do not add :8787 to Better Auth trustedOrigins or change the origin/CSRF
 * checks: passkeys are intentionally bound to the configured app origin.
 */
export function localFrontendRedirect(request:Request,appOrigin:string):Response|null {
  const requestUrl=new URL(request.url);
  if(request.method!=='GET'||!request.headers.get('accept')?.includes('text/html'))return null;
  if(requestUrl.pathname.startsWith('/api/'))return null;
  if(requestUrl.origin!=='http://localhost:8787'||appOrigin!=='http://localhost:5173')return null;
  const destination=new URL(requestUrl.pathname+requestUrl.search+requestUrl.hash,appOrigin);
  return Response.redirect(destination.toString(),302);
}
