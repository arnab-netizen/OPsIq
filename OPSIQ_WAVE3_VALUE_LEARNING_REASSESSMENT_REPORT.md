# OpsIQ Wave 3 — VALUE_LEARNING_REASSESSMENT_LOOP Report

## 1. Branch
`claude/wave3-value-learning-reassessment-loop`

## 2. Original stacked base
Stacked on the Wave 2 PR #98 head `dfdf49b6` while #98 finished CI.

## 3. Post-#98 rebase base
`20492a43` — `main` after #98 (Wave 2) squash-merged. The branch was rebased `--onto main dfdf49b6`
(only the two Wave 3 commits replayed; the already-squashed Wave 2 commits were not re-applied). Clean, no conflicts.

## 4. Final HEAD
`5f8e5e98` (before this report commit).

## 5. Working tree
Clean (all changes committed).

## 6. S1 — value / missing-input surfacing (implemented)
`deriveCalcs` already computes `CaseCalcs.missingForDecision` — the **specific** field-level inputs needed to
quantify a decision (e.g. "current cash balance", "fully-loaded cost/kg and quoted rate") — but it was dropped
before the owner-visible supervisor summary; the owner saw only generic domain names. Threaded it through the
existing `SupportingCalcInput → buildSupervisorSummary` seam as an owner-visible `missingForQuantification` list
(deduped/trimmed; empty renders nothing) and rendered a `supervisor-missing-to-quantify` block. No new math, no
fabricated values, no change to the `need_more_data` action-status ladder. The already-surfaced supporting
figures (runway, monthly net, receivables, capacity) are unchanged; break-even / margin-as-a-number /
expected-value stay **out of scope** (placeholder-contaminated inputs or not computed — would fabricate).

## 7. S2 — outcome / disposition / variance steering (implemented)
`composeUpdatedPlan` previously steered only on terminal `outcome === "FAILED"` (with a dead `"BLOCKED"`
branch), collapsing every steer to DEFER and dropping the already-persisted richer signal. It now consumes the
stored learning **disposition** (`repeat`/`modify`/`escalate`/`block`; derived from outcome + repeat-failure
count when absent) and the **expected-vs-actual variance**:
- PARTIAL / underperformance → **modify** (the unchanged action is not re-funded),
- first FAILED → **escalate**, repeat FAILED → **block**,
- SUCCESS → no steer.
The owner-visible steer reason/signal now carries the variance (`actual X vs expected Y ≈ Z% of target`).
`reassessBudget`'s outcome read was extended to select `expectedImpact`, `actualImpact` and the outcome `note`
(for disposition) and map them onto `PriorInitiativeOutcome`. **No schema change — every column already exists.**
Honesty preserved: unverified / missing-actual outcomes never steer and never read as success; no profit is claimed.

