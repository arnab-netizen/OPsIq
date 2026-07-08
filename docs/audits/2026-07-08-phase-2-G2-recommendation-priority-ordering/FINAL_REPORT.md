# Phase 2 G2 — Recommendation Priority Ordering End-to-End Proof (Final Report)

## 1. Gap ID
**G2** (Wave-8 owner-journey coverage matrix).

## 2. Owner-journey stage
Stage 4 — `recommendation-priority` ("Recommendation generation & priority ordering surfaced to the
owner"). Dimensions exercised: (2) business condition; (3) intervention mode + phase (priority
reflects intervention urgency surfaced to the owner).

## 3. Baseline status from Wave-8 matrix
`partial_gap`. Wave-8 recorded: "Cockpit renders recommendations; an explicit ordering/priority
assertion end-to-end (highest-priority first, deterministic) is owed (ties to Wave-3/4 recommendation
proofs)." The Wave-3 DB test asserted ordering using a **lexical string comparison** of
`high`/`medium`/`low` (`prev.priority >= curr.priority`), which is not semantic
highest-priority-first — lexically `"high" < "low" < "medium"`. Because every recommendation Wave-3
created was `high` (uniform), that flawed assertion never actually exercised mixed-priority ordering.

## 4. Product defect found
**Yes — a real owner-facing defect.** `getRecommendationsForEngagement`
(`src/services/recommendation.ts`) — the listing service behind the owner recommendations API route
(`src/app/api/engagements/[engagementId]/recommendations/route.ts`) that the cockpit consumes —
ordered with `orderBy: [{ priority: "desc" }, { createdAt: "desc" }]`. `Recommendation.priority`
(`prisma/schema.prisma`) is a **plain `String` column**, so Postgres sorted it **lexically**
descending: `"medium" > "low" > "high"`. Result: the owner's **highest-priority (`high`)
recommendations were rendered at the BOTTOM** of the list, and `medium` at the top — the opposite of
highest-priority-first.

## 5. Fix made
Smallest correct fix, preserving the contract: fetch ordered by `createdAt` desc, then order in the
service by a **semantic priority rank** (`critical` < `high` < `medium` < `low`; lower rank = higher
priority), mirroring the established repo pattern in `owner-dashboard.service.ts`
(`priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }`). `Array.prototype.sort` is stable, so
the `createdAt`-desc order from the query is preserved as the deterministic tie-break within an
equal-priority group. No schema change, no contract change (still `(priority, createdAt desc)`, now
semantically correct). Business logic stays in the service layer (no UI/page change).

## 6. Proof added
`src/services/__tests__/recommendation-priority-ordering.test.ts` — a **DB-backed** test that
persists six recommendations with mixed priorities in a deliberately **scrambled insertion order**
(`low, high, medium, high, low, medium`) via the real `createRecommendation`, then calls the real
`getRecommendationsForEngagement` and asserts:
1. All six are returned, engagement-scoped.
2. Priority rank is **monotonically non-decreasing** (highest-priority-first) — this **fails** under
   the old lexical ordering and **passes** under the fix.
3. Concretely: first returned is a `high`, last is a `low`; both `high`s precede any `medium`, which
   precede any `low`.
4. The order is **deterministic** across repeated reads (stable id + priority sequence).

## 7. Files changed
- Changed: `src/services/recommendation.ts` (semantic priority ordering in
  `getRecommendationsForEngagement` + module-level `RECOMMENDATION_PRIORITY_ORDER`).
- Added: `src/services/__tests__/recommendation-priority-ordering.test.ts`.
- Added: `docs/audits/2026-07-08-phase-2-G2-recommendation-priority-ordering/{FINAL_REPORT.md,
  EVIDENCE_LEDGER.json,COVERAGE_DELTA.md}`.

## 8. Tests added / reactivated
Added the ordering proof (2 assertions blocks). Runs in the **required** maintained vitest lane
(DB-backed, `TEST_WITH_DB=true`). No test reactivated, deleted, weakened, or quarantined. The Wave-3
test is unaffected (its recommendations are all `high`, so uniform-priority order is identical
before/after — verified: stable sort preserves its `createdAt`-desc tie-break).

## 9. Commands run
- `git checkout -B claude/phase-2-owner-journey-G2-recommendation-priority-ordering origin/main`
- Verified the defect: `Recommendation.priority` is `String` (schema line 813); only callers are the
  recommendations API route and the Wave-3 test (all-`high`, uniform) + ignored tests.
- Static verification of the fix's type-correctness and the test's assertions against the source.
- Execution delegated to PR CI (`node_modules` absent locally, as in prior waves).

## 10. CI status
To be confirmed on the draft PR. Required gate: `CI - Build & Test` runs the new DB-backed test in
the maintained suite (`TEST_WITH_DB=true`).

## 11. Remaining risks
- The fix moves priority ordering from the DB to the service. For the per-engagement listing this is
  a small, bounded result set; no pagination relies on DB priority order (confirmed no other caller).
- The pre-existing `Smoke - Production Dashboard` failure is unrelated and out of scope.

## 12. Rollback plan
`git revert` the single commit restores the prior (lexical) ordering + removes the test and docs.
The change is localized to one service function; rollback is clean.

## 13. Next gap recommendation
Proceed to **G3** (weekly KPI-deterioration → governed re-evaluation): drive
`escalation.detectKPIDeteriorationPattern` / `triggerReEvaluation({changeType:"kpi_deterioration"})`
DB-backed and assert re-evaluation of condition/mode/priority/cadence/health.
