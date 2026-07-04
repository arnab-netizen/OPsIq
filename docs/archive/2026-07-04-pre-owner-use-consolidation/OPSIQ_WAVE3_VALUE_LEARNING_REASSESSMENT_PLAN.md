# OpsIQ Wave 3 — VALUE_LEARNING_REASSESSMENT_LOOP Plan

> Branch: `claude/wave3-value-learning-reassessment-loop`, stacked on the Wave 2 PR #98 head (`dfdf49b6`).
> Plan-first: committed before any Wave 3 code. Migration-free. No new engine, no fake scheduler, no
> invented financial numbers, no live-profit claim, no gate weakened, no global learning from one outcome.
> **This plan does not open a PR and does not merge. Wave 3 coding starts only after #98 is merged and this
> branch is rebased onto the updated main.**

## Goal
OpsIQ must make already-recorded value math, learning, outcome, and reassessment **visible and actionable in
the running owner plan** — without fake autonomy or live-profit overclaim. Recon (four read-only agents across
the 15 inspection points) shows most of B3/B6/M7/M8/M9 was already delivered by prior PRs (#82/#84/#85/#86/#87,
all in main). Wave 3 closes the **remaining edges** with minimum code, reusing existing seams.

## Per-gap classification (required by Step A)

| Gap | Classification | Basis |
|-----|----------------|-------|
| **B3** quantified value/math does not reach owner | **clean_minimum_code_fix** | #82 surfaced 4 supporting figures. The **specific** missing-field list `CaseCalcs.missingForDecision` (e.g. "current cash balance", "fully-loaded cost/kg and quoted rate") is computed by `deriveCalcs` but **dropped** before the supervisor summary; owner sees only generic domain names. Plumbing it through the existing `SupportingCalcInput`→`buildSupervisorSummary` seam is migration-free and invents nothing. (Break-even: `breakEvenUnits` exists but is unwired and its inputs are placeholder-contaminated → out of scope. Margin-as-number / expected-value: contaminated by `0.18`/`*0.95`/`??100` defaults or not computed at all → out of scope, would fabricate.) |
| **B6** decision/operator learning write-only | **already_closed** | #84 wired `priorRealizedFailures`→`applyPriorFailureLearning`; live, workspace-scoped, owner-visible (`confidenceScore`/`learningApplied`/`priorFailureCount`/disclosure in the API body). Optional clean polish: `generateMultipleRecommendations` **alternatives** don't apply the same learning, so owner-visible alternatives show un-penalized confidence. |
| **M7** duplicate learning store | **already_closed** | #85 deleted `learning/store.ts`, `metrics/decision-metrics-service.ts`, and the swallowed writers (filesystem-confirmed). Single persistent store (`PrismaLearningStore`) + pure B6 read-path remain. Only residue: a stale `.claude/lint-baseline.json` entry for a deleted test (cosmetic). |
| **M8** scheduled reassessment dead | **needs_scheduler_infrastructure_decision** | #87's `scanDueReassessments` + token-gated `/api/internal/reassessment-scan` are correct and DB-backed, but **no durable scheduler invokes them**: `src/scheduler.ts` is 0 bytes; `infra/scheduler.ts` `processDue` has zero callers; default `SCHEDULER_PROVIDER=in-memory` is serverless-ephemeral; no `vercel.json`/CI cron hits the route. Making time-based reassessment real needs an out-of-app cron/queue — cannot be honestly satisfied in app code, and faking it with in-memory serverless state is explicitly forbidden. Event-triggered reassessment **is** wired end-to-end. Documented, not coded. |
| **M9** outcome loop doesn't steer | **already_closed** (core) + **clean_minimum_code_fix_remaining** | #86 makes a prior FAILED (safe-for-learning) initiative DEFER the matching candidate + add a guard signal + what-not-to-do, wired via `reassessBudget`, owner-visible. Remaining edge: steering keys only off the terminal `outcome === "FAILED"` string. The already-**persisted** richer signal — disposition (`modify`/`escalate`/`block`), `PARTIAL` outcomes, and expected-vs-actual **variance magnitude** (`expectedImpact`/`actualImpact` columns) — is dropped because `reassessBudget` selects only `{initiativeLabel, outcome, safeForLearning}` and `composeUpdatedPlan` ignores disposition. Extending it is migration-free (all columns exist). |

## Sub-slices (minimum code; each a commit with local targeted tests; all migration-free)

### S1 (B3) — surface the *specific* missing-financial-inputs request to the owner
- `deriveCalcs` already produces `CaseCalcs.missingForDecision: string[]` (the exact fields needed to quantify).
  Thread it: `runOwnerAdvice` result → `owner-whole-business-plan.service.ts` composition (~line 239) →
  a new `missingForQuantification: string[]` on the supervisor summary input → rendered as an owner-visible
  "to quantify, add:" list in `buildSupervisorSummary` / `SupervisorSummary.tsx`.
