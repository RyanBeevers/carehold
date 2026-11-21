# Carehold — instructions for every development agent

## Mission and delivery order
Carehold is an invite-only household care pilot, built to grow into a subscription platform and optionally clinician-referred product. **Medication safety first, private communication second, professional workflows later.** The homepage is `Today → Person → Medication → Status / Action`. Make changes as small, reviewable, and testable vertical slices; never claim untested functionality works.

## Non-negotiable data boundaries
- Every API read/write rechecks an authenticated session, household membership, **profile-level capability** and resource ownership on the server. No broad `householdId` lookup grants journal access.
- A household owner manages medications but is **not** automatically an owner of personal journals or conversations.
- Keep an immutable administration event history. `unrecorded/overdue` is not `missed`. Time passing does NOT imply that a dose was administered or missed.
- Scheduled administration events use a deterministic occurrence key and unique DB constraint; retries use separate idempotency keys; corrections append superseding events. Treat a double-dose warning as a safety concern, not a dose recommendation.
- Record the acting authenticated user, actual administration time, server recording time and the schedule timezone. Preserve historical records when schedules change; edits need audit trails.
- Do not recommend dosage, substitute medications, infer PRN minimum intervals, or automate medication administration.
- Do not log passwords, access tokens, invitation tokens, push endpoints, clinical content, or journal content. No secrets in repository, telemetry, URLs, or browser storage.
- Never store readable private journal or message content in D1. Phase-two communications require a reviewed client-side/E2EE design, independent per-recipient sharing, revocation semantics, multi-device/recovery analysis, and penetration testing before enabling real sensitive content.
- No real medical/child data in test fixtures or preview deployments. Public repository must NEVER contain personal data.
- Do not enable open public registration. Pilot access codes and per-household invitations are the only entrypoints; revocation supported.
- Notifications default to non-sensitive copy. No medication, patient, journal, or recipient names in lock-screen pushes.

## Design contract: editorial care, not SaaS boilerplate
- The mark is an open, protective loop holding a small seed. **Same original motif** in header, SVG favicon, PWA icon, Apple touch icon, and push badge.
- An off-center editorial typographic hierarchy. `Fraunces` as expressive headline, `DM Sans` as UI face, `IBM Plex Mono` for date/time metadata (self-hosted font packages). Intentional cream/ink/coral/chartreuse palette in both light and dark themes.
- Avoid a wall of rounded cards, colored metric tiles, generic gradients, stock illustrations, unnecessary motion, and icon-only actions. Use ledger rules, timelines, negative space, texture, and clear labeled controls.
- Both themes from the start: system default plus user override, WCAG contrast, focus-visible, reduced-motion and 44px touch targets. No medication status communicated by color alone. Responsive mobile first.
- Copy sounds human and calm, never clinical, childish, or gamified. The interface must always show the *current person* before a record action.
- No fake success states or phantom functionality: clearly mark planned features as such.

## Engineering conventions
- React + TypeScript + Vite, Cloudflare Worker + D1, Better Auth + passkey, PWA, service-worker Web Push; avoid dependency sprawl. Use version-controlled D1 migrations and an auth schema check.
- `main` stays stable; use short-lived branches / PRs. Never run production deployment or remote database migrations without explicit user authorization.
- Local `.dev.vars` and production secrets are never committed. Distinct local/staging/production databases and secrets. No on-by-default third-party analytics.
- Add tests for: auth bypass, membership and capability denial, duplicate submissions, race/concurrency, correction history, timezone/DST, invitation replay, and notification deduplication. Prefer server-held policy checks and database constraints to UI-only checks.
- Never cache sensitive API responses in the PWA service worker. Offline recording is disabled until reconciled sync is deliberately designed and tested.
- Change logs, docs, and test steps must accurately reflect what was and was not verified. No accessibility or security claims without testing.

## MVP stage gates
1. **Core care:** Account (invited signup) → add passkey before access → create household → add adults/children/pets → medications/schedules → Today ledger → log administered/skipped/refused/uncertain/confirmed missed → immutable corrections/history → caregiver permission checks and invites.
2. **Notifications:** Explicit opt-in to PWA push, scheduled reminders, preference and device management, delivery retry/dedupe, non-sensitive push copy. Validate actual installed-iOS/Android notification behavior before calling it production-ready. The push service is a reminder, not a safety guarantee.
3. **Private words:** Curated parent/child prompts may appear locally now, with no server-stored responses. Before persistent communication or journaling, implement and independently review client-side key management, selective recipient encryption, safe account recovery, revoked access and multi-device semantics. Invitation to a discussion gives no access to unrelated entries. Prompt sender must never see open/draft/response activity unless explicitly shared.
4. **Professional:** Referrals are invitation/onboarding actions **without implicit access**. Therapist/psychiatrist accounts, consent, clinically relevant records, and optional paid workspaces are deferred.
5. **Commercial:** Subscription entitlements, monthly/annual billing, complimentary accounts, beta/founder lifetime access, staff entitlement admin are future work. Billing roles never imply care-content access.

