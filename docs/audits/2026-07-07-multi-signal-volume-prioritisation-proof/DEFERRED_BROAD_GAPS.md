# Deferred Broad Gaps — PASS 30

PASS 30 is **bounded gap closure only**. The prioritisation layer, its Zod validation, the 20-test unit suite, the interpreter/conflict regression suites, and the 14-test high-volume DB simulation all passed with no in-scope defect surviving, so **no broad rewrite was required**. The items below are genuine broader capabilities surfaced during the pass. They are **out of scope** and recorded here so they are not silently buried. Each stays FROZEN until explicitly commissioned.

## Bounded fix made in-pass (not deferred)
- **Growth demotion via stray keywords.** An early version demoted a real quality cluster to the growth tier because the mixed cluster text mentioned "marketing"/"grow". Fixed: growth is now decided by the cluster's **topic**, never by keywords in mixed text — so genuine unresolved quality/cash/capacity risk can never be hidden under a growth tier.

## Deferred (out of scope / against the standing safety mandate)

1. **Finer topic clustering.** Topic grouping is coarse (bounded by interpreter granularity): a few off-topic signals can fold into a broad cluster (e.g. a brand-page signal into the quality cluster), which is over-conservative (extra owner-gating), never unsafe. A dedicated finer clustering/sub-topic pass is deferred.

2. **Learned/weighted prioritisation.** Priority is a transparent rule-based tier with reasons. A calibrated weighted model would need labelled ground-truth data that does not exist publicly. FROZEN.

3. **LLM / NLP understanding of arbitrary prose.** The stack is deterministic and rule-based over controlled fixtures. FROZEN.

4. **Live external connectors / crawling / scraping / autonomous browsing.** All input is controlled fixtures. FROZEN.

5. **Autonomous external action.** No auto-submit / auto-send / auto-spend / auto-contact / outreach route exists. FROZEN.

6. **Private owner shadow pilot.** Anonymized real owner-business data is a separate pack with its own privacy handling. FROZEN.

7. **Multi-archetype product UI / cockpit surfaces.** This pass proves the decision/prioritisation layer + governed substrate; it does not add per-vertical dashboards. FROZEN.

## Why deferred rather than fixed here

Each deferred item is a new capability or a policy change, not a bounded bug in the audited path. Implementing any would exceed the proof scope and, for items 3–6, the standing safety mandate (no autonomous external action, no scraped-at-scale ingestion, no LLM understanding layer, no private-data ingestion). They are documented, not closed.
