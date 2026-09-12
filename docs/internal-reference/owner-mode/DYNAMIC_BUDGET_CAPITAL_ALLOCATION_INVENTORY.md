# Dynamic Budget, Capital Allocation & Profit Governance — Repository Inventory

Status of this document: COMPLETE (inventory stage). Produced before any implementation,
per the module build rule "Do not implement until this inventory exists."

Branch: `claude/owner-mode-dynamic-budget` (from `main` @ `fab9ecff`).

Method: four parallel read-only architecture sweeps of `/home/user/OPsIq`
(finance/budget/forecast; decision/action/evidence/audit; auth/workspace/schema/tests;
ops/sales/inventory/employee/vendor/archetypes). All paths verified to exist.

---

## 1. What already exists (classification per capability)

| Capability | Status | Primary location | Reuse decision |
|---|---|---|---|
| Financial metrics (margin, break-even, runway, cash days) | COMPLETE | `src/domain/owner-finance/metrics.ts` | REUSE (no reimplement) |
| Unit economics (contribution, margin floor, discount safety, segment) | COMPLETE | `src/domain/owner-finance/unit-economics.ts` | REUSE |
| Profit-impact confidence (MEASURED/ESTIMATED/INSUFFICIENT) | COMPLETE | `src/domain/execution/profit-assessment.ts` | REUSE |
| Finance snapshot/diagnosis/cycle/findings/actions + DB | COMPLETE | `src/services/owner-finance/*`, models `OwnerFinancial*` | MIRROR pattern |
| Cashflow snapshot/cycle + DB | COMPLETE | `src/services/owner-cashflow/*`, `OwnerCashflow*` | REUSE as cash signal source |
| Cash-safety promotion gate | COMPLETE | `src/services/owner-finance/recommendation-cash-safety.service.ts` | REUSE |
| 24-domain collective decision engine (`runCollective`) | COMPLETE | `src/domain/collective-training/collective-engine.ts` | REUSE (budget→DomainSignalInput) |
| Action/task system + lifecycle FSM | COMPLETE | `src/services/action.ts`, `src/services/action-lifecycle.ts`, `src/domain/execution/action.ts` | REUSE for budget actions |
| Evidence + Proof systems (status/strength/FSM) | COMPLETE | `src/services/evidence.ts`, `src/domain/execution/proof.ts`, `src/domain/remote-operations/proof.ts` | REUSE for spend proof |
| Audit ledger (hash-chained) + canonical event store | COMPLETE | `src/infra/audit.ts` (`emitAuditEvent`), `src/services/event-emitter.ts` (`EventEmitterService.emit`) | REUSE for budget audit |
| Re-evaluation orchestrator (14 change types) | COMPLETE | `src/services/re-evaluation.ts` (`triggerReEvaluation`) | REUSE concept; budget reassessment is OwnerBusiness-scoped (see §4) |
| Shock detection | COMPLETE | `src/services/shock-detection.ts` | REUSE as EMERGENCY input |
| Owner guidance / now-view dashboard | COMPLETE | `src/services/owner-guidance/owner-now-view.service.ts` | REUSE as guidance surface |
| Owner constraints (budget caps, cash runway, stage, goal) | COMPLETE | `src/domain/business-facts/owner-constraints.ts` | REUSE as gates |
| Risk-based plan approval gates | PRESENT_BUT_NOT_WIRED | `src/domain/remote-operations/plan-approval.ts` | REUSE for spend friction tiers |
| Manager integrity signals (9 flags) | COMPLETE | `src/domain/remote-operations/manager-exception.ts` | REUSE for SOD/fraud |
| Reliability gating (incl. vendor_reliability) | COMPLETE | `src/domain/remote-operations/reliability.ts` | REUSE for vendor/employee governance |
| Vendor projection / forbidden-field scoping | COMPLETE | `src/domain/remote-operations/vendor-access.ts` | REUSE for vendor controls |
| Operations capacity/quality/rework signals | COMPLETE | `src/domain/owner-operations/*`, `OwnerOperations/CapacitySnapshot` | INTEGRATE (capacity gates) |
| Sales/Marketing CAC/ROI/leakage signals | COMPLETE | `src/domain/owner-sales/*`, `src/domain/owner-marketing/*` | INTEGRATE (growth gates) |
| Supplier/inventory snapshot | COMPLETE | `OwnerSupplierInventorySnapshot` | INTEGRATE (procurement) |
| Business archetypes (laundry, housekeeping, universal) | COMPLETE | `src/domain/domain-training/archetypes/archetype-models.ts` | REUSE archetype packs |
| Owner override record | PARTIAL | `src/domain/override/types.ts` | EXTEND for budget override |
| Confidence/evidence levels (`RecommendationConfidence`) | COMPLETE | `src/domain/domain-training/training-types.ts` | REUSE vocabulary |
| Learning/outcome eligibility gating | COMPLETE | `src/domain/collective-training/learning-admission.ts`, `src/domain/execution/learning-gate.ts` | REUSE for outcome closure |
| **Budget period / line / scenario models** | **MISSING** | — (only `CostCenterIntakeSchema` exists, not persisted) | NEW (minimal) |
| **Spend entry / approval / proof-link models** | **MISSING** | — | NEW (minimal) |
| **Budget reassessment / plan snapshot models** | **MISSING** | — | NEW (minimal) |
| **Budget mode classifier** | **MISSING** | — | NEW pure engine |
| **Capital allocation engine** | **MISSING** | — | NEW pure engine |
| **Spend governance engine (SOD/split/self-approval)** | **MISSING** (signals exist, no spend governance) | — | NEW pure engine (reuses signals) |
| **Dynamic updated owner plan composer** | **MISSING** | — | NEW pure engine |
| **Budget reassessment service (atomic/idempotent/versioned)** | **MISSING** | — | NEW service |
| Statutory reserve / due-date obligation / working-capital line items | PARTIAL (aggregates only in finance snapshot) | `OwnerFinancialSnapshot` fields | NEW minimal fields where required |

