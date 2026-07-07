# Deferred Broad Gaps — PASS 29

PASS 29 is **bounded gap closure only**. The conflict-resolution layer, its Zod validation, the 23-test unit suite, the 24-test interpreter regression suite, and the 14-test end-to-end DB simulation all passed with no in-scope defect, so **no broad rewrite was required or performed**. The items below are genuine broader capabilities surfaced during the pass. They are **out of scope** and recorded here so they are not silently buried. Each stays FROZEN until explicitly commissioned.

## Deferred (out of scope / against the standing safety mandate)

1. **LLM / NLP understanding of arbitrary prose.** The interpreter + conflict layer are deterministic and rule-based over controlled fixtures. Understanding sarcasm, mixed languages, long threads, or implicit sentiment is a separate, large capability with its own evaluation and injection surface. FROZEN.

2. **Live external connectors / crawling / scraping / autonomous browsing.** No live review-site, app-store, tender-portal, or RFP connectors were built; all input is controlled fixtures. FROZEN.

3. **Autonomous external action.** No auto-submit / auto-send / auto-spend / auto-contact / outreach route exists (db test 17). Adding any is out of scope and against the safety mandate. FROZEN.

4. **Recency from real timestamps.** Recency is a caller-supplied marker (`RECENT`/`OLD`/`UNKNOWN`) so the layer stays deterministic (no clock). Deriving recency from real signal timestamps belongs to an ingestion layer, not this pass. FROZEN here.

5. **Weighted/statistical signal fusion.** The layer uses conservative rule precedence, not a weighted probabilistic model. A calibrated fusion model would need labelled ground-truth data that does not exist publicly. FROZEN.

6. **Private owner shadow pilot.** Using anonymized real data from the owner's own business is a separate pack with its own privacy handling. FROZEN.

7. **Multi-archetype product UI surfaces.** This pass proves the decision layer + governed substrate; it does not add per-vertical dashboards. FROZEN.

## Why deferred rather than fixed here

Each item is a new capability or a policy change, not a bounded bug in the audited path. Implementing any would exceed the proof scope and, for items 1–3, 5, 6, the standing safety mandate (no autonomous external action, no scraped-at-scale ingestion, no LLM understanding layer, no private-data ingestion). They are documented, not closed.
