import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import type { CareEnv } from './types';

export function makeAuth(env:CareEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must be configured');
  const origin = new URL(env.APP_ORIGIN);
  return betterAuth({
    database: env.DB,
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled:true, minPasswordLength:10 },
    plugins: [passkey({ rpID:origin.hostname, rpName:'carehold.', authenticatorSelection:{userVerification:'required'} })],
    advanced: { ipAddress:{ipAddressHeaders:['cf-connecting-ip']} },
  });
}
