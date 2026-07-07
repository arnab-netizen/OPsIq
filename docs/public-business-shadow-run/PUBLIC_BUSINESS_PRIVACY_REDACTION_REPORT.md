# Public Business — Privacy & Redaction Report (PASS 43)

**Date:** 2026-07-07

## Principle
Real public sources were used **only** to create anonymized, privacy-safe shadow fixtures. OpsIQ itself performs
**no** live fetch, scraping, connector, or LLM call — there is **no live internet intelligence**. Every public
item is a **PUBLIC SIGNAL**, not a confirmed fact.

## Anonymization
- Real business names appear **only** in the internal `PUBLIC_BUSINESS_SOURCE_LEDGER.json` (as source URLs).
  Fixtures and the cockpit use anonymized ids only: `BUSINESS_A`, `BUSINESS_B`, `BUSINESS_C`, `BUSINESS_CLEAN`.
- People/customers/staff/vendors/locations are placeholders: `CUSTOMER_001`, `STAFF_A`, `VENDOR_A`, `LOCATION_A`,
  `PUBLIC_REVIEW_001`, `PUBLIC_SIGNAL_001`.

## Redaction applied
| Field type | Treatment |
|-----------|-----------|
| reviewer names / personal names | removed (never retained) |
| emails / phone numbers | removed; the DB sim additionally seeds a PII-bearing raw review to PROVE the pipeline strips it |
| specific business identity | anonymized to BUSINESS_x; kept only in the source ledger as a URL |
| staff identity in "attitude" reviews | removed; reframed as a weak service-process signal, never a named accusation |
| internal financials (cost/cash/revenue/margin) | not present — unknown, marked missing-data, never fabricated |

## Defamation safety
Observations are kept at **theme/category level** and phrased as possibilities, e.g.:
- ✅ "Public review signals suggest possible delivery-delay complaints."
- ❌ "This business has bad staff" / "this business is failing." — never written.

The `DO_NOT_USE` item (PC-B5) is a raw review naming an individual with a personal accusation: it is redacted and
**excluded** from governed signals (PII + defamation risk).

## Source quality, staleness, conflict, missing-data
- Third-party review themes are marked `THIRD_PARTY_UNVERIFIED` / `THIRD_PARTY_AGGREGATE` → **validation required**.
- The public tender (PC-A4) is `OFFICIAL_PUBLIC_PORTAL` but its listed deadlines (May–June 2026) have **passed**
  as of 2026-07-07 → marked **stale** → readiness/monitor only, never auto-submit.
- Conflicting SaaS reviews (PC-C3) → **conflict-labelled**.
- The hiring/staffing signal (PC-C4) is an **inference**, marked `INFERRED_WEAK` → never asserted as fact.
- All internal financials/rates are **missing-data** → OpsIQ raises a missing-data request, never fabricates.

## PII-strip proof (runtime)
`real-public-business-shadow-run.db.test.ts` seeds a raw public review containing an email + phone + injection
string and asserts the owner-facing public-signals read hides raw text, strips PII, resists the injection, and
states the no-live-ingestion boundary — so even a hostile raw public post cannot leak PII or steer the system.

## Boundary restated
No business, customer, staff member, vendor, or third party was contacted. No tender was submitted, no message
sent, no money moved, no contract changed. This is a controlled public-data shadow run — not a live pilot.
