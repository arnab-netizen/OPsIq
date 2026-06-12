# Module 2 — Slice 0 — Schema & Integration Decision Note

Status: **Slice 0 (audit/decision only).** No schema, code, API, UI, or migration is
created or changed here. Grounded in the **actual** Module 1 schema
(`prisma/schema.prisma` lines 1281–1467) and contracts, not assumptions.

---

## 1. Executive recommendation

Build Module 2 Financial Intelligence on **its own finance-specific persistence
tables** (`OwnerFinancialSnapshot`, `OwnerFinanceCycle`, `OwnerFinanceFinding`,
`OwnerFinanceAction`, `OwnerFinanceVerification`), **reusing the existing
`OwnerBusiness`** entity and **reusing pure Module 1 domain logic** (action status
machine, verification outcome function, `Severity`, finding/verification shapes) at
the TypeScript level via a shared **Owner Intelligence Spine** contract.

**Do NOT add a `domain` discriminator to the proven `recovery_*` tables, and do NOT
make any `recovery_*` column nullable, in Module 2.** Physical table generalization
("one shared owner action table") is explicitly **deferred** to a later, separately-
proven Spine module. "One execution loop" is achieved in v1 at the **contract/service
layer** (shared TS types + reused pure logic), not by mutating Module 1 storage.

This is the only path that simultaneously honors "plug into the proven action/
verification loop" and "do not weaken Module 1 / do not change runtime behavior."

## 2. Options considered

For each entity: (1) reuse the recovery table as-is; (2) extend the recovery table
with a `domain` discriminator (+ nullable FKs); (3) create a finance-specific table
conforming to a shared TS contract; (4) build a fully generic owner-intelligence
table now.

## 3. Selected path

- **Business:** **Reuse `OwnerBusiness`** (already domain-agnostic; owner_businesses).
  Module 2 reads/creates businesses through the existing model. Finance-only
  attributes (`businessModelType`, `industryTemplate`) live on
  `OwnerFinancialSnapshot`, **not** by altering `owner_businesses`.
- **Snapshot:** **New `OwnerFinancialSnapshot`** (own `@@unique([businessId,
  periodStart, periodEnd])`, own finance fields), FK → `OwnerBusiness`. Independent of
  `OwnerMetricSnapshot`.
- **Cycle:** **New `OwnerFinanceCycle`** (mirrors `RecoveryCycle` shape) FK →
  `OwnerBusiness` + `OwnerFinancialSnapshot`.
- **Finding / Action / Verification:** **New `OwnerFinanceFinding` /
  `OwnerFinanceAction` / `OwnerFinanceVerification`** (mirror the recovery shapes),
  **reusing the pure Module 1 logic** (`action-status.ts` state machine, verification
  outcome calc) — physically separate tables, identical state model.
- **Spine:** **Shared TypeScript contracts** (`src/domain/owner-spine/contracts.ts`)
  that both recovery and finance map to (`OwnerFinding`, `OwnerAction`,
  `OwnerVerification`, `DomainScore`, `BusinessConditionProfile`) — **types only in
  Slice 1, no DB**.

## 4. Rejected paths and why

- **Reuse `recovery_*` tables directly for finance** — REJECTED. `RecoveryFinding.
  cycleId`, `RecoveryAction.cycleId` are **NOT NULL** → would force finance through a
  `RecoveryCycle`, which itself requires `snapshotId` → `OwnerMetricSnapshot`. Couples
  finance to recovery semantics (`healthStatus`/`healthScore`) and the recovery
  period-uniqueness constraint.
- **Add `domain` column + nullable `cycleId` to `recovery_*`** — REJECTED for Module
  2. Mutating proven, deployed, runtime-proven tables risks the Module 1 staging
  proof; requires backfill + re-proof; violates "do not change runtime behavior / do
  not weaken Module 1." This generalization is a **future Spine module** with its own
  migration and runtime re-proof.
- **Reuse `OwnerMetricSnapshot` for finance** — REJECTED as the primary store. It
  lacks finance-critical fields (cashOnHand, payables, loanEmiDebtPayments,
  ownerWithdrawals, fixed/variable split, debt outstanding, overdue receivables/
  payables, inventoryStockCashLock, businessModelType, industryTemplate) and is
  bound to `RecoveryCycle` via its `cycles` relation and period-unique constraint.
  Adding ~12 nullable finance columns would overload a recovery table and entangle
  the two domains.
- **Fully generic owner-intelligence table now** — REJECTED for v1: largest blast
  radius, would require touching/abstracting Module 1 mid-build. Deferred.

## 5. Exact proposed persistence model direction (Slice 5 — NOT created now)

Additive-only new tables (all: `id @db.Uuid`, `workspaceId`, `businessId`,
`createdAt`, `updatedAt`, `status`/`version` where relevant, audit `createdBy`):
- `OwnerFinancialSnapshot(owner_financial_snapshots)` — period + currency +
  `businessModelType` + `industryTemplate` + the SPEC §3 finance inputs (all metric
  fields **optional/nullable** = "missing", never invented); `@@unique([businessId,
  periodStart, periodEnd])`; FK → `owner_businesses`.
- `OwnerFinanceCycle(owner_finance_cycles)` — FK → business + financial snapshot;
  `previousCycleId` self-relation; `financialHealthScore`, `status`.