- **Reuses** the existing figure seam; **does not** alter the `need_more_data` action-status ladder (no gate
  change). Emits only real, already-computed field names (never fabricates). When the list is empty, nothing
  renders (no theatre).

### S2 (M9) — disposition- and variance-aware outcome steering
- Extend the `reassessBudget` outcome read (`budget.service.ts` ~line 598) to also select the persisted
  `expectedImpact`, `actualImpact`, and the `disposition` (from the outcome `note`), and carry them on
  `PriorInitiativeOutcome` (`updated-plan.ts`). **No schema change — these columns already exist.**
- In `composeUpdatedPlan` steering (`updated-plan.ts` ~145–176):
  - a **PARTIAL** outcome or a **negative expected-vs-actual variance** past a defined threshold now steers the
    matching candidate (require modification / more data), instead of being silently re-funded;
  - branch on the persisted **disposition** (`modify` → require modification + more evidence; `escalate` →
    escalate signal; `block` → block/keep-deferred) rather than collapsing everything to DEFER;
  - remove the dead `outcome === "BLOCKED"` branch (no such outcome value exists) and repoint it at the
    `block` disposition.
- Surface **expected-vs-actual variance** on the owner budget page (`owner/budget/page.tsx`) next to
  `outcomeClass`, so the *reason* (how far actual missed expected) is owner-visible — honestly labelled,
  never a profit claim.
- Honesty guard preserved: SUCCESS still requires a numeric actual meeting expectation; unverified never
  becomes success; no realized-profit assertion is added.

### S3 (B6 polish, optional — include only if S1+S2 stay auditably small)
- Apply the existing `applyPriorFailureLearning` to the `generateMultipleRecommendations` **alternatives** so
  owner-visible alternatives carry the same workspace-scoped prior-failure penalty + disclosure as the
  primary. Pure, no new store, no schema.

## Deferred / documented (not coded)
- **M8** scheduled invocation — infra decision (external cron/queue or pumped DB scheduler). Documented in
  `OPSIQ_WAVE3_VALUE_LEARNING_REASSESSMENT_REPORT.md`; the scan route stays a fail-closed manual/external seam.
- **Break-even / margin-as-number / expected-value** owner figures — need the `business-math.ts` placeholder
  constants genuinely removed (not bypassed) or a new EV calc; out of scope (would fabricate). Documented.
- **B6 business-scoping** (`OperatorItem` has no `businessId`) — domain decision, not a bug.
- **M7 cosmetic** stale `.claude/lint-baseline.json` entry — optional sweep, not part of the learning subsystem.

## Required Wave 3 tests (local, Postgres 16; `describe.skipIf(!SHOULD_RUN_DB_TESTS)`) — mapped to Step C
1. expected-vs-actual outcome is read by the owner plan — S2 (reassess select carries variance).
2. negative variance changes the next recommendation — S2 (PARTIAL/variance steer defers/modifies).
3. blocked prior initiative is not re-recommended unchanged — S2 (`block` disposition).
4. learning record influences owner plan only within the same workspace/business — reuse isolation template.
5. cross-workspace learning does not leak — reuse `owner-business-isolation.db.test.ts` template.
6. missing actual result prevents success/profit claim — S2 (unverified → no success; assert honest label).
7. business math reaches owner-visible output where data exists — S1 (+ existing `supporting-figures.test.ts`).
8. missing business math inputs produce specific missing-data requests — S1 (`missingForQuantification`).
9. event-triggered reassessment path works where already supported — reuse existing `budget.service.db.test.ts`.
10. scheduled reassessment remains honestly classified if not wired — assert the scan route is manual/external
    only (no cron) + documented; do not fake.
- Browser/mobile proof (`tests/browser/18-owner-supervisor-summary.spec.ts` / `13-owner-whole-business-plan.spec.ts`)
  extended with a `data-testid` for the new owner-visible figures (missing-to-quantify list; outcome variance).

## No-regression gates (Step C)
`prisma validate`, `tsc`, `lint:ratchet`, `governance:scan:strict` (0 new), `governance:scan:auth`, plus the
Wave 2 proof-submit + standing-instruction DB tests, owner-pilot, AI-supervisor, action-status-policy,
source/privacy, and business-scope isolation suites.

## Report classifications (Step E) — target
Prefer `VALUE_LEARNING_REASSESSMENT_LOOP_READY` only if all Step-E conditions hold; otherwise the most honest
of `VALUE_OUTPUT_SURFACED` / `OUTCOME_STEERS_RECOMMENDATION_READY` / `REASSESSMENT_LOOP_PARTIAL_READY`. M8's
scheduler stays honestly classified as an infra decision regardless.

## Adaptive note
S1 surfaces a specific missing-input request (an input to the plan, not a state transition). S2 makes recorded
outcome disposition/variance change the next recommendation — this strengthens the mandatory adaptive
re-evaluation (failed-implementation / KPI-deterioration inputs) without adding autonomy or a new engine. No
governed gate is weakened.
