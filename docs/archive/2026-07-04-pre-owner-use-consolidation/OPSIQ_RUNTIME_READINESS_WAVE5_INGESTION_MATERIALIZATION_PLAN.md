# OpsIQ Wave 5 — Non-Finance Ingestion Materialization Plan

> Branch: `claude/runtime-readiness-wave5-ingestion-materialization` (from `main @ ce9a43b6`). Plan-first,
> committed before code. Audit tier: **Tier 2** (ingestion/materialization change). Migration-free. No invented
> fields. No dead-table writes. No CI triggered by this work.

## Objective
A real owner/staff user uploads non-finance business data via CSV intake, confirms it, and it **materializes into
the actual read models an owner-visible surface consumes** — not merely `ownerConfirmed=true`.

## Recon findings (four read-only agents + direct grep)
- **Materializer** (`src/services/owner-intake/materialize.ts`): `materializeIntake` dispatches only
  `finance → createFinancialSnapshot → OwnerFinancialSnapshot`; `sales`/`operations`/`sop`/`marketing` fall through
  to an honest `materialized: 0`.
- **The non-finance CSV snapshot services already exist and are owner-wired.** `createSalesSnapshot`,
  `createOperationsSnapshot`, `createSopSnapshot`, `createMarketingSnapshot` (each `(businessId, input, actorId,
  workspaceId)`, `getBusiness` ownership guard, period-uniqueness `ConflictError`, `id: randomUUID()`) write
  `OwnerSalesSnapshot`/`OwnerOperationsSnapshot`/`OwnerSopSnapshot`/`OwnerMarketingSnapshot`. Those tables are read
  by **owner-visible per-domain dashboards**: `GET /api/owner/{sales,operations,marketing,sop}/dashboard` →
  `get{Domain}Dashboard` → `db.owner{Domain}Snapshot.findFirst`, rendered by `owner/{sales,operations,marketing}/page.tsx`.
  **So these are NOT dead tables.**
- **Designed 1:1 mapping.** The CSV `field-specs.ts` field names for each domain are exactly the
  `{Domain}SnapshotCreateInput` field names (verified field-by-field). The engine already normalizes CSV rows to
  those keys (dates→ISO, non-negativity enforced). So the materializer builds a valid create-input with **no
  invented fields** — periodStart/periodEnd/currency required (mirroring finance), every other numeric key passed
  through.
- **Honest boundary (no overclaim).** These per-domain snapshots feed the **per-domain dashboards + clear the
  intake priority-guidance**, but the **whole-business-plan critical domains** (`prefetchOwnerDomainRows`) read a
  *different* set (`OwnerCapacitySnapshot`, `OwnerFinancialSnapshot`, `OwnerWorkingCapitalItem`,
  `OwnerComplianceItem`, `OwnerWorkloadSnapshot`, …). So confirming an `operations` CSV will populate the
  operations dashboard but will NOT by itself flip the command-center `equipment_capacity` `need_more_data` — that
  needs an operations→capacity mapping, which is a **product decision** (documented, not guessed).
- **Manual entry** (`submitManualEntry`) writes `OwnerDataIntake` with `targetDomain = owner category` and never
  materializes; it reaches confidence only via the supplied-category count. Materializing manual entries into typed
  snapshots needs a per-category field map + period handling (freeform fields, no period) → **product decision**.

## Category classification (20 manual categories + 5 CSV domains)
### CSV intake domains
| Domain | Target read model | Owner surface | Class |
|---|---|---|---|
| finance | OwnerFinancialSnapshot | whole-business plan (finance_cash/margin_pricing) | **MATERIALIZED_ALREADY** |
| sales | OwnerSalesSnapshot | owner-sales dashboard | **MATERIALIZED_THIS_WAVE** |
| operations | OwnerOperationsSnapshot | owner-operations dashboard | **MATERIALIZED_THIS_WAVE** |
| sop | OwnerSopSnapshot | owner-sop dashboard | **MATERIALIZED_THIS_WAVE** |
| marketing | OwnerMarketingSnapshot | owner-marketing dashboard | **MATERIALIZED_THIS_WAVE** |

