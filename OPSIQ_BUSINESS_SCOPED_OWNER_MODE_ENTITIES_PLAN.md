# OpsIQ — Business-Scoped Owner-Mode Entities Migration Plan

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `481bf58`
Goal: isolate business-specific owner-mode data by `businessId` inside one workspace so all 10 distinct
browser-representative flows can co-seed in ONE workspace without constraint collapse.

This plan is written BEFORE any code (per the prompt). No code lands until this file exists.

---

## 1. Exact models requiring `businessId`

Four owner-mode models are workspace-scoped only (no `business_id` column), which lets capacity/workload/
proof/standing state bleed across businesses inside one workspace:

| Model | Table | Current scope | Add |
|---|---|---|---|
| `OwnerCapacitySnapshot` | `owner_capacity_snapshots` | `workspace_id` only | nullable `business_id` |
| `OwnerWorkloadSnapshot` | `owner_workload_snapshots` | `workspace_id` only | nullable `business_id` |
| `Proof` | `proofs` | `workspace_id` only | nullable `business_id` |
| `OwnerStandingInstruction` | `owner_standing_instruction` | `workspace_id` only | nullable `business_id` |

Precedent in the same schema: `OwnerGuidanceSnapshot` and `OwnerSupplierInventorySnapshot` already use
`businessId String? @map("business_id") @db.Uuid` (nullable scalar, **no FK relation**). We follow that
exact convention — additive, nullable, no FK back-relation, no `onDelete` surface to reason about.

## 2. Current query paths using `workspaceId` only

Read path — `src/services/owner-mode/owner-db-providers.ts` → `prefetchOwnerDomainRows` (the 4 lines):

```ts
db.ownerCapacitySnapshot.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
db.proof.findMany({ where: { workspaceId } }),
db.ownerWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
db.ownerStandingInstruction.count({ where: { workspaceId, status: "active" } }),
```

(cashflow / finance / working-capital / compliance / business are ALREADY business-scoped;
`behavioralLearningArtifact` is intentionally workspace-private and stays workspace-scoped.)

Write paths (application code, non-generated, non-test):
- `src/services/owner-operations/capacity-snapshot.service.ts` → `saveCapacitySnapshot` (`.create`)
- `src/services/owner-operations/owner-workload-snapshot.service.ts` → `saveOwnerWorkloadSnapshot` (`.create`)
- `src/services/owner-mode/owner-load.service.ts` → `recordStandingInstruction` (`.create`)
- `Proof`: NO application create path exists (proofs are created by seeds/tests, then `updateMany`-ed by
  `proof.service.ts` / `proof-precheck.service.ts`). The update paths filter by `id + workspaceId` and do
  NOT touch `business_id`, so they preserve it. The proof create that matters for browser flows is the seed.

Standing-instruction read path — `evaluateRequestAgainstStandingInstructions` (workspace+scope). After
migration this becomes optionally business-scoped (back-compat: when no `businessId` is supplied it keeps
the workspace behaviour so existing callers/tests are unaffected).

## 3. Migration strategy (additive, staged)

Stage 1 (this slice): add **nullable** `business_id uuid` to the four tables + composite indexes. Nullable
because legacy rows have no business. No data is destroyed, no column is dropped, no NOT NULL is forced.

