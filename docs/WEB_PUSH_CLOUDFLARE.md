# Cloudflare Web Push setup for staging and production

Carehold uses a **distinct Cloudflare Worker** and separate secret bindings for each environment. The local `.dev.vars` file does not configure deployed Workers. A missing/invalid VAPID value causes `GET /api/push/config` to return `configured: false` to an authenticated session.

## Before changing secrets

From the Carehold repository, check which secret **names** are present (values are not returned):

```sh
npx wrangler whoami
npx wrangler secret list --env staging
npx wrangler secret list --env production
```

Check the intended Cloudflare account and Worker name in the CLI output or dashboard. The Worker targets in `wrangler.jsonc` are `carehold-staging` and `carehold-production`.

**Do not rotate an already configured VAPID private key just to troubleshoot.** Changing the key pair invalidates existing browser push subscriptions. If any VAPID secrets already exist but Carehold reports unconfigured, inspect whether the three values are valid and belong to the same pair before deciding on a new pair. Never paste private values into Git, issue threads, logs, or chat.

## Provision one missing environment

1. Generate a VAPID key pair locally using the installed dependency:

```sh
node --input-type=module -e 'import {generateVapidKeys} from "@mmmike/web-push/vapid"; console.log(await generateVapidKeys())'
```

This prints a **private key** in your local terminal. Capture it in a secure password manager and clear the terminal when finished. Do not commit or share the output. Generate a **different** pair for staging and production, and retain each pair for future installations.

2. For **staging**, run the commands below separately. Paste the corresponding value **only at Wrangler's interactive prompt**. The subject must be a working `mailto:` sender address (not an `.invalid` placeholder).

```sh
npx wrangler secret put VAPID_PUBLIC_KEY --env staging
npx wrangler secret put VAPID_PRIVATE_KEY --env staging
npx wrangler secret put VAPID_SUBJECT --env staging
```

3. Validate staging end to end before changing production. In staging, sign in, open Settings → Gentle reminders, confirm the configuration error is gone, tap **Enable reminders**, grant device permission, then **Send push test**. On iPhone/iPad, install and open the Home Screen PWA before enabling push.

4. Repeat with the **separate production key pair** only after validating the correct account and production target:

```sh
npx wrangler secret put VAPID_PUBLIC_KEY --env production
npx wrangler secret put VAPID_PRIVATE_KEY --env production
npx wrangler secret put VAPID_SUBJECT --env production
```

**Important:** Cloudflare's `wrangler secret put` creates and deploys a new Worker version **immediately**. Treat every secret operation as a live environment change. The production release review gates in [CLOUDFLARE_PRODUCTION.md](CLOUDFLARE_PRODUCTION.md) still apply; configuring push does not authorize real medical or private family data.

## Acceptance

- The authenticated `/api/push/config` endpoint returns `configured: true` and a public key, **never the private key**.
- Browser permission is `granted`; the device is subscribed using the current environment's public key.
- The push gateway accepts a test, the service worker reports receipt and display request, **and an actual device notification appears**. These are separate checks.
- Repeat on a real installed iOS PWA and a desktop browser. Confirm non-sensitive lock-screen text and that turning reminders off stops scheduled notifications.
- If the public key changes, re-enable reminders on each previously subscribed device; do not erase the user's entire PWA data or IndexedDB to fix push.
