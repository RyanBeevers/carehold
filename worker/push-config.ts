import type {CareEnv} from './types';

/** Server-only check. Never export the private key to the browser. */
export function pushConfigured(env:Pick<CareEnv,'VAPID_PUBLIC_KEY'|'VAPID_PRIVATE_KEY'|'VAPID_SUBJECT'>):boolean {
 const pub=env.VAPID_PUBLIC_KEY?.trim()??'',priv=env.VAPID_PRIVATE_KEY?.trim()??'',subject=env.VAPID_SUBJECT?.trim()??'';
 return /^[A-Za-z0-9_-]{80,100}$/.test(pub)
  && /^[A-Za-z0-9_-]{40,60}$/.test(priv)
  && /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)
  && !subject.endsWith('.invalid');
}
