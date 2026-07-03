# OpsIQ Wave 1 — RUNTIME_SCHEMA_QUERY_SWEEP Report

> Branch: `claude/runtime-schema-query-sweep`. Classification: **RUNTIME_SCHEMA_QUERY_SWEEP_READY**.
> Fixes schema-invalid Prisma queries that broke runtime paths where the clean, migration-free
> relation-scoped fix was obvious; audits + documents everything requiring a schema/domain decision.

## What was fixed (all migration-free)

### Core: `Action`/`KPI`/`Finding` workspace scoping (flat `workspaceId` → `engagement: { workspaceId }`)
`Action`, `KPI`, `Finding` have no `workspaceId` column; they are workspace-scoped via `engagement.workspaceId`.
Rescoped **32 query sites** across services + routes:
- **findMany/findFirst/count**: engagement-health, review-cycle (×6), escalation (KPI detector), recommendation
  (finding+action), kpi (`getKPIsForEngagement`), action-lifecycle (`count`), report-generator (finding+KPI),
  and routes `business-impact/detail`, `execution-certainty`.
- **updateMany** (relation filter is valid on updateMany): `updateAction`, `updateKPIValue` (both branches),
  and routes `actions/[actionId]/start`, `.../complete`.
- **findUnique → findFirst + relation** (findUnique can't take a relation filter; `id` still selects one row):
  `action.ts` re-read, `kpi.ts` read/re-read, the 6 recommendation-safety guards (owner-mode ×3, owner-finance
  ×2, decision-confidence ×1) incl. their injected-`deps` interface types, `impact-delta.service`, and routes
  `engagements/[engagementId]/actions/[actionId]`, `actions/[actionId]/impact-delta`.
- **Isolation fix**: `getActionById` previously did `findUnique({ where: { id } })` — it **ignored** the
  `workspaceId` argument entirely (cross-workspace read leak). Now `findFirst` scoped via the engagement
  relation → a foreign workspace gets `NotFound`.

### Incidental schema-invalid defects unmasked on the same code paths (fixed here)
Fixing the `workspaceId` error surfaced further errors on the **same lines** (previously the `workspaceId`
error fired first). Fixed as part of making those paths valid:
- **`kpi.ts` / `escalation.ts`**: KPI→snapshot relation is `kpiSnapshots`, not `snapshots` (include + property
  access).
- **`kpi.ts`**: `KPISnapshot.create`/`KPI.create` wrote a non-existent `workspaceId` column → removed
  (scoped via `kpi → engagement`).
- **`kpi.ts`**: `KPISnapshot.id` and `KPI.id` have **no DB default** (confirmed in the committed migrations) —
  `create` omitted the required `id` and threw `Argument id is missing`. Now supply `id: randomUUID()`.

### Tests updated (not deleted) to match the corrected service contract
The 6 recommendation-safety services are DI-based; their injected-`deps` interface previously hard-coded
`finding.findUnique({ where: { id, workspaceId } })`. Interface + call now use `findFirst` +
`engagement: { workspaceId }`. The **active** unit tests that mock these deps were updated
`finding: { findUnique }` → `finding: { findFirst }` (8 test files). No test deleted; no assertion weakened.

## Deferred (documented, no code change) — see OPSIQ_SCHEMA_QUERY_MISMATCH_DEFERRED_DECISIONS.md
- **DOMAIN_DECISION_REQUIRED** — `Action` has no `priority`/`dueDate`: `escalation.ts:detectHighPriorityOverdueActions`,
  `report-generator.ts` action ordering, `action.ts` reprioritization write. (`escalation.ts`'s KPI detector
  WAS fixed; its sibling action detector remains blocked by the missing `priority`/`dueDate`.)
- **SCHEMA_DECISION_REQUIRED** — `User`/`LeadRecord`/`ClientAccount` have no `workspaceId` (BROKEN-SVC-1/2/3).
- **Follow-up noted**: a `missing-id-on-create` pattern likely exists on other id-columns-without-defaults
  (Action/Finding creates elsewhere). Wave 1 fixed only the KPI-path creates it touched; a targeted create-id
  audit is recommended (Wave 2 ingestion territory).

## Not masked
No empty-array fallbacks, no swallowed Prisma errors, no 500→200 conversions, no lowered thresholds, no schema
migration. Deferred items remain honestly broken until their decision is made.

## Proof (local, Postgres 16)
- `tsc --noEmit` ✓.
- **Governance scan**: 0 new. **Auth route scanner**: all routes comply. `lint:ratchet` **PASS**
  (2088 ≤ 2155 baseline; `changed_file_lint_errors: 0`).
- **New DB proof** (`schema-query-sweep.db.test.ts`, 6 tests, all green): findFirst returns correct-workspace
  action; **cross-workspace → NotFound** (isolation); findMany returns the engagement's KPIs; empty engagement
  → **empty array, not a 500**; `updateKPIValue` (updateMany + snapshot create + re-read) succeeds and
  persists; foreign workspace cannot update the KPI.
- **No-regression: 2412 passed / 7 skipped / 148 files**; the single failure
  (`diagnosis-legal-governance-textual.test.ts`) is **pre-existing and unrelated** (legal-text boundary; does
  not touch Action/KPI/Finding). Plus the 648-test DI-service suite green after the mock updates.

## Classification
**`RUNTIME_SCHEMA_QUERY_SWEEP_READY`** — all cleanly-fixable schema-invalid Action/KPI/Finding runtime queries
rescoped via the engagement relation and DB-proven (correct rows, isolation, empty-not-500, writes persist);
non-clean cases audited and documented for a schema/domain decision; no gate weakened, no test deleted.
