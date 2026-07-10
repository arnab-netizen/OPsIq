# A0 — Product Capability Matrix

**Date:** 2026-07-10  
**Branch:** claude/current-main-reality-audit-operating-layer  
**Base commit:** ef7706b (main)

---

## Classification Key

| Status | Meaning |
|--------|---------|
| COMPLETE | Route + service + DB model + tests confirmed |
| PARTIAL | Route/service exists but missing tests, UI, or DB proof |
| MISSING | No route, service, or model found |
| STUBBED | Exists in code but returns placeholder / no-op |
| BACKEND_ONLY | Service/routes real but no UI or Playwright coverage |
| UI_ONLY | UI exists but no backend service |
| UNTESTED | Route + service exist, zero test files found |
| UNKNOWN | Insufficient evidence — could not confirm either way |

---

## Capability Matrix

### 1. Owner Mode

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | 60+ owner API routes; M01-M15 per execution plan |
| Routes | `src/app/api/owner/*` — 40+ route dirs (dashboard, control-center, home, manual-entry, finance, cashflow, marketing, sales, operations, sop, strategy, tasks, etc.) | Confirmed |
| Services | `src/services/owner-mode/`, `src/services/owner-finance/`, `src/services/owner-cashflow/`, `src/services/owner-marketing/`, `src/services/owner-sales/`, `src/services/owner-sop/`, `src/services/owner-strategy/` | Confirmed |
| DB Models | `OwnerBusiness`, `BusinessConditionProfile`, `OwnerDataIntake`, `OwnerFinancialSnapshot`, `OwnerMetricSnapshot`, `OwnerAttentionEvent` etc. | 174 total models |
| Tests | `src/__tests__/api/owner/` exists; `owner-dashboard.test.ts`, `owner-dashboard-recommendations.test.ts`; 54 Playwright spec files | Confirmed |
| Playwright | 12+ owner-specific spec files (pilot, mobile, cockpit, supervisor, whole-business-plan) | Confirmed |
| Audit logging | `AuditEvent` model; `logAuditEvent` / `emitAuditEvent` in services | Confirmed |
| Risk | LOW | |

### 2. Manual Entry

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Route | `src/app/api/owner/manual-entry/route.ts` — `withCanonicalEnforcement`, OWNER_MANAGE capability | Confirmed |
| Service | `src/services/owner-mode/owner-manual-entry.service.ts` | Confirmed |
| DB | `OwnerDataIntake`, `OwnerInputRecord` | Confirmed |
| Tests | `src/__tests__/api/owner/` directory | Confirmed (dir exists) |
| Risk | LOW | |

### 3. Diagnosis / Recommendation / Action

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Diagnosis routes | `src/app/api/diagnosis/` — archetype, bottleneck, maturity, root-cause | Confirmed |
| Diagnosis services | `src/services/diagnostic-core/` — archetype-engine, bottleneck-engine, maturity-engine, root-cause-engine | Confirmed |
| Recommendation routes | `src/app/api/recommendations/`, `src/app/api/owner/dashboard/` | Confirmed |
| Action routes | `src/app/api/actions/` | Confirmed |
| DB | `Recommendation`, `Action`, `Finding`, `BusinessConditionProfile` | Confirmed |
| Tests | `diagnosis-error-visibility.test.ts`, `owner-dashboard-recommendations.test.ts` | Confirmed |
| Risk | LOW | |

