# Deferred Broad Gaps — PASS 28

PASS 28 is **bounded gap closure only**. The interpreter, its Zod validation, the 24-test unit suite, and the 18-test end-to-end DB simulation all passed with no in-scope defect, so **no broad rewrite was required or performed**. The items below are genuine broader capabilities surfaced during the pass. They are **out of scope** for a raw-text interpretation proof and are recorded here so they are not silently buried. Each stays FROZEN until explicitly commissioned.

## Deferred (not built in PASS 28 — out of scope / against the standing safety mandate)

1. **LLM / NLP free-text understanding.** The interpreter is deterministic and rule-based over controlled fixtures. A general model that understands arbitrary, messy public prose (sarcasm, mixed languages, long threads) is a separate, large capability with its own evaluation and prompt-injection surface. FROZEN.

2. **Live external connectors / crawling / scraping / autonomous browsing.** No live review-site, app-store, tender-portal, or RFP connectors were built; all input is controlled fixtures. Any live ingestion touches auth, rate limits, ToS, and PII-at-scale. FROZEN.

3. **Autonomous external action.** By design, no auto-submit / auto-send / auto-spend / auto-contact / outreach route exists (db test 7). Adding any is explicitly out of scope and against the safety mandate. FROZEN.

4. **Verified internal financials.** Real per-business financials/defect rates/capacity/MRR are not public and were not invented; the interpreter preserves explicit missing-internal-data conditions and never accepts a public money claim as fact. Closing this needs the owner's own data ingestion. FROZEN for this pass.

5. **Private owner shadow pilot.** Using anonymized real data from the owner's own business (the Option B candidate) is a separate pack with its own privacy handling. FROZEN.

6. **Multi-archetype product expansion / UI surfaces.** This pass proves the interpreter + governed substrate handle 8 archetypes safely; it does not add per-vertical dashboards or product UIs. FROZEN.

## Why deferred rather than fixed here

Each item is a new capability or a policy change, not a bounded bug in the audited path. Implementing any would exceed the proof scope ("bounded fixes only") and, for items 1–3 and 5, the standing safety mandate (no autonomous external action, no scraped-at-scale ingestion, no private-data ingestion). They are documented, not closed.
