/**
 * Shared security policy. Server sliding sessions and client visual locking are
 * complementary; a client overlay is NEVER the authorization boundary.
 */
export const SESSION_IDLE_SECONDS=180;            // 3 minutes on the server
export const SESSION_REFRESH_SECONDS=30;
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
