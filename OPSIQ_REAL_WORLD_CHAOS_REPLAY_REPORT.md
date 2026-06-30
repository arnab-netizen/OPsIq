# OpsIQ Real-World Chaos Replay + Observer/Audit — Report

> Hostile-skeptical good/bad/ugly real-world outcome validation. Claude/observer acts as **auditor only,
> after** OpsIQ output is produced; it never influences the runtime decision. Expected outcomes are
> **locked before** grading. No parallel brain, no LLM in the runtime, no autonomy, no gate weakening.

## 1. Branch
`claude/real-world-chaos-replay-audit`

## 2. Base HEAD (updated main, PR #61 merged)
`8684fc09c641a4c22223f2686d183dc1c7a3c8e9`

## 3. Final HEAD
`8d2a1ac2402033715da4f847df5ebbd84b9ee8a4`

## 4. Working tree status
Clean after commits. **Diff is additive only** — new validation modules under
`src/behavioral-validation/chaos-replay/`, their tests, and markdown. **No existing production / UI / route /
service / runtime / scorer / arbitration / supervisor file was modified** (`git diff --name-only` vs base
contains only `chaos-replay/*`, `__tests__/*`, `*.md`). The chaos modules only **import and replay** the
existing runtime; nothing in `src/app` or `src/components` imports them, so the browser surface is unchanged.

## 5. Counted real-world scenarios run
**165** counted, source-backed real-world chaos scenarios (15 required categories × 11 sourced patterns),
each lifted from a real `PublicCase` (real `sourceRef` + locked `goldSkeleton`). All 165 ran through the
production runtime and were audited against locked expectations.

## 6. Synthetic (non-counted) edge cases
1 marked synthetic edge scenario (`SYNTH-CLEAN-TEXTBOOK`), used only to prove the gates reject synthetic /
clean-textbook / unsourced cases. **0 synthetic cases count toward readiness.**

## 7. Source summary
Counted scenarios inherit the real public-pattern source register (`SOURCE_REGISTER`, 20 sources:
case studies, failure post-mortems, turnaround stories, sector/finance/cyber/staffing/regulatory examples).
Every counted `sourceRef` matches a real `SRC-…` id (no hallucinated refs). Privacy gates (PII + long-copied-
text) are enforced and tested.

## 8. Source limitation summary
Every counted scenario carries ≥1 limitation label (self-reported owner claim, incomplete financials,
outdated info, jurisdiction uncertainty, possible fraud/manipulation, unverifiable claim). Source reliability
is high/medium only; **no real case is treated as fully verified** — at replay the supervisor surfaces missing
data and never reads high confidence while a critical domain is unbacked.

## 9. Categories covered (15)
laundry · housekeeping · restaurant · retail_grocery · pharmacy · salon · repair · manufacturing · logistics ·
agency · ecommerce · eldercare · franchise · multi_location · b2b_contractor. (The "remote-owner staff-managed"
business model is covered cross-category via the `owner_overload` / `local_market_remote` patterns.)

## 10. Good / bad / ugly coverage
Every category has ≥1 good + ≥2 bad + ≥2 ugly (11 per category: 1 good `weak_unit_economics_scale`, 4 bad
`owner_overload`/`quality_complaints`/`seasonality_planning`/`local_market_remote`, 6 ugly
`cashflow_squeeze`/`over_expansion`/`compliance_shutdown_risk`/`fake_completion_proof`/`fake_vendor_fraud`/
`cyber_payment_fraud`). Good/bad/ugly correctness = **100 / 100 / 100**.

## 11. OpsIQ layer-by-layer coverage matrix
All **30** layers covered; high-risk layers (data sufficiency, collective arbitration, AI supervisor, cash/
runway, proof/anti-gaming, professional-review, stop/shutdown/pivot, owner/delegate) each have ≥5 assertions.
Matrix complete = **true** (0 uncovered, 0 high-risk-under-5). Browser/mobile, DB tenancy, manual/DB data
paths, and max-reliability ratchet are credited by their own proven gates.

## 12. Modules expected vs used
Module routing score = **100**. Every scenario assessed a broad domain set (≥6 ingestion domains) and routed
to the correct binding domain (dominant constraint exact on 165/165). No scenario accepted the tempting wrong
action as a winning module.

## 13. Unnecessary dominant module count
**0**.

## 14. Dominant constraint accuracy
**100** (165/165 — the real `arbitrate()` engine resolved each case to its locked expected dominant).

