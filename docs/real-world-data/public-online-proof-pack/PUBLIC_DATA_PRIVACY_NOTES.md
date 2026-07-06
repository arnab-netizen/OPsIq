# Public Data Privacy & Handling Notes

This proof pack uses **public data only** to build **anonymized, synthetic** fixtures. It does not ingest any private, customer, or account data.

1. **Only public data used.** Sources are public consumer-advice sites, industry guidance, review-theme aggregations, and official procurement-rule explainers (see `PUBLIC_DATA_SOURCE_LEDGER.json`). No login-only, paywalled, or private data.
2. **No login-only / private data used.** Nothing behind authentication, no account exports, no scraped-at-scale datasets, no ToS-bypassing access.
3. **No customer personal data retained.** No customer names, phone numbers, emails, or addresses appear in any fixture.
4. **No unnecessary names retained.** No real business, brand, franchisee, product, tenant, or staff names. All references are anonymized tokens (`biz-laundry-A`, `biz-saas-E`, …).
5. **No phone / email / customer addresses retained.** None were collected.
6. **Fixtures anonymized.** Every signal is a normalized, synthetic representation of a *theme*, not a copy of any specific review or page. No verbatim copyrighted text — only short thematic summaries.
7. **Public data treated as UNVERIFIED unless official.** Each signal carries a `sourceQuality` (`VERIFIED_SOURCE` / `PUBLIC_SOURCE_UNVERIFIED` / `THIRD_PARTY_UNVERIFIED` / `LOW_CONFIDENCE` / `UNKNOWN`) and an `evidenceStrength` (`STRONG` / `MODERATE` / `WEAK` / `INSUFFICIENT`). Only official procurement rules are `VERIFIED_SOURCE`; review themes are `THIRD_PARTY_UNVERIFIED`.
8. **OpsIQ must validate before action.** Weak/unverified public evidence must remain validation-needed; missing internal data must create a data task; a fix is never claimed effective without executed-with-evidence proof.
9. **No outreach or external action allowed.** No customer/tenant/buyer contact, no auto-send of any draft, no spend, no contract, no discount.
10. **No tender submission allowed.** Tender/procurement signals may only produce readiness/eligibility/cost tasks and an owner decision — never an auto-submit, EMD payment, or contract action.

**Copyright minimization:** only short paraphrased theme summaries are stored; no long or verbatim review/article text is copied into the repo.

**Ground-truth caveat:** public reviews and third-party posts are *signals*, not verified facts about any specific business. OpsIQ treats them as such throughout this pack.
