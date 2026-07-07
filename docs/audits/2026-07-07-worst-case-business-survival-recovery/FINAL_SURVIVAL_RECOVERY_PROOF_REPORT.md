# Final Survival & Recovery Proof Report — PASS 32

**Date:** 2026-07-07

## 1. Main HEAD before
`97b831fec96cb3e9a0f3006c12fd9eb796f60d99` (PR #163 merged; contains #157–#163).

## 2. Branch
`claude/worst-case-business-survival-recovery-simulation`

## 3. Files changed
**Added (code):** `src/domain/owner-mode/business-survival-recovery.ts`; `src/__tests__/owner-mode/business-survival-recovery.test.ts` (18 unit); `src/__tests__/execution/worst-case-business-survival-recovery.db.test.ts` (13 DB).
**Changed (CI):** `.github/workflows/db-verification.yml` — wired the new DB sim into LANE_B + LANE_A.
**Added (docs — fixtures):** `docs/real-world-data/worst-case-survival-recovery-proof/` (crisis fixtures, expectations, privacy/safety notes, fixture report).
**Added (docs — audit):** `docs/audits/2026-07-07-worst-case-business-survival-recovery/` (this report, survival decision matrix, crisis safety matrix, recovery milestone matrix, evidence ledger, deferred gaps).

## 4. Schema changed
None (Prisma). No model/migration change — every survival action routes through the existing `ProcessExecutionTask` / approval / evidence / reassessment systems. Only in-code Zod/TS types added.

## 5. Crisis cases
10: laundry, housekeeping, property, franchise, SaaS, tender, B2B, collective collapse, unrecoverable/near-insolvent, clean control. Each carries multiple simultaneous failures.

## 6. Survival / stabilization / thrive-gate behavior
Survival-first ladder: unrecoverable → survival triage (cash) → cash protection → customer/reputation recovery → quality stabilization → operations stabilization → owner-workload → capability blocker → validation-before-growth. Growth/marketing/expansion/tender-submit/discount is blocked-before-stabilization in every plan. The thrive gate stays BLOCKED until stabilization is proven, cost/capacity data exists, and the owner approves. Every crisis carries ordered recovery milestones with evidence + reassessment.

## 7. Unrecoverable case behavior
When cash runway, feasible near-term revenue, owner capital, and capacity are all absent, the plan returns `UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS` with an owner-gated restructure / controlled-shutdown review + urgent owner/expert decision and the missing data to gather — **no fake optimism, no guaranteed recovery**.

## 8. DB sim result
`worst-case-business-survival-recovery.db.test.ts` — **13/13 passed** locally against Postgres 16.

## 9. LANE_B proof
Wired into LANE_B + LANE_A. To be confirmed in CI: `✓ …worst-case-business-survival-recovery.db.test.ts (13 tests)` with LANE_B ending `LANE_B_DB_VERIFIED`. Generic green not accepted.

## 10. Bounded fixes made
- Removed a dead double status-assignment in the legal branch (single coherent status).
- Narrowed a no-op growth refinement to enforce "growth always blocked-before-stabilization" instead.

## 11. Broad gaps deferred
Real financial ingestion/runway modelling, LLM/NLP narration, live connectors/crawling, autonomous external action, private owner shadow pilot, truth-ledger, learned recovery sequencing — all FROZEN (`DEFERRED_BROAD_GAPS.md`).

## 12. Commands run
git status / rev-parse, prisma validate, prisma generate (bootstrap), tsc, governance:scan:strict, lint:ratchet, interpreter/conflict/prioritisation/explanation/survival unit tests, survival DB sim, full execution + owner-mode suites, next build.

## 13. Commands failed / blocked
Local Postgres cluster was stopped at resume (restarted; throwaway DB intact) — infra hiccup, not a code failure.

## 14. CI status
To be recorded at merge: required LANE_B / Build + Type + Prisma Verify / lint (20.x) green with the new sim proven executed in LANE_B.

## 15. Final classification
**WORST_CASE_SURVIVAL_RECOVERY_ELITE_ACCEPTED** — with the honest boundary that the layer is deterministic/rule-based over controlled internal-pressure inputs, never fabricates financials, and does not ingest live data (disclosed, not worked around).

## 16. PR / merge status
PR "Worst case business survival recovery simulation" — to be opened; merge only when required CI is green and LANE_B proves the new sim executed.

## 17. Main HEAD after merge
To be recorded after merge.

## 18. Exact next safest pass
**Recovery Execution & Milestone-Proof Simulation** — drive a crisis workspace *forward through* its recovery milestones over successive governed cycles (stop-loss → cash measured → quality corrected with proof → operations resolved → stabilization gate met → thrive gate opens), proving each milestone only advances on real executed + reassessed evidence, the thrive gate opens *only* after all stabilization criteria are evidenced, and no step can be skipped or faked. Still deterministic, still controlled fixtures, no live ingestion. (Live connectors, LLM understanding, private owner shadow pilot, and the truth-ledger remain frozen until explicitly commissioned.)
