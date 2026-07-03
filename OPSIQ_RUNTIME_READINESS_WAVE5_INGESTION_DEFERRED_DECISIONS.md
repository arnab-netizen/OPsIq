# OpsIQ Wave 5 — Ingestion Materialization: Deferred Product/Schema Decisions

> Items Wave 5 does NOT implement because they require a product-mapping or schema decision (not a clean,
> designed, migration-free materialization). Documented with options + recommendation + risk + tests, per the
> follow-up-wave rule "if a wave requires a schema/product decision, do not guess — create a decision memo."
> None is masked; each remains honestly not-materialized until decided.

## DECISION 1 — Manual-entry materialization into typed snapshots (PRODUCT_MAPPING_DECISION_REQUIRED)
**Issue.** `submitManualEntry` writes an `OwnerDataIntake` row (`targetDomain = owner category`, `records =
[normalizedFields]`) and never calls `materializeIntake`. It reaches the plan only via the **supplied-category
confidence** count (onboarding), not a numeric snapshot. Two blockers to clean materialization:
1. **Freeform fields.** `parseInputRecord` keeps whatever keys the owner supplies (generic `isAmountKey`
   normalization); there is no per-category field schema (`input-catalog.ts` stores meta, not fields). So a
   `revenue_sales` entry may be `{revenue: 120000}` or `{monthlySales: 120000}` — no guaranteed mapping to a
   snapshot column.
2. **No period.** Every snapshot create requires `periodStart/periodEnd/currency`; a single manual entry has none.
**Options.**
- (a) Add a per-category field-map + required period fields to the manual-entry form/schema, then route confirmed
  manual entries through `materializeIntake` with a category→CSV-domain map (`revenue_sales/expenses/fixed_costs →
  finance`, `staff_attendance/equipment_logs → operations`, `complaints_reviews/customer_count → sales`, …). Owner
  enters period + typed fields per category.
- (b) Keep manual entry as a confidence-only signal (today's behaviour) and steer owners to CSV upload for
  materialized numbers. (Lowest effort; manual stays non-materializing but honest.)
- (c) Add a lightweight per-category materializer that only fires when the entry already carries period + the
  domain's required fields (opportunistic; skips otherwise).
**Recommendation.** (c) for the finance/sales/operations/sop/marketing-shaped categories (reuses the Wave 5 CSV
materializers once period+fields are present), (b) for context-only categories. This needs the owner to confirm
the category→domain map + which manual categories must carry period fields.
**Risk if deferred.** Owners who use manual entry (not CSV) raise onboarding confidence but do not populate the
per-domain dashboards or command-center numeric domains.
**Tests required (when chosen).** manual confirm with period+fields materializes into the domain snapshot;
without period → skipped (no fabrication); category→domain map is correct; workspace/business isolation.

## DECISION 2 — Non-finance data flipping the WHOLE-BUSINESS-PLAN critical domains (PRODUCT_MAPPING_DECISION_REQUIRED)
**Issue.** The command-center whole-business plan (`prefetchOwnerDomainRows`) reads `OwnerCapacitySnapshot`
(equipment_capacity/operations), `OwnerWorkingCapitalItem` (working_capital), `OwnerComplianceItem`
(compliance_proof), `OwnerWorkloadSnapshot` (owner_workload_memory) — NOT the per-domain
`OwnerOperationsSnapshot`/`OwnerSalesSnapshot`. So Wave 5's `operations` CSV populates the operations dashboard but
does not flip the command-center `equipment_capacity` `need_more_data`. Bridging them requires mapping the
operations field-spec (`machineCapacityUnits`, `idleHours`, `staffHours`, …) into `OwnerCapacitySnapshot`'s shape
(`resources: Json`, `currentRevenue`, `safeUtilization`) — there is **no 1:1 mapping**; a resource/utilization
model must be defined.
**Options.**
- (a) Define a deterministic operations→capacity derivation (owner confirms the resource model + utilization
  formula), then materialize `operations` intake into `OwnerCapacitySnapshot` as well.
- (b) Add `OwnerOperationsSnapshot`/`OwnerSalesSnapshot` to `prefetchOwnerDomainRows` so the command-center reads
  the per-domain snapshots directly (changes what "operations"/"sales" mean in the critical-domain gate — a
  product decision about which snapshot is authoritative).
- (c) Keep the per-domain dashboards as the owner surface for these domains (Wave 5's scope) and leave the
  command-center capacity gate fed only by the dedicated capacity form/snapshot.
**Recommendation.** (c) short-term (Wave 5 already delivers the per-domain owner surface); (a) as a later wave if
the command-center must reflect operations data numerically. Needs the owner's resource/utilization model.
**Risk if deferred.** The command-center `equipment_capacity` stays `need_more_data` until a capacity snapshot is
entered via the operations page, even though operations CSV is materialized to the operations dashboard.
**Tests required (when chosen).** operations intake flips `criticalDomainsAllReal`/`realProviderDomains` in the
whole-business plan; incomplete data does not; isolation holds.

## Not masked
Wave 5 materializes exactly the 4 non-finance CSV domains that have a designed 1:1 mapping into an owner-wired
read model. Manual-entry materialization and the command-center critical-domain flip remain honestly
not-implemented pending the decisions above — no empty-array masking, no fabricated snapshot, no dead-table write.