## Open discovery / release blockers (do not quietly assume solved)
- Minors' privacy, age thresholds, guardian consent/oversight, children's right to private writing, account deletion, and teen transition to adulthood.
- Therapist/psychiatrist authorization, referral workflow, clinician role/licensure, professional record retention, cross-jurisdiction and emergency disclosure.
- HIPAA applicability, state child/privacy laws, COPPA and other relevant rules, legal terms, privacy notice, consent records, and security incident response.
- Handling high-risk disclosures, self-harm or abuse content, emergency-use disclaimers, boundaries of human monitoring and notifications.
- E2EE cryptography and its independent review; key storage/device loss; passkey is **not** a journal encryption key; client key backup and rotation; server/operator access and subpoenas; recipient revocation limits.
- Data portability, deletion, archival, audit retention, backup/restore tests, retention minimization and optional encryption of medication fields.
- AI processing (optional future only), children's data, on-device vs third-party inference, consent for shared text, provider retention/training.
- Billing compliance, beta/public launch checklist, international availability, support model, and professional contract terms.

Household-only use does **not** waive baseline security. Stop new sensitive-data features if the necessary controls cannot be implemented safely.
## Pilot prompt audiences and invitation flow
- `account_audiences` stores a self-declared **parent / child / teen** prompt preference. This is NEVER an access-control role, age verification, guardian consent or a clinician identity. Authorization continues through `household_members` and `profile_grants`.
- Never enable a `doctor` account type or professional access solely based on an onboarding dropdown. Professional enrollment/referral and consent require their own verified workflow and release gate.
- The curated Words library must show parent-to-child prompts only to the parent audience and age-distinct child/teen-to-parent prompts only to their selected audience. Shared prompts are allowed. Never log read, view, copy, draft or unshared response activity.
- A signup invitation can be staged before passkey completion as `pending_household_invites.user_id -> invitation_id` with NO reusable plaintext code stored. Stage ≠ acceptance; only a fully authenticated passkey-enabled user may claim it, and claim must honor revocation, expiry, duplicate membership and profile grants.
- Do not collect minors' exact dates of birth before consent, retention and age-transition decisions are made. A UI prompt audience remains self-selected and intentionally non-authoritative.

## Linked accounts and push checks
- `profiles.linked_user_id` is an optional, auditable **identity association**, never an authorization shortcut. Linking requires an owner and existing household member; no pet links; one user per profile per household. Revoking membership unlinks the profile and writes history. Do not infer permission from the link.
- Test push requests are opt-in, authenticated, rate-limited per user, and contain no sensitive medication/patient data. Browser registration, server push-service acceptance, and actual OS notification display are three distinct states.
- Never overwrite an existing VAPID private key as part of local setup; doing so invalidates existing push subscriptions. Keep VAPID material in ignored local secrets or secret manager only.

## Sensitive-screen timeout and feedback
- Keep **server-enforced short sessions** (three-minute sliding expiry) independent of UI presentation. The frontend's three-minute idle or one-minute background timer must mask all care content and attempt actual sign-out; require passkey/password authentication to return. Do not make a cosmetic PIN overlay that leaves an authorized session usable indefinitely.
- Never send session tokens or medication records to browser persistence for unlock. Avoid refresh heartbeats when hidden/inactive. Respect OS suspension: check elapsed time on visibility/focus/pageshow.
- Every user action should have local visible feedback. Prefer inline errors for form/dialog fields and notification settings, and a fixed, accessible toast for page-wide success/error. Do not force a scroll to a page-header banner.

## Next phase: private words release prerequisite
- Linked self-profile metadata may help users recognize their profile but MUST NOT be used as implicit permission for medication records or future private messages.
- Future journaling/messaging requires an independently reviewed client-side E2EE design; do not store readable private content in D1, introduce tracking/read receipts, or grant a parent/professional automatic access to private words.
- Distinguish push gateway acceptance, service worker receipt, and notification display request. None proves the OS showed the alert; confirm natively. No sensitive data in diagnostics or lockscreens.

## Words prototype implementation constraints
- `src/WordsDraftStudio.tsx` intentionally keeps fictional draft text only in mounted React state. Never add autosave, telemetry, background sync, WebSocket, server POST, copy-to-clipboard, browser storage, or a "send" control without the E2EE/consent release gate.
- Sharing selection is a **preview only**, defaults to "Just me," clears selections when returning to private, and must not infer access rights from household membership. `GET /api/words/recipient-options` is names/IDs only, permission-scoped; it is not a message-recipient authorization token.
- The prototype should unmount and discard drafts on page change and banking-style lock. Don't make it look like a production confidential journal.

## URL navigation and encrypted draft backlog
- The active page must be addressable by `/today`, `/people`, `/words`, `/circle`, `/settings`; restore it after refresh, lock and reauthentication. Respect browser Back/Forward and new-tab link semantics. Keep the SPA fallback configured in Wrangler without routing API requests to `index.html`.
- Route URLs are public navigation labels only. Never embed profile/household IDs, medication names, recipient IDs, journal content or credentials in URL paths/search/hash. The route does not authorize access.
- **High-priority next slice:** autosave encrypted private writing, with restoration after inactivity locking / sign-in and refresh. Do **not** implement draft persistence without client-side encryption, independent key management, recovery, account isolation, deletion and security tests. Current Words text is fictional, unsaved and erased on navigation/sign-out.

- For a fresh PWA icon launch at `/`, the only stored navigation preference permitted is one of the five public page labels. Direct links override it, and storage exceptions must not break the app. This metadata is not user-scoped; never expand it to include IDs or content.
