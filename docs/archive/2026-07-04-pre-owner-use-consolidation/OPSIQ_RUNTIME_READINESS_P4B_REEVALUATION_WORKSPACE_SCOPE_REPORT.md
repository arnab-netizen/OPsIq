# OpsIQ Runtime-Readiness — P4-B Re-evaluation Workspace-Scope Fix Report

> Fixes **BROKEN-SVC-4**: the mandatory adaptive re-evaluation engine threw `PrismaClientValidationError`
> on every intervention transition because `evaluateInterventionPhaseImpact` filtered `finding`/`action`
> by a flat `workspaceId` column those models do not have. Scopes them via the `engagement` relation
> (matching the KPI query already in the same function's file). **DB-proven** with a real, un-mocked
> intervention transition. No schema change; no gate weakened; no test deleted.

## Why this matters (product truth)
CLAUDE.md makes governed re-evaluation of BusinessConditionProfile / InterventionMode / InterventionPhase /
priority / review cadence / health status **mandatory** on every significant change. That engine
(`triggerReEvaluation`) is invoked by ~15 services (action, evidence, stage, findings, kpi, engagement,
intervention-state, business-condition, review-cycle, role-assignment, shock-event, …). For any change
whose re-evaluation targets include `interventionPhase`, the engine reached `evaluateInterventionPhaseImpact`
and **threw** — so those adaptive re-evaluations were dead. It was shielded because every route test that
triggers re-evaluation mocks `@/services/re-evaluation`, and no test exercised the real path.

## Root cause
`Finding` and `Action` have `engagementId` + an `engagement` relation but **no `workspaceId` scalar**.
`evaluateInterventionPhaseImpact` queried:
```ts
db.finding.findMany({ where: { engagementId, workspaceId } })   // invalid: no such column
db.action.findMany({  where: { engagementId, workspaceId } })   // invalid: no such column
```
The `kPI` query immediately above already used the correct relation form
(`where: { engagementId, engagement: { workspaceId } }`) — the two later queries simply diverged from it.

## The fix (2 queries, relation-scoped)
```ts
db.finding.findMany({ where: { engagementId, engagement: { workspaceId } }, select: { id: true } })
db.action.findMany({  where: { engagementId, engagement: { workspaceId } }, select: { id: true, status: true } })
```
`engagementId` already pins a single engagement (and thus one workspace); the `engagement: { workspaceId }`
filter keeps the defense-in-depth workspace check while being a valid query. All three models
(`Finding`/`Action`/`KPI`) carry the `engagement` relation, verified. Every other query in
`re-evaluation.ts` targets a model that has `workspaceId` (`engagement`, `businessConditionProfile`,
`recommendation`) or already uses the relation (`kPI`) — so these two were the only broken queries; the
whole engine is now valid.

## Files changed
- CHANGED `src/services/re-evaluation.ts` (2 query where-clauses in `evaluateInterventionPhaseImpact`)
- NEW `src/__tests__/services/re-evaluation-workspace-scope.db.test.ts` (2 un-mocked DB proofs)
- NEW `OPSIQ_RUNTIME_READINESS_P4B_REEVALUATION_WORKSPACE_SCOPE_REPORT.md`

## DB / migration changes
**None.** **API:** none. **UI:** none. Pure query-shape correctness.

## Tests / checks run (local, Postgres 16)
- `tsc --noEmit` ✓.
- `lint:ratchet` **PASS** — errors unchanged at **2086**; `changed_file_lint_errors: 0` (my 2-line edit adds
  no lint errors; pre-existing `any` findings in the file are untouched and baseline-frozen).
- **Governance scan**: **32 matched, 0 new**. **Auth route scanner**: "All routes comply".
- **New DB proof (un-mocked re-evaluation, 2 tests):**
  1. a real `updateInterventionMode("recovery"→"growth")` now **completes** (before the fix it threw
     `PrismaClientValidationError` inside `evaluateInterventionPhaseImpact`) and the mode persists;
  2. engagement/workspace scoping — a second workspace's engagement + action do not leak into or perturb
     the re-evaluation of the first, and the foreign engagement is untouched.
- **No-regression: 323 passed** across the re-evaluation-mocking suites (`api/actions`, `api/decisions`,
  `api/experiments`) + `intervention-route.rbac` + the new DB proof.

## Blast-radius assessment (why this cannot regress a passing path)
Callers `await triggerReEvaluation(...)` without swallowing, so any code path that previously **passed** never
reached the broken `finding`/`action` query (or CI would already be red). The fix therefore only converts a
previously-throwing path into a working one; it changes no path that already succeeded. The full CI corpus
lanes (which exercise many re-evaluation triggers un-mocked) are the final confirmation.

## Honest scope
- Fixes the one re-evaluation defect (BROKEN-SVC-4). Does **not** touch the other discovered broken services
  (`client-contact`, `user`, `lead`), which lack `workspaceId` **columns** and need schema changes to
  workspace-scope — deferred pending that decision.
- Does not change re-evaluation's business logic, only the two invalid query shapes.

## Classification
**`P4_REEVALUATION_WORKSPACE_SCOPE_FIXED`** (tsc + governance + ratchet + 2 un-mocked DB proofs + 323
no-regression): the mandatory adaptive re-evaluation engine now runs end-to-end on intervention transitions
instead of throwing; behaviour otherwise preserved.

## Merge recommendation
Open PR; drive CI green (the corpus lanes confirm no behavioural regression across un-mocked triggers). This
unblocks honest end-to-end proof for the intervention route and any future consultant-side flow that relies on
adaptive re-evaluation. Public SaaS / billing / launch / integrations remain out of scope and blocked.
