# OpsIQ Wave 5 — Non-Finance Ingestion Materialization Report + Tier-2 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (ingestion/materialization
> change). **CI was NOT triggered by this work.** Branch `claude/runtime-readiness-wave5-ingestion-materialization`;
> base `main @ ce9a43b6`; HEAD `5d6db1cc`; working tree clean. Migration-free; no invented fields; no dead-table write.

## 1. What changed (diff scope — §9)
| File | Class | Change |
|---|---|---|
| `src/services/owner-intake/materialize.ts` | production service | `materializeIntake` now dispatches `sales`/`operations`/`sop`/`marketing` to their existing `create{Domain}Snapshot` services via a generic `materializeViaSnapshot` helper |
| `src/__tests__/api/owner/intake/non-finance-materialization.db.test.ts` | test | 7 DB proofs |
| `*_PLAN.md`, `*_DEFERRED_DECISIONS.md`, this report | docs | plan-first + decision memos |
No route/schema/auth/UI/workflow file touched. No scope-creep into public SaaS / billing / launch / integrations.
No deletions, no assertion removals, no threshold/ratchet/scanner change (§9.3 clean).

## 2. Claim-to-proof matrix (§10)
| Claim | Required layer | Actual layer | Evidence | Verdict |
|---|---|---|---|---|
| Confirming a `sales`/`operations`/`sop`/`marketing` CSV intake materializes a real `Owner{Domain}Snapshot` | real Prisma DB (loop: intake→materialize→snapshot) | **DB** | `non-finance-materialization.db.test.ts` #1,#2 via real `confirmDataIntake→materializeIntake→create{Domain}Snapshot` | PASS |
| Materialized data reaches an owner-visible surface | owner-visible readback | **service→owner-wired dashboard** | test #1/#2 assert `get{Sales,Operations}Dashboard(ws,biz).latestSnapshot` reflects it; those services back `GET /api/owner/{domain}/dashboard` + `owner/{domain}/page.tsx` | PASS (per-domain dashboard) |
| Confirm-flag alone does NOT materialize (no faked readiness) | DB | **DB** | test #3 — missing period/currency → `materialized 0`, no snapshot | PASS |
| Invalid/partial data does not fabricate a snapshot | DB | **DB** | test #3 (null field skipped; only finite numbers passed through) | PASS |
| Duplicate periods idempotent | DB | **DB** | test #4 — `materialized 1 / skipped 1` (ConflictError skip) | PASS |
| Workspace isolation | auth/DB | **DB** | test #5 — cross-workspace confirm rejected | PASS |
| Business isolation | DB | **DB** | test #6 — snapshot scoped to its business | PASS |
| Whole-business-plan critical domains flipped by non-finance intake | loop | **NOT CLAIMED** | test #7 asserts operations does NOT flip `equipment_capacity` — documented product decision | HONEST NON-CLAIM |

## 3. Route/UI/service reachability (§11)
| Feature | UI page | API route | Service | DB model | Readback consumer | Status |
|---|---|---|---|---|---|---|
| sales intake→snapshot | owner/intake + owner/sales | POST intake confirm; GET /api/owner/sales/dashboard | confirmDataIntake→createSalesSnapshot; getSalesDashboard | OwnerSalesSnapshot | owner-sales dashboard | REACHABLE |
| operations | owner/intake + owner/operations | …; GET /api/owner/operations/dashboard | createOperationsSnapshot; getOperationsDashboard | OwnerOperationsSnapshot | owner-operations dashboard | REACHABLE |
| sop | owner/intake | …; GET /api/owner/sop/dashboard | createSopSnapshot; getSopDashboard | OwnerSopSnapshot | owner-sop dashboard | REACHABLE |
| marketing | owner/intake + owner/marketing | …; GET /api/owner/marketing/dashboard | createMarketingSnapshot; getMarketingDashboard | OwnerMarketingSnapshot | owner-marketing dashboard | REACHABLE |
No write-only/dead-table target (each snapshot is read by a wired owner dashboard — verified by grep).