## 8. S3 — alternatives learning (implemented)
`generateMultipleRecommendations` built its actionable **alternatives** without the prior-failure learning the
primary `generateRecommendation` applies, so the owner could see an alternative with un-penalized confidence for a
problem type that had already failed. Each actionable alternative is now wrapped with the existing
`applyPriorFailureLearning` (workspace-scoped read-back; no-op for a clean history; no new store, no schema).
Confidence + disclosure are now consistent across primary and alternatives. B6/M7 were already closed by prior
PRs (#84/#85); this is the remaining consistency edge.

## 9. Scheduled reassessment status — INFRASTRUCTURE DECISION REQUIRED (not wired; honestly labelled)
`scanDueReassessments` + the token-gated `/api/internal/reassessment-scan` route are correct and DB-backed, but
**no durable scheduler invokes them**: `src/scheduler.ts` is 0 bytes; `infra/scheduler.ts`'s `processDue` has
zero callers; the default `SCHEDULER_PROVIDER=in-memory` is serverless-ephemeral; there is no `vercel.json` /
CI cron hitting the route. Time-based reassessment therefore fires only on manual/external invocation. Per the
rules, **no fake scheduler was created** (no in-memory serverless state pretending to be a cron). **Event-triggered
reassessment remains fully wired** (budget-line/spend/proof/reconciliation/governance mutations → `reassessBudget`),
and the owner-visible wording is truthful (reassessment is framed as event/proof-triggered — "Stop and reassess
if cash, margin, or capacity moves the wrong way", "After the action's proof is accepted" — never as an automatic
scheduled job). Wiring a real periodic invocation is an out-of-app decision (external cron / hosted scheduler /
durable queue), documented for the owner.

## 10. Files changed (12; +500 / −40)
`src/domain/owner-mode/supervisor-summary.ts`, `src/services/owner-mode/owner-whole-business-plan.service.ts`,
`src/components/owner/SupervisorSummary.tsx` (S1); `src/domain/owner-budget/updated-plan.ts`,
`src/services/owner-budget/budget.service.ts` (S2); `src/services/intelligence/recommendation.ts` (S3); plus
tests: `supporting-figures.test.ts`, `owner-supervisor-summary.test.tsx`, `prior-outcome-steering.test.ts`,
`prior-outcome-steering.db.test.ts`, `recommendation-learning.test.ts`; and the plan doc.

## 11. DB proof (local, Postgres 16)
- **S2** `prior-outcome-steering.db.test.ts` (5): a persisted FAILED outcome steers the next `reassessBudget`
  plan with the expected-vs-actual variance surfaced; a missing actual stays UNVERIFIED (no success, no steer);
  SUCCESS does not steer; steering is workspace-scoped and business-scoped (no cross-tenant leak).
- **Wave 2 regression** (still green on this branch): `standing-instruction-write.db.test.ts` (4),
  `proof-intake.service.db.test.ts` (6).
- Supporting DB suites green: `outcome-learning.service.db.test.ts`, `budget.service.db.test.ts`,
  `owner-business-isolation.db.test.ts`, `owner-whole-business-plan.db.test.ts`.

## 12. Browser / mobile proof
S1 changes owner-visible output. It is proven at the **component level** (`owner-supervisor-summary.test.tsx` —
the `supervisor-missing-to-quantify` block renders its testids when present, omitted when empty) and at the
domain + live-runtime level (`supporting-figures.test.ts` drives real `runOwnerAdvice`). The existing owner
browser lanes (`13-owner-whole-business-plan.spec.ts`, `18-owner-supervisor-summary.spec.ts`) render the
supervisor summary end-to-end and exercise the additive block; they run at the CI PR gate. No brittle
data-dependent browser assertion was added locally.

## 13. No-regression proof
`prisma validate` ✓; `tsc --noEmit` ✓; `lint:ratchet` **PASS** (2088 ≤ 2155; changed_files 10;
`changed_file_lint_errors: 0`); governance strict **0 new** (32 matched); auth route scanner comply. Targeted
suites: **445 tests green** across supporting-figures, ai-supervisor, action-status-policy, prior-outcome-steering
(pure + DB), outcome-learning (pure + DB), intelligence (incl. S3), source-classification, reassessment,
whole-business-plan (unit + DB), supervisor/budget components, pilot-readiness, business-scope + owner-business
isolation, and the Wave 2 DB suites.

## 14. Live-profit claim count
**0.** No code asserts realized profit/success. SUCCESS still requires a verified actual meeting expectation;
unverified/missing-actual never becomes success; steer messages carry a corrective instruction + variance, never
a profit claim (asserted in a test).

## 15. Hardcoded-placeholder value count (reaching the owner)
**0.** S1 surfaces field-name strings (a request), not values; S2 surfaces the real persisted variance. The
`0.18` / `* 0.95` / `?? 100` placeholders in `business-math.ts` remain in code but are **not** surfaced to the
owner (contract-margin / net-ROAS stay excluded from `SupportingCalcInput`) — genuinely removing them (to enable
a margin figure) is deferred.

## 16. Cross-workspace leakage count
**0.** S2's DB tests prove outcome steering is workspace- and business-scoped; B6/S3 read-back is workspace-scoped;
existing isolation suites remain green.

## 17. Final classification
**`OUTCOME_STEERING_READY`.** All three sub-slices landed with DB/pure proof and value-output surfacing (S1),
learning-readback consistency (S3), and reassessment-honesty (§9) are also delivered. The classification is held
at the honest floor (not `VALUE_LEARNING_REASSESSMENT_LOOP_READY`) because the new S1 owner-visible block's full
browser E2E with live seeded data is validated at the CI browser lanes rather than executed locally; every other
condition for the full label is met (value math reaches the owner where data exists; specific missing-input
requests; outcome history changes future recommendations; failed/blocked not repeated unchanged; missing actual
blocks success claims; workspace/business-scoped learning; reassessment honestly labelled; no-regression green;
no live-profit overclaim; no fabricated values; no cross-tenant leakage).

## 18. Limitations
- Scheduled (time-based) reassessment is not wired — infrastructure decision (§9); event-triggered works.
- Break-even / margin-as-a-number / expected-value owner figures deferred until the `business-math.ts` placeholder
  constants are genuinely removed or an EV calc is defined (would otherwise fabricate).
- `OperatorItem` has no `businessId`, so B6/S3 learning is workspace- but not business-scoped — a domain decision,
  not a defect.
- The new S1 block's browser E2E is exercised by the CI owner lanes, not run locally.

## 19. PR readiness
Ready to open once pushed: #98 merged ✓, Wave 3 rebased on updated `main` ✓, Wave 3 tests green ✓, this report
exists ✓, classification `OUTCOME_STEERING_READY` (≥ the required floor) ✓.
