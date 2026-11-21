# Carehold medication catalog / RxTerms adapter

**Implementation:** `worker/medication-catalog.ts`, `src/MedicationCatalogPicker.tsx`, `migrations/0009_medication_catalog.sql`. Uses no new npm dependencies.

## Source and attribution

The medication autocomplete uses the free, publicly accessible [NLM Clinical Tables RxTerms API](https://clinicaltables.nlm.nih.gov/apidoc/rxterms/v3/doc.html), with no API key required:

```http
GET https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=adderall&ef=STRENGTHS_AND_FORMS,RXCUIS,SXDG_RXCUI,DISPLAY_NAME_SYNONYM&maxList=15
```

The [Clinical Tables FAQ](https://clinicaltables.nlm.nih.gov/faq.html) notes an advised service-wide maximum of **25 requests/second**, no guaranteed availability, and that requests (including full query URLs) may be logged. Never send user names, diagnoses, notes, pet names, dates of birth or other personal data to the upstream service. Carehold sends **only the drug-name query string**. No account or patient identifier goes to NLM.

The RxTerms result includes exact DISPLAY_NAME values, ordered STRENGTHS_AND_FORMS strings, corresponding product RXCUIS, and optional SXDG_RXCUI/synonyms. Product-strength options map index-for-index to their RXCUIS; they are not drug-dose recommendations. Display names and indexed synonyms are shown as-is, not inferred brand/generic equivalence. This API does **not** provide a reliable explicit brand/generic pairing in all responses, so `brand_name` remains null unless later populated by a verified source.

This feature deliberately does not request the RxNorm API for every lookup. Future enrichment can use [RxNorm](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) when there is a demonstrated need. Veterinary coverage can later use a separate adapter from vetted FDA [Green Book](https://www.fda.gov/animal-veterinary/products/approved-animal-drug-products-green-book) data. Do not auto-import the entire catalog now.

## Local backend design

`GET /api/medications/search?profileId=<authorized-profile>&q=<medication-name>`

- Requires Better Auth session, enrolled passkey, existing profile, current household membership and `manage_medication` capability.
- Query trimmed, whitespace-normalized, validated at 2–64 characters with a restricted character set. Queries are sent through `URLSearchParams` to an **allowlisted NLM origin** with an approximately 3.8-second timeout.
- NLM's 4-part response is normalized to `{source:'rxterms',results:[{name,normalizedName,brandName:null,conceptRxCui,synonyms,strengths:[{label,rxCui}],source}]}`. Invalid responses or upstream failure become bounded, user-friendly errors. The UI always allows manual entry.
- A **D1 atomic per-account 45 searches/minute** window prevents sustained misuse across Worker isolates. A bounded **10-minute, 200-query in-memory cache per isolate** reduces repeat upstream requests; this is not a distributed cache or offline catalog. The client also debounces name changes at 300 ms, rejects stale responses and never automatically picks a result.
- No plaintext patient detail is used for searching. Avoid logging medication search terms in app analytics.

## Database / compatibility

Migration `0009_medication_catalog.sql` appends **six nullable columns** to `medications`:

| Column | Meaning |
| --- | --- |
| `catalog_source` | `rxterms` if the user explicitly selects a catalog result; otherwise null |
| `catalog_identifier` | RxCUI of selected product strength/form, or RxTerms drug/route concept when no specific product was chosen |
| `normalized_name` | The **exact source display name** the user selected; null for manual |
| `brand_name` | Reserved for an independently verified explicit brand name; currently null |
| `product_strength` | **Exact STRENGTHS_AND_FORMS label** (e.g. `10 mg Tab`); includes form text and is **NOT** the prescribed dose |
| `dosage_form` | Reserved for an explicit verified structured dosage form; currently null |

The separate `medications.form` field remains editable and does not have to equal `product_strength`. Catalog selection does **not** fill in `medications.dose`, `instructions`, `cadence`, `medication_times`, `start_date`, `end_date`, clinician or notifications. No existing medication is modified by the migration. A user can always choose **Use custom medication name**, even if RxTerms returns matches, and previously saved records without catalog fields remain valid. Editing a medication preserves metadata when the selected name is unchanged; manually renaming it clears its catalog link.

`medication_catalog_search_limits` stores only the authenticated user ID and a window start/count, not search terms.

**No change** is made to the administration/history schemas, timestamps, duplicate-dose constraints, or permission grants. Do not collapse medication entries just because they share a catalog RxCUI; separately prescribed schedules can legitimately differ.

## Migration commands and checkpoints

**Only after saving a local database backup and ensuring the branch/build is ready:**

```bash
npm run db:backup:local
npm run db:local
npm run verify:pre-e2e
```

Expected: migration `0009_medication_catalog.sql` applied once, existing medications and recorded doses still visible, all JS/Python tests and TypeScript/build passing.

**Staging:** The repository currently has placeholder staging D1 and hostname values. First create/configure `carehold-staging` and set `APP_ORIGIN` and secrets appropriately; verify the exact D1 binding and live host. Then, after an explicit staging backup/approval:

```bash
npm run preflight:staging
npm run db:remote
npm run deploy:staging
```

These scripts are guarded against obvious placeholder configuration but do **not** back up or verify an existing remote database automatically.

**Production (not authorized):** Before a future production migration, confirm `wrangler.jsonc` has the actual production D1 ID, take/verify a restorable remote backup, review staging test results and obtain explicit approval. Only then run `npx wrangler d1 migrations apply carehold-production --env production --remote`. Do not run this command during the current pilot or assume staging verification authorizes production.

## One consolidated E2E pass

Add to `docs/E2E_ACCEPTANCE.md`:

1. Search **adderall**, pick a returned name, choose a returned strength/form, and confirm **prescribed dose is still blank** until manually entered.
2. Create and edit a scheduled medication; verify catalog source/RxCUI/strength persist in the record and that scheduling and dose history remain unchanged by edits.
3. Create a PRN entry from a catalog match, then a custom medication, OTC/supplement, and custom veterinary medication (with no drug-safety claims).
4. Test typo/missing result, a simulated offline/failed upstream request, and manual fallback while preserving any entered dose/schedule details.
5. Test touch and keyboard arrow/Enter/Escape interaction, accessible results, rapid-typing stale-response behavior, and names containing route/form suffixes.
6. Verify an unauthorized linked household member cannot call the search proxy or manage a medication; a permissioned caregiver can.
7. Verify the migration preserves existing medication records and historical administration events. Confirm an existing manual medication can still be edited without any RxCUI.
8. Check responsive layout and dark/light themes.

Run these together with the **existing single final E2E acceptance gate**, not as a separate partial testing round.

**Clinical note:** Search matches and product strengths are identifiers only; never choose a patient/pet dose from a directory result or infer veterinary suitability from human RxTerms coverage.