## 15. Evidence sufficiency score
**100** (confidence honest, assumptions marked, missing-data surfaced, proof + reassessment present).

## 16. AI Supervisor behaviour score
**100** (correct/over-cautious action status, do-not-do present, safe next action that is never the tempting
move, honest confidence, owner/delegate split present).

## 17. Dashboard usefulness score
**100** (all required panel fields runtime-fed; ≤3 priorities; one primary action each; advanced reasoning
collapsed; mobile-bounded). Proven at the jsdom component level for representative good/bad/ugly scenarios.

## 18. Owner comprehension score
**100** (crisp primary action, concise ≤3-priority structure, no wall of text on the first screen).

## 19. Business outcome usefulness score
**100** (recommendations protect cash/margin/workload/quality, reject the tempting move, require proof, and
avoid the real-world consequence).

## 20. Good / bad / ugly correctness scores
good **100** · bad **100** · ugly **100**.

## 21. Unsafe / generic / fake-confidence counts
unsafe output **0** · generic advice **0** · fake high confidence **0**.

## 22. Bad-outcome-if-followed count
**0** overall (and **0** on high-risk cases). Every ugly/blocked case has `canProceed === false`.

## 23. Failures and fixes
No failures in the counted run (165/165 pass). The failure→fix loop is proven by adversarial auditor tests:
injected wrong-dominant / fake-confidence / generic / missing-do-not-do / missing-proof / bad-outcome / wrong-
routing outputs are each flagged, and a failed audit opens an adjudication item + regression case + a scoped
(never global) learning candidate, with before/after rerun improvement recorded.

## 24. Regression / learning artifacts
`chaos-learning` emits, per failure: an adjudication item (open, high-risk flagged), a regression case
(`rerunOnEveryRun`), and — only when safe (not an unsafe/fake-confidence breach) — a `local_only`,
approval-gated learning candidate that is **never globally promoted**. Unresolved high-risk failures stay
visible and block readiness.

## 25. Browser / mobile proof
jsdom dashboard chaos proof (10 tests, 8 representative good/bad/ugly scenarios) renders the **real**
SupervisorSummary panel from **real** replay output: runtime-fed, no static fallback, ≤3 priorities, one
primary action each, advanced reasoning collapsed, mobile-bounded, blocked/need-more-data never reads
"Proceed". The full Next + Playwright lane (specs 13–18) was **not re-run locally** because the diff is
validation/test-only and does not alter the browser surface (byte-identical to merged PR #61, where 13–18
passed); **PR CI must run owner-pilot-e2e specs 13–18 and they must be green before merge.**

## 26. DB proof
`TEST_WITH_DB=true` on local Postgres 16: chaos DB isolation (3) + owner-whole-business-plan.db +
owner-business-isolation.db + owner-pilot-surfaces.db + real-db-ingestion.db = **5 files / 26 tests passed**.
Each chaos scenario replays in its **own isolated workspace+business** through the real DB runtime
(`getOwnerWholeBusinessPlan`), resolves its own dominant + a safe supervisor disposition from real scoped
rows, and **no cross-workspace / cross-business leakage** occurs (a wsA business is `found:false` under wsB).

## 27. No-regression proof
- Non-DB gates (owner-mode + behavioral-validation + components): **980 passed / 24 skipped** (incl. the +75
  new chaos tests; AI supervisor, max-reliability + ratchet, owner-pilot, source/privacy, isolation,
  learning-governance/adjudication all green).
- DB gates (TEST_WITH_DB): **26 passed**.
- `tsc` 0 · `eslint` (chaos files) 0 · `lint:ratchet` PASS (baseline errors 2155→2155) · `prisma validate` valid.
- Playwright 13–18: surface unchanged → standing green from PR #61; to be reconfirmed on PR CI.

## 28. Final classification
**`REAL_WORLD_CHAOS_REPLAY_READY`**

All gates met: ≥75 counted real scenarios (165) run; synthetic not counted; ≥15 categories; good/bad/ugly per
category; all mandatory chaos types; every OpsIQ layer covered; module routing/dominant/supervisor/evidence
= 100 (≥90); dashboard/owner-comprehension = 100 (≥85); business outcome = 100 (≥90); good/bad/ugly = 100 each
(≥90); unsafe = 0; generic = 0; fake high confidence = 0; bad-outcome-if-followed high-risk = 0; unresolved
high-risk failures = 0; DB proof passes; jsdom browser/mobile chaos proof passes (full Playwright 13–18 to be
reconfirmed on PR CI); max-reliability, owner-pilot, and AI supervisor remain green.