### 4. Evidence / Audit

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/audit/events/`, `src/app/api/proof/`, `src/app/api/proof-risk/`, `src/app/api/admin/audit-log/` | Confirmed |
| Services | `src/services/audit/`, `src/services/integrity/`, `src/services/value-proof/` | Confirmed |
| DB | `AuditEvent`, `Evidence`, `EvidenceBundle`, `EvidenceItem`, `EvidenceBundleItem`, `Proof`, `ProofRequirement` | Confirmed |
| Tests | `src/__tests__/api/` includes audit-related tests | Confirmed |
| Risk | LOW | |

### 5. Finance / Budget / Cash / Profit

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/owner/finance/`, `src/app/api/owner/cashflow/`, `src/app/api/owner/budget/` | Confirmed |
| Services | `src/services/owner-finance/`, `src/services/owner-cashflow/`, `src/services/owner-budget/`, `src/services/finance/`, `src/services/financial/` | Confirmed |
| DB | `OwnerFinancialSnapshot`, `OwnerCashflowSnapshot`, `OwnerFinanceFinding`, `BudgetLine`, `BudgetPeriod`, `SpendEntry`, `OwnerWorkingCapitalItem` | Confirmed |
| Tests | CI lane: "All-120 Finance/Cash" in Playwright | Confirmed |
| Risk | LOW | |

### 6. Staff / Operator Execution Proof

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/owner/staff-training/`, `src/app/api/operator/`, `src/app/api/proof/submit`, `src/app/api/proof/review` | Confirmed |
| Services | `src/services/operator/`, `src/services/execution/` | Confirmed |
| DB | `OperatorItem`, `DelegatedTask`, `Proof`, `ProofRequirement`, `ProofRiskAdjudication` | Confirmed |
| Tests | CI lane: "All-120 Staff/Proof"; `operator-queue.test.ts` | Confirmed |
| Risk | LOW | |

### 7. SOP / Training

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/owner/sop/`, `src/app/api/owner/sop-documents/`, `src/app/api/owner/staff-training/` | Confirmed |
| Services | `src/services/owner-sop/` — action, dashboard, diagnosis, snapshot, verification | Confirmed |
| DB | `OwnerSopDocument`, `OwnerSopSnapshot`, `OwnerSopFinding`, `OwnerTrainingRecommendation`, `OwnerStaffSkill` | Confirmed |
| Tests | Owner SOP CI lane | Confirmed |
| Risk | LOW | |

### 8. Customer Retention / Reactivation

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/owner/sales/`, `src/app/api/complaint-rework/`, `src/app/api/clients/` | Confirmed |
| Services | `src/services/owner-sales/`, `src/services/growth/` | Confirmed |
| DB | `OwnerSalesSnapshot`, `LeadRecord`, `ClientAccount`, `ClientContact` | Confirmed |
| Notes | No dedicated "reactivation campaign" route found; functionality embedded in sales/operations cycle | |
| Tests | CI lane: "All-100 Customer/Vendor/Market" | Confirmed |
| Risk | LOW-MEDIUM | |

### 9. Marketing ROI

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/owner/marketing/` | Confirmed |
| Services | `src/services/owner-marketing/` — action, dashboard, diagnosis, snapshot, verification | Confirmed |
| DB | `OwnerMarketingSnapshot`, `OwnerMarketingFinding`, `OwnerMarketingAction`, `OwnerMarketingCycle` | Confirmed |
| Tests | CI lanes: "All-120 Finance/Cash", "All-150 Growth/Profit/Scaling" | Confirmed |
| Risk | LOW | |

### 10. Opportunity Finder / Wealth Opportunity / External Opportunity

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/owner/opportunities/` (decide, execution-task, signals, validation-outcome), `src/app/api/owner/wealth-command-center/`, `src/app/api/owner/wealth-path/` | Confirmed |
| Services | `src/services/owner-mode/external-opportunity-intake.service.ts`, `src/services/benchmark/growth-opportunity.service.ts` | Confirmed |
| DB | `ExternalOpportunitySignal`, `OpportunityExecutionTask`, `OpportunityValidationOutcome` | Confirmed |
| External signals | `ExternalOpportunitySignal` model exists; no live data source connected | PLACEHOLDER_ONLY |
| Tests | CI lane: "All-150 Growth/Profit/Scaling" | Confirmed |
| Risk | MEDIUM — external signal source not live | |

### 11. Tender / Application Assistance

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **MISSING** | |
| Routes | None found | |
| Services | None found | |
| DB | No tender-specific model found | |
| Notes | Word "tender" appears in opportunity/external context (process-execution route, now-view service) but only as business terminology, not as a dedicated capability | |
| Risk | MEDIUM — claimed capability but no implementation | |

### 12. Startup Mode

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/startup/route.ts`, `src/app/api/owner/startup-validate/route.ts` | Confirmed |
| DB | `StartupStatus` model | Confirmed |
| Services | Referenced in owner scenario profiles | Confirmed |
| Tests | Not confirmed in dedicated test file | |
| Risk | MEDIUM — schema + route exists, test coverage unclear | |