### Manual-entry categories (all 20)
All 20 already reach **onboarding confidence** via the supplied-category count (partial owner effect, unchanged).
Snapshot materialization for each needs a per-category field→snapshot map + period handling:
- finance-family (`revenue_sales`, `expenses`, `fixed_costs`, `payroll`, `cash_debt`) → finance/cashflow/WC models: **PRODUCT_MAPPING_DECISION_REQUIRED** (manual freeform fields, no period; which field is revenue/cost/etc.).
- operations/capacity-family (`staff_attendance`, `equipment_logs`, `staff_rota`, `delivery_records`, `inventory_stock`) → capacity/operations models: **PRODUCT_MAPPING_DECISION_REQUIRED**.
- customer-family (`complaints_reviews`, `customer_count`, `marketing`) → OwnerMetricSnapshot/marketing: **PRODUCT_MAPPING_DECISION_REQUIRED**.
- compliance/sop/staff (`sops_checklists`, `proof_completion`, `tax_compliance`, `staff_training`, `vendor_invoices`) → compliance/SOP/training/vendor models: **PRODUCT_MAPPING_DECISION_REQUIRED**.
- context-only (`b2b_contracts` → request context, `branch_records` → OwnerBusiness/location_stage): **DEFERRED_NOT_CRITICAL** (not snapshot-shaped; arrive as context/onboarding).

Full rationale + options in `OPSIQ_RUNTIME_READINESS_WAVE5_INGESTION_DEFERRED_DECISIONS.md`.

## Implementation (minimum code, migration-free)
1. **`src/services/owner-intake/materialize.ts`** — extend the dispatch: route `sales`/`operations`/`sop`/`marketing`
   through a single generic `materializeViaSnapshot(domain, creator, businessId, workspaceId, actorId, records)`
   helper (mirrors `materializeFinance`): per record require `periodStart`/`periodEnd`/`currency` via `str()`; build
   the create-input by passing through every other key whose value is a finite number via `num()` (keys ARE the
   schema field names — no enumeration, no invented mapping); call `create{Domain}Snapshot`; `ConflictError` →
   idempotent skip; anything else re-throws. No route/schema change — rides the existing confirm route.
2. No change to `confirmDataIntake` (already calls `materializeIntake` and returns `{ materialization }`).

## Required tests (DB, local Postgres; `describe.skipIf(!SHOULD_RUN_DB_TESTS)`) — Step-C mapping
New `src/__tests__/api/owner/intake/non-finance-materialization.db.test.ts` (mirrors the finance template):
1. valid `sales` intake confirm → `materialization.materialized === 1`, one `OwnerSalesSnapshot`, and
   `getSalesDashboard(ws, biz)` reflects it (materialized data reaches the owner-visible per-domain dashboard).
2. same for `operations`/`sop`/`marketing` (at least one full end-to-end each; assert the snapshot row + dashboard).
3. confirm-flag alone does not materialize — a record missing period/currency → `materialized 0 / skipped n`, no
   snapshot, dashboard stays empty (cannot fake readiness).
4. invalid/partial mapping does not fabricate a snapshot (skipped, honest).
5. duplicate periods within one intake → idempotent (`materialized 1 / skipped 1`).
6. workspace isolation — cross-workspace confirm rejected; foreign workspace cannot read the snapshot.
7. business isolation — snapshot scoped to its business; another business in the same workspace does not see it.
8. no seed-only proof — the test drives the real `confirmDataIntake → materializeIntake → create*Snapshot` path.
9. (honesty) confirming `operations` does NOT flip the whole-business-plan `equipment_capacity` (documents the
   boundary — that remains a product decision).
Plus browser proof is **not required** for Wave 5 core: no owner-visible UI markup changes (the per-domain
dashboards + intake pages already render; materialization just fills them). If a dashboard test gap exists it is
noted, not faked.

## No-regression checks
`tsc`, `lint:ratchet` (0 changed-file errors), `governance:scan:strict` (0 new), `auth:scan`, and the existing
intake + owner-{sales,operations,marketing,sop} suites.

## Classification target
`NON_FINANCE_MATERIALIZATION_DB_PROVEN` — the 4 non-finance CSV domains materialize into their real, owner-wired
read models with DB proof; manual-entry materialization + whole-business-plan critical-domain flips are honestly
classified as product-mapping decisions (memo), not guessed. NOT `NON_FINANCE_INGESTION_RUNTIME_READY` (manual
categories + the command-center critical-domain flip remain open, by decision).