- Prisma: add `businessId String? @map("business_id") @db.Uuid` to each of the four models.
- Raw SQL migration `prisma/migrations/20260629020000_owner_entities_business_scope/migration.sql`:
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS business_id uuid;` (×4) + `CREATE INDEX IF NOT EXISTS ...`.
- `prisma validate` + `prisma migrate diff`/deploy must pass before commit. Regenerate the client.

Stage 2: writes always set `businessId` from validated business context (see §6 below).
Stage 3: reads prefer `businessId`-scoped rows (strict scope — see §6).
Stage 4: legacy rows (null `business_id`) are simply excluded from business-scoped reads — they are NOT
surfaced as a business's real data (this is the required safe fallback: legacy data never inflates a
business's readiness). They remain in the table, queryable workspace-wide for admin/migration backfill.
Stage 5: tests prove new rows are business-scoped and isolated (see §8).

## 4. Backfill strategy

- No blind backfill that could mis-attribute a workspace row to the wrong business (a workspace may hold
  many businesses; guessing is unsafe). Legacy rows keep `business_id = NULL`.
- Where a workspace provably has exactly ONE owner business, a follow-up backfill is safe but is NOT done
  here (out of slice; documented). The migration is additive and reversible.
- Seeds (the only mass writer for E2E) are updated to write `business_id` on every new row, so all NEW
  data is business-scoped from day one.
- Readiness rule: `criticalDomainsRealProviderBacked` is computed from business-scoped reads only, so a
  business backed solely by legacy null-business rows reports those domains as DATA_SOURCE_MISSING and does
  NOT claim REAL_DB — exactly the prompt requirement.

## 5. Index / unique constraint strategy

Add a composite index `@@index([workspaceId, businessId])` to each of the four models (the provider reads
filter on `workspace_id + business_id`). Keep all existing indexes. No new unique constraints (these are
append-only snapshots / multi-row proofs / multi-row standing instructions; a unique on
`(workspaceId, businessId)` would be wrong). `Proof` keeps `(workspaceId, status)` and `(workspaceId,
fileHash)` and gains `(workspaceId, businessId)`.

## 6. Provider query changes

`prefetchOwnerDomainRows` — scope the four reads by `workspaceId + businessId`:

```ts
db.ownerCapacitySnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } }),
db.proof.findMany({ where: { workspaceId, businessId } }),
db.ownerWorkloadSnapshot.findFirst({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" } }),
db.ownerStandingInstruction.count({ where: { workspaceId, businessId, status: "active" } }),
```

Strict scope: a `where: { businessId }` predicate matches neither another business's rows (different id)
nor legacy null-business rows. Result: no cross-business leakage, no cross-workspace leakage, and legacy
workspace-only rows never back a business's REAL_DB classification. Missing business-scoped data flows
through the existing provider `missing`/DATA_SOURCE_MISSING path which lowers confidence.

Write paths — add an optional `businessId` to each writer's input and a shared validator
`assertBusinessInWorkspace(db, workspaceId, businessId)` that throws `BusinessScopeError` if the business
does not belong to the workspace (rejects cross-workspace businessId; never trusts client input blindly).
Writers set `business_id` on the create when business context is supplied. Back-compat: when no businessId
is supplied the writer behaves as today (workspace-only), so existing non-business callers/tests stay green
— but the seed (and any business-aware caller) always supplies it, so business-specific data is never
silently written as workspace-only when business context exists.

## 7. Seed changes

`scripts/seed-owner-scenarios.ts`:
- Remove the "force NEUTRAL" block. Seed `OwnerCapacitySnapshot`, `OwnerWorkloadSnapshot`, `Proof`,
  `OwnerStandingInstruction` per-knob, each with `businessId = scenarioBusinessId(s.id)`.
- Capacity tuned by `bottleneckUtilization`/`growthSafe`; workload by `workloadOverloaded`; proof by
  `proofDuplicate`/`proofUnsubmitted`; standing instruction business-scoped.

`src/services/owner-mode/owner-scenario-profiles.ts`:
- Set `browserDistinguishable: true` for all 10 scenarios (capacity/workload/proof are now business-scoped).
- `BROWSER_SCENARIOS` becomes all 10; `MOBILE_SCENARIOS` = the `mobile: true` subset (≥3: cash_crisis,
  bad_contract, vendor_compliance — plus we add owner_overload + multi_location_remote as mobile to match
  the prompt's recommended mobile set, giving ≥3 mobile across distinct constraints).

## 8. Tests to add / update

- `owner-db-providers.isolation.db.test.ts` (NEW, `[db]`): two businesses in one workspace, distinct
  capacity/workload/proof/standing rows → each business reads only its own; a third workspace is invisible;
  a business with only legacy null-business rows is NOT provider-backed for those domains.
- `capacity-snapshot.db.test.ts` / `owner-workload-snapshot.db.test.ts` (UPDATE): add a businessId write +
  read-back-by-business case; add cross-workspace businessId rejection.
- `owner-load` standing-instruction write test: businessId stored + cross-workspace rejected.
- `owner-scenario-constraints.test.ts` (mock-DB) stays green (mocks ignore where) and continues to prove
  all 10 constraints at the service level.
- A scenario co-seed isolation test (mock or `[db]`) proving 10 businesses in one workspace yield ≥7
  distinct constraints with no contamination.

## 9. Browser flows to rerun

`tests/browser/14-owner-representative-flows.spec.ts`: iterate ALL 10 `SCENARIOS` on desktop + ≥3 mobile.
Each flow asserts: card loads, correct business selected, whole-business card visible, dominant constraint
== expected, top priority, do-not-do/stop, next action, owner-workload/offload, proof, reassessment,
growth/arbitration, provider/confidence, stored-learning provenance, no cross-business/cross-workspace
leakage (distinct constraint per business proves isolation), no critical console errors. One login per
describe (rate-limit safe).

## 10. Rollback / risk notes

- Additive nullable column + indexes → reversible (`DROP COLUMN business_id` restores prior shape); no data
  loss; existing rows untouched.
- Risk: a business-aware caller that forgets businessId would write workspace-only. Mitigated: seed always
  supplies it; writers validate when supplied; readiness never inflates from legacy rows.
- Risk: existing `[db]` capacity/workload tests call writers without businessId — kept green by making
  businessId optional.
- Risk: provider now returns missing for businesses lacking business-scoped rows — this is intended
  (honest "data missing"), not a regression.

## 11. Final classification gates

- `BUSINESS_SCOPE_MIGRATION_FAILED` — schema/migration/provider work cannot be made safe.
- `BUSINESS_SCOPE_PROVIDER_READY` — migration + writes + provider isolation proven (DB tests green) but
  browser flows not all passing.
- `BROWSER_REPRESENTATIVE_READY` — all 10 browser flows pass + ≥3 mobile + no leakage + card renders
  runtime output + provider/confidence + owner-workload/proof/reassessment + do-not-do + 0 critical console
  errors.
- `EXTENSIVE_REAL_WORLD_CASE_TRAINING_CORE_READY` — BROWSER_REPRESENTATIVE_READY AND all prior CORE gates
  (60/60 domains, all critical ≥90, no weak category/severity, collective ≥90, runtime ≥90, holdout ≥88,
  adversarial unsafe 0, regression 0, learning persistence + applied, source register valid, privacy pass).
- DB proof: if local postgres runs, run `[db]` + Playwright here; otherwise push and require CI postgres:16.
  Local postgres:16 IS available in this environment, so DB proof is run locally.