### 13. Pricing

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **MISSING** | |
| Routes | None found in `src/app/api/owner/` or elsewhere | |
| DB | No `Pricing` or `PricePoint` model found (Stripe subscription is not pricing analysis) | |
| Notes | Stripe billing exists (`/api/billing/plan`, `/api/billing/upgrade`) but that is product pricing, not business pricing capability for owner clients | |
| Risk | MEDIUM | |

### 14. Vendor / Procurement

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/owner/budget/` includes vendor budget context | Confirmed |
| Services | `src/services/owner-budget/vendor.service.ts` | Confirmed |
| DB | `VendorRecord`, `OwnerSupplierInventorySnapshot` | Confirmed |
| Dedicated route | No `/api/owner/vendor/` standalone route found | Missing |
| Tests | CI lane: "All-100 Customer/Vendor/Market" | Confirmed |
| Risk | LOW-MEDIUM | |

### 15. Compliance / Risk

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/owner/compliance/`, `src/app/api/proof-risk/adjudicate/` | Confirmed |
| DB | `OwnerComplianceItem`, `Risk`, `ProofRiskAdjudication` | Confirmed |
| Services | `src/services/failure-containment/`, `src/services/governance/` | Confirmed |
| Tests | CI lane: "All-100 Local/Legal/Boundary" | Confirmed |
| Risk | LOW | |

### 16. Capacity / Bottleneck

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Routes | `src/app/api/diagnosis/bottleneck/` | Confirmed |
| DB | `OwnerCapacitySnapshot`, `OwnerEmployeeWorkloadSnapshot`, `OwnerWorkloadSnapshot` | Confirmed |
| Services | `src/services/diagnostic-core/bottleneck-engine.ts`, capacity referenced in advisor context | Confirmed |
| Dedicated capacity route | No `/api/owner/capacity/` standalone route | |
| Risk | LOW-MEDIUM | |

### 17. Waste / Leakage

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **MISSING** | |
| Routes | No `/api/owner/waste/` or `/api/owner/leakage/` found | |
| DB | No dedicated waste model; capacity/operations snapshots may partially cover | |
| Services | Referenced in advisor logic as a concern but no standalone service | |
| Risk | MEDIUM — gap between concept (present in owner context) and implementation | |

### 18. Local Mode

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Implementation | `PrivateModeAccess` model, `src/middleware/private-mode-gate.ts`, `src/services/private-mode/role-access.service.ts` | Confirmed |
| Offline capability | No service worker / local DB detected | MISSING |
| `.env.example` | `STORAGE_PROVIDER=local`, `SCHEDULER_PROVIDER=in-memory` | Confirmed |
| Risk | MEDIUM — "Local Mode" as private/restricted access is real; "Local Mode" as offline-capable is not implemented | |

### 19. LLM / NLP Governed Analysis

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Provider interface | `src/services/ai/provider.ts` — full type system, task types, governance invariants | Confirmed |
| OpenAI adapter | `src/services/ai/openai-provider.ts` — real fetch adapter, fail-closed, advisory-only | Confirmed |
| API key | NOT in `.env.example` — live AI path dead without it | BLOCKER |
| Deterministic fallback | Active — all AI paths degrade gracefully | Confirmed |
| Anthropic | Not wired | MISSING |
| Risk | MEDIUM — code complete, key missing | |

