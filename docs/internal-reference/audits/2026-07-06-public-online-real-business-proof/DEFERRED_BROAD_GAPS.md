# Deferred Broad Gaps — PASS 27D

PASS 27D is **bounded gap closure only**. The end-to-end DB simulation (10/10) and all three decision matrices passed with no in-scope defect, so **no code fix was required in this pass**. The items below are genuine broader gaps surfaced during the audit. They are **out of scope** for a public-data proof pack and are recorded here so they are not silently buried. Each stays FROZEN until explicitly commissioned.

## Deferred (not fixed in 27D — out of scope, would exceed the proof-pack mandate)

1. **Free-text public ingestion.** OpsIQ does not parse arbitrary public web text. The fixtures are the normalization a human/analyst performs on public reviews/notices; the proof covers governed routing + safety over *normalized* signals. Building an ingestion/NLP layer that turns raw public text into `ProcessCorrection` inputs is a separate, large module (and carries scraping/ToS/copyright risk). FROZEN.

2. **Live external connectors.** No live review-site, app-store, tender-portal, or RFP connectors were built. Signals are static anonymized fixtures. Any live connector touches auth, rate limits, ToS, and PII handling. FROZEN.

3. **Autonomous external action.** By design, no auto-submit / auto-send / auto-spend / auto-contract / outreach route exists (proven by simulation test 6). Adding any is explicitly out of scope and against the safety mandate. FROZEN.

4. **Verified internal financials.** Real per-business financials, defect rates, capacity, response times, and activation/MRR are not public and were not invented. Closing this requires the owner's own data ingestion, not public data. Every case correctly preserves a missing-internal-data condition instead. FROZEN for this pack.

5. **Multi-archetype product expansion.** The simulation proves the *existing* governed substrate handles 8 archetypes without laundry bias. It does not add archetype-specific product surfaces (dashboards, per-vertical UIs). That expansion remains FROZEN.

## Why deferred rather than fixed here

Each item above is a new module or a policy change, not a bounded bug in the audited path. Implementing any would violate the proof-pack scope ("bounded fixes only") and, for items 1–3, the standing safety mandate (no autonomous external action, no scraped-at-scale ingestion). They are documented, not closed.