## 4. Data lineage (§12)
`CSV upload → createDataIntake (OwnerDataIntake, unconfirmed) → confirmDataIntake → materializeIntake →
materializeViaSnapshot → create{Domain}Snapshot → Owner{Domain}Snapshot → get{Domain}Dashboard.latestSnapshot →
owner/{domain}/page.tsx`. Lineage reaches an owner-visible field (the per-domain dashboard's `latestSnapshot`).
It does NOT reach the command-center critical-domain gate (documented boundary, §Decision-2 memo).

## 5. Ingestion audit (§14) + per-category classification
- CSV `finance` → **MATERIALIZED_ALREADY**; `sales`/`operations`/`sop`/`marketing` → **MATERIALIZED_THIS_WAVE**.
- 20 manual-entry categories → reach onboarding confidence via supplied-category count (unchanged);
  snapshot materialization for each → **PRODUCT_MAPPING_DECISION_REQUIRED** (finance/ops/customer/compliance/sop
  families) or **DEFERRED_NOT_CRITICAL** (`b2b_contracts`, `branch_records` — context-shaped). See the memo.
- **Not claimed**: "all ingestion fixed." Only the 4 non-finance CSV domains are materialized this wave.

## 6. HTTP semantics / honesty (§20, §22) — no route touched
`materializeIntake` returns honest counts; incomplete records → `skipped` (not a fabricated snapshot, not a 200
masking failure). No alert/notification claims. No scheduler. No `any`/fallback/placeholder/stub added.

## 7. Prisma/schema validity (§18)
No schema change. The four create services are pre-existing, schema-valid, workspace/business-scoped
(`getBusiness` guard). The generic materializer passes only finite-number keys (the field-spec↔create-input names
are 1:1) — no invalid field, no invented column.

## 8. Local proof (§4, no CI triggered)
- `tsc --noEmit` ✓; `lint:ratchet` **PASS** (2084 ≤ 2155, `changed_file_lint_errors: 0`); `governance:scan:strict`
  **0 new**; `auth-governance-scanner` comply.
- **DB (local Postgres 16)**: `non-finance-materialization.db.test.ts` **7/7 pass**.
- **No-regression**: intake + owner-{sales,operations,marketing,sop} suites **56 pass**.

## 9. Final hostile self-audit (§34) — key answers
Production or seeded? **Production** — the test drives real `confirmDataIntake→materializeIntake→create*Snapshot`
(no seed shortcut). Owner reach via UI/API? **Yes** — CSV upload + confirm route + per-domain dashboards.
Written data reaches an owner surface? **Yes** — per-domain dashboard `latestSnapshot`. Isolation proven? **Yes**
(workspace + business). Fabrication? **No** — incomplete records skipped, only real numbers passed. Write-only
loop? **No** — snapshot is read by a wired dashboard. Overclaim? **No** — the command-center critical-domain flip
+ manual materialization are explicitly NOT claimed and documented as decisions. Any gate weakened? **No**.

## 10. CI status (§1.1 / §35)
**CI was not triggered by this audit/work.** PR will be opened after this local proof; existing CI must be
evaluated after the PR opens naturally. Until then: `CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT`.

## 11. Classification
**`NON_FINANCE_MATERIALIZATION_DB_PROVEN`** — the 4 non-finance CSV domains materialize into their real,
owner-wired per-domain read models with DB proof and honest boundaries. This is intentionally **not**
`NON_FINANCE_INGESTION_RUNTIME_READY`: manual-entry materialization and the whole-business-plan critical-domain
flip remain open product decisions (memo), and CI has not yet run. After the PR opens and required CI is green,
the classification for merge is gated on that CI + a final hostile audit.

## 12. Next
Open PR; inspect CI after it opens; final hostile audit before merge; then sync main and proceed to Wave 6
(escalation/action schema decision) per the follow-up chain.
