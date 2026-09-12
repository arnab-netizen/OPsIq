# Deferred Broad Gaps — PASS 31

PASS 31 is **bounded gap closure only**. The explanation layer, its Zod validation, the 20-test unit suite, the upstream regression suites, and the 13-test DB simulation all passed with no in-scope defect, so **no broad rewrite was required**. The items below are out of scope and recorded so they are not buried; each stays FROZEN.

## Bounded change made in-pass (not deferred)
- Added two summary fields (`sourceQualitySummary`, `evidenceStrengthSummary`) to the PASS 30 `IssueClusterView` so the explanation can express verified vs unverified evidence. Minimal, additive, schema-covered; PASS 30 tests unchanged and still green.
- Populated `requiredEvidenceBeforeCompletion` for data-first (missing-data) top actions with the exact internal data to capture.

## Deferred (out of scope / against the standing safety mandate)
1. **Natural-language generation.** Owner copy is templated from governed fields. An LLM-written narrative is a separate capability with its own hallucination/injection surface. FROZEN.
2. **Interactive cockpit UI.** This pass proves the explanation object; it does not build a new cockpit surface. FROZEN.
3. **Live external connectors / crawling / scraping / autonomous browsing.** FROZEN.
4. **Autonomous external action.** No auto-submit/send/spend/contact route exists. FROZEN.
5. **Private owner shadow pilot.** FROZEN.
6. **Truth-ledger pass.** Explicitly excluded from this loop. FROZEN.

## Why deferred rather than fixed here
Each is a new capability or policy change, not a bounded bug in the audited path. Implementing any would exceed the proof scope and, for items 1,3,4,5, the standing safety mandate.