- `OwnerFinanceFinding(owner_finance_findings)` — mirrors `recovery_findings`
  (code/title/sourceMetric/severity/evidence/confidence/impactEstimate/
  verificationMetric) + `findingType: "risk"|"opportunity"`.
- `OwnerFinanceAction(owner_finance_actions)` — mirrors `recovery_actions`
  (status default `proposed`, `version`, `metricToMove`, baseline/target, direction,
  completion evidence) + Spine prioritization fields (`impactScore`,
  `urgencyScore`, `effortScore`).
- `OwnerFinanceVerification(owner_finance_verifications)` — mirrors
  `recovery_verifications` (metric, baseline/target/after, direction, status).
- **Required vs optional:** structural keys (ids, workspaceId, businessId, period,
  currency) **required**; all financial metric values **optional/nullable**. Missing
  data = NULL + surfaced + lowers `dataConfidenceScore`; never defaulted to 0/invented.
- **Duplicate/stale snapshots:** duplicate period rejected by `@@unique`; stale
  (period end > N days) flagged as a non-blocking data-quality warning (mirrors
  Module 1's `isStaleSnapshot`).
- **No `recovery_*` table is altered.** No destructive change. No column drop/rename.

## 6. Exact proposed TypeScript contract direction (Slice 1 — types only)

`src/domain/owner-spine/contracts.ts`: `OwnerFinding` (extends Module 1 `Finding`
fields + `domain`, `findingType`); `OwnerAction` (recovery action fields + `domain`,
`impact/urgency/effort/confidence`); `OwnerVerification`; `DomainScore { domain,
riskScore, opportunityScore, healthScore, confidence, evidence }`;
`BusinessConditionProfile`; pure `priorityValue(action)` helper. Finance domain
(`src/domain/owner-finance/*`, Slices 2–4) emits these. **Reuse** `Severity` and
`action-status.ts` from `founder-recovery` (pure, no DB). No runtime wiring in Slice 1.

## 7. Exact proposed API route direction (Slice 6 — NOT created now)

`/api/owner/finance/{snapshot,metrics,risks,actions,dashboard}` via
`withCanonicalEnforcement` (`OWNER_VIEW` read / `OWNER_MANAGE` write,
`requireWorkspace: true`), canonical JSON, Zod validation, safe errors — identical
enforcement pattern to `/api/owner/recovery/*`. New routes only; recovery routes
untouched.

## 8. Exact proposed UI route direction (Slice 7 — NOT created now)

`/owner/finance` in the authenticated owner area; single-next-action-first; reads
API/services only (no business logic in UI). Recovery UI untouched.

## 9. Module 1 compatibility risks

- **Risk:** sharing/altering `recovery_*` would break Module 1 → **eliminated** by
  using separate finance tables.
- **Risk:** reusing `OwnerBusiness` writes could change business behavior → mitigated:
  Module 2 only reads/creates via existing service; no column changes to
  `owner_businesses`.
- **Risk:** reusing pure `action-status.ts`/verification logic could drift Module 1 →
  mitigated: reuse by import without modifying the file; if a change were ever needed
  it would require Module 1 re-proof (a stop condition).

## 10. Data migration risks

Additive-only (new tables) ⇒ low risk: no backfill, no destructive DDL, no change to
existing rows. The migration is **manual-only, fail-closed**; never auto-runs on push;
never run `migrate deploy` locally against a real DB. Risk if someone later chooses
the generalization path: that is out of Module 2 scope and gated separately.

## 11. Security / auth / workspace risks

Reuse the proven `withCanonicalEnforcement` + workspace scoping (all finance tables
carry `workspaceId`; all reads filter by `verifiedWorkspaceId`; writes require
`OWNER_MANAGE`). Cross-workspace and unauthenticated paths must be tested (Test
Matrix §8–9). No new auth surface invented.

## 12. Runtime proof implications

Module 2 needs its **own** deployed HTTP runtime proof (Slice 9), modelled on
`module-1-owner-recovery-runtime-proof`, additionally proving finance contributes a
`DomainScore` to the Business Condition Profile. Module 1's runtime proof remains
valid and unchanged (separate tables/routes).

## 13. Required tests before Slice 1

- Module 1 suite green baseline (`npx vitest run src/__tests__/founder-recovery/`).
- Full `npm test` green (regression guard).
- (Slice 1 itself adds: `priorityValue` determinism + type-conformance tests.)

## 14. Required tests before Slice 5 (persistence)

- Deterministic finance calc/risk/opportunity/recommendation/action unit tests
  (Slices 2–4) all green.
- `npx prisma validate` valid; `npx prisma migrate status` clean (no `deploy`).
- Module 1 suite still green (no recovery regression).
- Persistence tests (read-back, optimistic version, transactional finding+action).

## 15. Stop conditions

STOP and request authorization if any of: a change would alter/rename/drop a
`recovery_*` column or make one nullable; finance would require mutating
`OwnerBusiness` columns; the generic shared-action-table generalization becomes
necessary; a migration would touch existing rows; Module 1 suite or runtime proof
would regress; a real DB URL/secret would be needed locally.

## 16. Final Slice 0 decision

**PROCEED.** Decision recorded: finance-specific tables + reused `OwnerBusiness` +
shared TypeScript Spine contract + reused pure Module 1 logic; no `recovery_*`
mutation; generalization deferred. Slice 1 (TypeScript-only Spine contracts) may
begin under explicit authorization. Module 2 remains **not implemented**;
public/SaaS remains **frozen**.