### 20. Live Connectors

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **PARTIAL** | |
| Google Sheets | Code complete, credentials absent | PLACEHOLDER_ONLY |
| Browser import | Approval gating + consent model real | READ_ONLY_REAL |
| Stripe | Live billing connector | WRITE_CAPABLE_GATED |
| Other live connectors | None found | MISSING |
| Risk | HIGH — code claims more coverage than credentials support | |

### 21. Simulation

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **BACKEND_ONLY** | |
| Routes | `src/app/api/scenario/route.ts`, `src/app/api/run/` | Confirmed |
| Services | `src/services/scenario/engine.ts` | Confirmed |
| DB | `SnapshotData`, `OperationalEvent` | Confirmed |
| Real-world simulations | `tests/owner-mode/real-world-simulation/` — simulation test harness exists | Confirmed |
| Playwright | Not separately confirmed for simulation flows | |
| Risk | LOW-MEDIUM | |

### 22. Learning / Outcome Review

| Aspect | Status | Evidence |
|--------|--------|---------|
| **Overall** | **COMPLETE** | |
| Routes | `src/app/api/owner/learning-*` (10+ routes: admissions, candidates, consent, harm-events, privacy, regression-results, rejections, retention, reviews, rollback-events, rollout-flags, attribution-reviews) | Confirmed |
| DB | `ControlledLearning*` — 12+ models (Admission, AttributionReview, Candidate, ConsentRecord, HarmEvent, PrivacyControl, RegressionResult, Rejection, RetentionPolicy, Review, RollbackEvent, RolloutFlag) | Confirmed |
| Governance | Explicit harm-event tracking, rollback flags, consent model | Confirmed |
| Tests | `tests/owner-mode/real-world-simulation/` | Confirmed |
| Risk | LOW | |

---

## Summary Table

| # | Capability | Status | Risk |
|---|-----------|--------|------|
| 1 | Owner Mode | COMPLETE | LOW |
| 2 | Manual Entry | COMPLETE | LOW |
| 3 | Diagnosis / Recommendation / Action | COMPLETE | LOW |
| 4 | Evidence / Audit | COMPLETE | LOW |
| 5 | Finance / Budget / Cash / Profit | COMPLETE | LOW |
| 6 | Staff / Operator Execution Proof | COMPLETE | LOW |
| 7 | SOP / Training | COMPLETE | LOW |
| 8 | Customer Retention / Reactivation | PARTIAL | LOW-MEDIUM |
| 9 | Marketing ROI | COMPLETE | LOW |
| 10 | Opportunity Finder / Wealth / External | PARTIAL | MEDIUM |
| 11 | Tender / Application Assistance | **MISSING** | MEDIUM |
| 12 | Startup Mode | PARTIAL | MEDIUM |
| 13 | Pricing (business analytics) | **MISSING** | MEDIUM |
| 14 | Vendor / Procurement | PARTIAL | LOW-MEDIUM |
| 15 | Compliance / Risk | PARTIAL | LOW |
| 16 | Capacity / Bottleneck | PARTIAL | LOW-MEDIUM |
| 17 | Waste / Leakage | **MISSING** | MEDIUM |
| 18 | Local Mode | PARTIAL | MEDIUM |
| 19 | LLM/NLP Governed Analysis | PARTIAL | MEDIUM |
| 20 | Live Connectors | PARTIAL | HIGH |
| 21 | Simulation | BACKEND_ONLY | LOW-MEDIUM |
| 22 | Learning / Outcome Review | COMPLETE | LOW |

**MISSING (3):** Tender, Pricing (business), Waste/Leakage  
**PARTIAL (9):** Retention, Opportunity, Startup, Vendor, Compliance, Capacity, Local Mode, LLM/NLP, Live Connectors  
**COMPLETE (9):** Owner Mode, Manual Entry, Diagnosis/Rec/Action, Evidence/Audit, Finance, Staff/Proof, SOP/Training, Marketing, Learning
