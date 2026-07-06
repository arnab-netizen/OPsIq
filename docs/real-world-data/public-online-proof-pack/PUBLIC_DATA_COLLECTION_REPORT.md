# Public Data Collection Report — PASS 27A

**Collected:** 2026-07-06 · **Method:** public web search for aggregated complaint/opportunity themes and official procurement rules.

## Archetypes covered (8 of 8)
1. Laundry / local service ✅
2. Housekeeping / facility services ✅
3. Property management ✅
4. Franchise operations ✅
5. SaaS ✅
6. Tender / procurement ✅ (not skipped)
7. B2B service ✅
8. Collective multi-module conflict ✅ (synthesized from public themes)

## Sources per archetype
One curated public source-theme per archetype (8 ledger rows) plus a synthesized composite for the collective case. Each row records sourceType, quality, evidence strength, official-source flag, missing data, and the privacy/copyright action taken.

## Source types used
Public consumer-advice sites, industry/janitorial guidance, property-management retention guides, franchise-consistency guides, SaaS review-theme aggregations, official government procurement (EMD/eligibility) rules, and B2B RFP evaluation guidance.

## Privacy actions
No customer/business/tenant/staff names, no phone/email/address, no login-only or scraped-at-scale data. All fixtures anonymized. See `PUBLIC_DATA_PRIVACY_NOTES.md`.

## Copyright minimization actions
Only short paraphrased theme summaries stored; no verbatim review/article text copied.

## Source reliability limitations
- Review-theme sources are `THIRD_PARTY_UNVERIFIED` with `MODERATE`/`WEAK` evidence — they describe *typical patterns*, not a verified state of any one business.
- Only the procurement-rule source is `VERIFIED_SOURCE` (`STRONG`), and even then bid/no-bid still needs the owner's own eligibility + cost data.
- No verified internal financials, defect rates, capacity, or conversion/MRR exist publicly; none were fabricated. Every case preserves explicit missing-internal-data conditions.

## Missing data (honest)
Real per-business financials, defect rates, capacity, response times, and activation/MRR are **not public** and were **not invented**. A `PUBLIC_DATA_NOT_FOUND` entry records this in the source ledger.

## Fixture creation status
Complete: `PUBLIC_DATA_SOURCE_LEDGER.json`, `PUBLIC_SIGNAL_FIXTURES.json`, `PUBLIC_BUSINESS_CASE_PACKS.json`, plus the privacy notes and this report.

## Continuing to PASS 27B?
**Yes** — the privacy-safe fixtures are ready to drive the end-to-end DB simulation (`public-online-real-business-end-to-end.db.test.ts`), one workspace per archetype.
