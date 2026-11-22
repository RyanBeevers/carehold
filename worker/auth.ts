import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import type { CareEnv } from './types';
import {SESSION_IDLE_SECONDS,SESSION_REFRESH_SECONDS} from '../shared/session-policy';

export function makeAuth(env:CareEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must be configured');
  const origin = new URL(env.APP_ORIGIN);
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    // A separate 30-minute sliding backend grace period avoids mid-edit cookie
    // expiry when the browser throttles activity heartbeats. The frontend still
    // masks after 3 minutes inactive / 1 minute away, requiring reauthentication.
    // Keep cookie caching off so every API call validates revocation/expiry.
    session: {expiresIn:SESSION_IDLE_SECONDS,updateAge:SESSION_REFRESH_SECONDS,cookieCache:{enabled:false}},
    emailAndPassword: { enabled:true, minPasswordLength:10 },
    plugins: [passkey({ rpID:origin.hostname, rpName:'carehold.', authenticatorSelection:{userVerification:'required'} })],
    advanced: { ipAddress:{ipAddressHeaders:['cf-connecting-ip']} },
  });
}
