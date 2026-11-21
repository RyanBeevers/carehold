# Carehold threat boundaries and launch gates

**Status: first source foundation, not security certified, not ready for real sensitive records.** This repository is public source code; database contents, credentials, OAuth secrets, patient data and invite tokens must remain private.

## Authorized access

Better Auth handles login/session and WebAuthn. `/api/me` only exposes the signed-in account and whether a passkey exists; all care APIs require a passkey in the database. All data APIs check membership. Profile-specific operations additionally demand `view_schedule`, `record_dose`, `view_history` or `manage_medication`; owners have medication administration rights by policy, **not** future private journal read rights.

Caregiver invitations are random, SHA-256-hashed at rest, expire after 48 hours, and are claimed once. The code is intentionally exposed to the generating owner only once. The current service has no delivery service or member-management/revocation UI, so production invitations are blocked by the release checklist until revocation, rate limiting, and account recovery are implemented and tested.

## Medication integrity

Dose events form an append-only chain. A unique constraint on initial scheduled occurrence prevents duplicate submissions at the database layer. A unique `idempotency_key` handles retries; corrections reference a unique superseded event. Correction notes, acting user, scheduled local date/time, timezone, actual event time, server record time, and a medicine/dose snapshot are retained. Changing a prescription never updates history. Occurrences not recorded are *unrecorded*, not *missed*. A daily screen may omit a schedule that has been edited; history remains accessible.

Records represent caregiver observations—not advice, clinical decisions, or evidence that a dose was definitely administered. Users must consult their prescriber if unsure about medication administration or duplicate doses.

## Notifications

Push delivery is opt-in per household plus browser/device subscription, generic lock-screen text only, no recipient/medication names. Client-supplied endpoints are restricted to recognized HTTPS push-provider hosts to reduce SSRF risk. Delivery is best effort with deduplication; failures can occur due to OS, browser, cron, connectivity, and push-service conditions. No sensitive API response is cached by the service worker. Browser app icons and fonts are self hosted.

## Future encrypted communication (hard gate)

A passkey proves account/device possession. It is **not** automatically a client journal decryption key. Before saving journal entries, responses, or messages: choose established reviewed E2EE primitives, decide multi-device provisioning and lost-device recovery, authenticate recipient keys, prevent parent/owner blanket access, implement selected-recipient sharing and deletion/retention, and assess revocation limits. Prompt-sender view/open/ignored/draft telemetry must not exist. Do not store sensitive text in plaintext while planning encryption.

## Incomplete for public launch

Email verification, caregiver revocation, anti-enumeration and rate limits, threat-model review, external security testing, child/guardian policy and legal review, user consent, professional records, incident response, deletion/export/retention, backups/restore, production monitoring, CSP/cookie review, server-permission integration tests, and signed dependency audit. See `AGENTS.md` for the full discovery list.

## Account prompt audience and invite staging (pilot)
The `parent`, `child`, and `teen` labels select **local, prewritten prompt copy only**. They do not alter profile grants, clinical access, consent rights, or privacy policies; a self-declared label cannot establish a minor's age or a clinician's status. No exact DOB is collected in the pilot.

An invitation may be referenced by user ID and invitation ID after sign-up but before passkey registration. The staging record does **not** create household membership, expose household details, or store the bearer code. Actual acceptance still requires an authenticated passkey and checks the one-time invitation state. Clinical enrollment and children's age/guardian validation are deliberately deferred.