OUT_OF_SCOPE (per prompt): public SaaS onboarding/billing/launch UI, external production
integrations, marketing/Product-Hunt work.

DUPLICATE_RISK (must NOT rebuild): finance metrics, unit economics, action system, proof,
audit ledger, collective engine, re-evaluation, owner-now-view, archetype models.

---

## 2. Answers to the inventory's required questions

1. **What already exists?** A full owner-finance/cashflow analytic stack (margins, break-even,
   runway, unit economics), a 24-domain collective decision engine, action/evidence/proof
   systems, a hash-chained audit ledger + canonical event store, a re-evaluation orchestrator,
   owner constraints, and rich operational/sales/marketing/vendor/manager signals.
2. **What can be reused?** Everything in §1 marked REUSE/INTEGRATE/MIRROR — most of the
   financial math, the decision engine, and all cross-cutting infra (action/proof/audit/events).
3. **What must not be duplicated?** The DUPLICATE_RISK list in §1.
4. **What needs new schema?** A minimal budget core: `BudgetPeriod`, `BudgetLine`, `SpendEntry`,
   `BudgetReassessment`, `BudgetPlanSnapshot`. Nothing else unless a tested behaviour requires it.
5. **What can be implemented without new schema?** All pure decision logic (mode classifier,
   capital allocation, spend governance rules, confidence gate, updated-plan composer,
   reassessment-trigger classifier) — pure functions over typed inputs.
6. **What needs new service logic?** Budget CRUD + spend entry + proof-status update + the
   reassessment service (atomic, idempotent, snapshot-versioned) + owner override + guidance adapter.
7. **What can reuse existing service logic?** `getBusiness` ownership guard, `emitAuditEvent`,
   `EventEmitterService.emit`, action creation, proof linkage, owner-now-view exposure.
8. **What needs UI wiring?** A Budget & Profit Plan owner adapter/summary. Full UI is classified
   PARTIAL initially; the guidance adapter/service contract is the minimum.
9. **What can reuse existing UI/dashboard adapters?** `owner-now-view.service.ts` and the
   per-module dashboard.service pattern.
