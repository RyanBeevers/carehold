/**
 * Shared security policy. Server sliding sessions and client visual locking are
 * complementary; a client overlay is NEVER the authorization boundary.
 */
export const SESSION_IDLE_SECONDS=1_800;          // 30-minute server-session grace while actively using the app
export const SESSION_REFRESH_SECONDS=60;         // sliding refresh; active client heartbeats every 30s
export const INACTIVITY_LOCK_MS=180_000;           // 3 minutes without interaction
export const BACKGROUND_LOCK_MS=60_000;           // 1 minute away from Carehold
export const HEARTBEAT_INTERVAL_MS=30_000;
export const HEARTBEAT_ACTIVE_WINDOW_MS=45_000;

export type LockReason='inactive'|'away';
export function lockReason(now:number,lastInteraction:number,hiddenAt:number|null):LockReason|null {
 if(hiddenAt!==null&&now-hiddenAt>=BACKGROUND_LOCK_MS)return 'away';
 if(now-lastInteraction>=INACTIVITY_LOCK_MS)return 'inactive';
 return null;
}
