# Final Conflicting Signal Proof Report — PASS 29

**Date:** 2026-07-07

## 1. Main HEAD before
`b976e3a19aadeb093b0320f3f4e1ac869304601d` (PR #160 merged; contains #157–#160).

## 2. Branch
`claude/interpreter-conflicting-signal-hardening`

## 3. Files changed
**Added (code):**
- `src/domain/owner-mode/public-signal-conflict-resolution.ts` — deterministic conflict layer + Zod schema + bridge adapter.
- `src/__tests__/owner-mode/public-signal-conflict-resolution.test.ts` — 23 unit tests.
- `src/__tests__/execution/conflicting-public-signal-end-to-end.db.test.ts` — 14-test end-to-end DB sim.

**Changed (code):**
- `src/domain/owner-mode/public-signal-interpretation.ts` — added `POSITIVE_OR_RESOLVED_CLAIM` classification (a positive review is a claim, not proof) and narrowed the discount path to real price-change intent (bare "competitor" no longer forces an owner pricing gate).

**Changed (CI):** `.github/workflows/db-verification.yml` — wired the new DB sim into LANE_B + LANE_A.

**Added (docs — fixtures):** `docs/real-world-data/conflicting-public-signal-proof/` — `CONFLICTING_RAW_SIGNAL_FIXTURES.json`, `CONFLICT_EXPECTATIONS.json`, `CONFLICT_PRIVACY_AND_SAFETY_NOTES.md`, `CONFLICT_FIXTURE_REPORT.md`.

**Added (docs — audit):** `docs/audits/2026-07-07-conflicting-public-signal-hardening/` — this report, `CONFLICT_DECISION_MATRIX.json`, `CONFLICT_SAFETY_MATRIX.json`, `EVIDENCE_LEDGER.json`, `DEFERRED_BROAD_GAPS.md`.

## 4. Schema changed
None. No Prisma model/migration change — the conflict layer reuses the existing `ProcessExecutionTask` / governed-bridge substrate.

## 5. Conflict fixture count
19 conflict cases + 1 clean control = 20.

## 6. Archetypes covered
laundry, housekeeping, property, franchise, SaaS, tender (not skipped), B2B, collective — 8/8, plus adversarial/PII/finance/noisy variants.

## 7. Adversarial cases covered
injected "mark verified"; injected "submit tender / email customer"; PII across multiple signals; "90% win probability / guaranteed profit"; noisy multi-topic text.

## 8. Conflict classifications
NO_CONFLICT, SUPPORTING_SIGNALS, CONTRADICTORY_SIGNALS, MIXED_RECENCY, WEAK_SINGLE_SIGNAL, REPEATED_WEAK_SIGNALS, OFFICIAL_SOURCE_CONFLICT, THIRD_PARTY_UNVERIFIED_CONFLICT, MISSING_INTERNAL_DATA, HIGH_RISK_UNRESOLVED, VALIDATION_REQUIRED, MONITOR_ONLY, BLOCK_UNSAFE, UNKNOWN — deterministic per case in `CONFLICT_EXPECTATIONS.json`.

## 9. Conflict decision behavior
One weak signal → validation; repeated weak → reassessment (never accusation); official → published facts only; positive → cannot close without executed-correction + outcome evidence; recent negative reopens "fixed"; tender urgency → data-first, submit blocked; growth + weak quality/capacity → fix/validate first, scale blocked; material pricing/brand/spend/commitment → owner-gated; duplicates cluster to one cockpit action; uncertainty → conservative route.

## 10. DB sim result
`conflicting-public-signal-end-to-end.db.test.ts` — **14/14 passed** locally against Postgres 16.

## 11. LANE_B proof
Wired into LANE_B + LANE_A. To be confirmed in CI: `✓ …conflicting-public-signal-end-to-end.db.test.ts (14 tests)` executed with LANE_B ending `LANE_B_DB_VERIFIED`. A generic green DB lane is not accepted unless the new sim is visibly executed.

## 12. Bounded fixes made
- Added `POSITIVE_OR_RESOLVED_CLAIM` so a good review is treated as an unverified claim, not proof.
- Narrowed the discount path to real price-change intent (bare "competitor" no longer forces owner pricing gate) — fixed the B2B "competitor gap = opportunity" mis-route.
- Narrowed conflict "growth" to true scale-temptation (tender/B2B pursuits use data-first handling, not the scale-block).
- Added a lone-positive branch (a positive claim alone → monitor-only, not effectiveness proof).

## 13. Broad gaps deferred
LLM/NLP understanding, live connectors/crawling/scraping, autonomous external action, real-timestamp recency, weighted statistical fusion, private owner shadow pilot, multi-archetype product UI — all FROZEN (`DEFERRED_BROAD_GAPS.md`).

## 14. Commands run
`git status`, `git rev-parse HEAD`, `prisma validate`, `prisma generate` (via test bootstrap), `tsc --noEmit`, `governance:scan:strict`, `lint:ratchet`, interpreter unit tests, conflict unit tests, raw-text DB sim, conflict DB sim, full execution DB suite, `next build`.

## 15. Commands failed / blocked
The local Postgres cluster was stopped at session resume (`pg_ctlcluster 16 main start` restarted it; the throwaway `opsiq_test` DB was intact) — a local infra hiccup, not a code failure.

## 16. CI status
To be recorded at merge: required checks LANE_B / Build + Type + Prisma Verify / lint (20.x) must be green with the new sim proven executed in LANE_B.

## 17. Final classification
**CONFLICTING_PUBLIC_SIGNAL_HANDLING_ELITE_ACCEPTED** — with the honest boundary that the layer is deterministic/rule-based over controlled fixtures, not an LLM and not a live ingester (disclosed, not worked around).

## 18. PR / merge status
PR "Interpreter conflicting signal adversarial hardening" — to be opened from the branch; merge only when required CI is green and LANE_B proves the new sim executed.

## 19. Main HEAD after merge
To be recorded after merge.

## 20. Exact next safest pass
**Multi-Signal Volume & Prioritisation Stress Proof** — feed a workspace many (10–50) mixed conflicting controlled signals across several concurrent issues at once, and prove the layer still yields a single, correctly-prioritised, conservative top collective action (most-severe unresolved risk first), clusters aggressively, never spams the cockpit, and never lets volume manufacture false certainty. Still deterministic, still controlled fixtures, no live ingestion. (Live connectors, LLM understanding, and the private owner shadow pilot remain frozen until explicitly commissioned.)