10. **What needs tests?** New pure engines (unit + hostile fixtures), the budget service
    (`[db]` workspace isolation + reassessment), the mandatory dynamic proof scenario.
11. **Which existing engines must consume budget signals?** The collective engine
    (`runCollective`) via mapped `DomainSignalInput`s; owner-now-view for guidance surfacing.
12. **Which evidence/action/forecast modules integrate?** Proof system (spend proof), action
    system (budget actions), owner-finance metrics (forecast inputs).
13. **What risks exist if built incorrectly?** Duplicate decision/forecast engines; unscoped
    budget records (cross-workspace leak); treating entered spend as verified; recommending
    growth/scale without cash/unit-economics/capacity gates; unlawful employee governance.
14. **Minimum-code path?** See `DYNAMIC_BUDGET_MINIMUM_CODE_JUSTIFICATION.md`.

---

## 3. Conventions this module MUST follow (verified)

- **Routes:** `withCanonicalEnforcement(handler, { requireWorkspace: true, requireCapabilities: [...] })`;
  workspace id is server-derived (`ctx.verifiedWorkspaceId`), never trusted from input.
- **Capabilities:** `CAPABILITIES.OWNER_VIEW` (`owner:view`) for reads,
  `CAPABILITIES.OWNER_MANAGE` (`owner:manage`) for writes.
- **Service scoping:** every function takes `workspaceId: string`; every query filters by it;
  ownership guarded via `getBusiness(businessId, workspaceId)`.
- **Prisma:** `id @db.Uuid`, `workspaceId @db.Uuid @map("workspace_id")`, camelCase + `@map`
  snake_case columns, `@@index([workspaceId])` (+ compound), `@@map` snake_case table,
  `createdAt`/`updatedAt`. Parent entity = **OwnerBusiness** (not Engagement) for owner-mode.
- **Pure engines:** `src/domain/owner-budget/` — deterministic, no DB/IO imports, barrel `index.ts`.
- **Audit:** `emitAuditEvent({ eventName, workspaceId, actorId, entityType, entityId, payload })`
  after each mutation; event names added to `src/domain/constants/audit-events.ts`.
- **Tests:** `[db]`-named tests run only under `TEST_WITH_DB=true`; seed random workspace UUIDs;
  assert workspace isolation; quarantine list at `.claude/test-quarantine.json`.

---

## 4. Key design decision: reassessment scope

`triggerReEvaluation` (re-evaluation.ts) is **Engagement / BusinessConditionProfile**-scoped
(consulting side). Owner-mode finance/budget is **OwnerBusiness**-scoped. To avoid a second
decision system and avoid cross-wiring two parents, **budget reassessment is implemented as a
budget-service operation** that (a) recomputes the plan from persisted budget + finance signals,
(b) snapshots the plan immutably, (c) emits budget signals + audit, and (d) is consumable by the
owner guidance adapter. It REUSES the financial math and collective engine but does not duplicate
the engagement re-evaluation engine. This is the minimum-code, non-duplicative path.

---

## 5. Reused exported surfaces (verified signatures)

```
// src/domain/owner-finance/metrics.ts  (FinancialSnapshotInput → number|null)
grossMarginPct, netMarginPct, contributionMarginPct, netProfit,
breakEvenRevenue, dailyBreakEvenRevenue, cashRunwayDays, cashDaysOfCosts

// src/domain/owner-finance/unit-economics.ts
contributionMargin, contributionMarginPct, isLossMaking,
minimumViablePrice, marginFloorPrice, assessDiscountSafety, compareSegmentProfitability

// src/domain/collective-training/collective-engine.ts
runCollective(input: CollectiveInput): CollectiveDecisionPacket
// DomainSignalInput { domain: DomainKey, status, severity, confidence, ... }

// src/infra/audit.ts
emitAuditEvent(input): Promise<string>

// src/services/founder-recovery/business.service.ts
getBusiness(businessId, workspaceId)  // ownership guard, throws on cross-workspace

// src/domain/domain-training/training-types.ts
RecommendationConfidence = "HIGH"|"MEDIUM"|"LOW"|"BLOCKED"|"ESCALATE"
```
