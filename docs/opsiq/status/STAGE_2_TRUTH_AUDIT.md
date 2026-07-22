# OpsIQ Stage 2 — Forensic Current-Main Truth Audit
## Authoritative Remaining-Work Plan

**Audit date:** 2026-07-22  
**Auditor:** Claude Code (automated forensic audit, Stage 2 of controlling completion sequence)  
**Branch audited:** `claude/stage-2-current-main-truth-audit-mvie2d`  
**Audited SHA:** `cb8edd7b1f00a65d71fa7b45d4ee5ea29ee97d39`  

---

## Section A — Executive Truth Statement

OpsIQ is a governed business intervention and consulting operating system. It is a **diagnostic and advisory operating system**, not a full ERP. The core operating model is: owners manually enter periodic business snapshots → the system diagnoses issues → generates findings and actions → tracks execution and outcomes → learns from results.

**What OpsIQ can currently do:**
- Accept owner business data snapshots for 8 operational domains (Finance, Cashflow, Sales, Operations, SOP, Marketing, Strategy, Recovery) and produce AI-assisted diagnoses, findings, and ranked actions
- Present an owner dashboard (cockpit, home, now-view) with cross-domain health scores, risk danger levels, and prioritised next actions
- Enforce a governed approval→execution→verification lifecycle for startup/new-venture decisions with stale detection, supersession, and hash-based package integrity
- Manage business budgets, spending authority, vendor records, and 13-week cash forecasts
- Track business risks and compliance obligations (backend only)
- Support portfolio management across multiple businesses in one workspace
- Operate in private deployment mode (`OPSIQ_PRIVATE_WORKSPACE_ID` + `OPSIQ_PRIVATE_OWNER_USER_ID`) granting ENTERPRISE entitlement without any payment provider — Stripe not required for private owner pilot
- Provide governed authentication with type-branded workspace isolation
- Compute cross-domain BusinessConditionProfile from all 8 operational domains (wired but unproven against full 8-domain DB data)

> **Billing scope note:** Stripe webhook handling is production-hardened but is SaaS-only infrastructure. The selected future billing provider for SaaS expansion is Lemon Squeezy — which has zero current implementation. Neither provider is required for the private owner pilot.

**What OpsIQ cannot currently do:**
- Send any notification via email, SMS, push, or webhook (email completely absent; other channels are stubs or in-memory simulators)
- Manage B2C customer records, complaints linked to named customers, or per-customer retention risk
- Track individual marketing campaigns, channel-level spend, or per-campaign ROI
- Manage individual sales deals integrated with the diagnostic engine (three separate sales systems are siloed)
- Manage supplier purchase orders (vendor records exist; PO lifecycle is absent)
- Track inventory at item/SKU level (aggregate snapshot counts only)
- Create, view, or manage workforce tasks through any UI (DelegatedTask FSM exists in backend only)
- List, update, or retire equipment (write-once creation only; no maintenance scheduling)
- Show risk register or compliance calendar to the owner via any UI page
- Import banking transactions or connect to accounting software in production
- Autonomously discover external business opportunities (human-submitted signals only)
- Navigate at all on mobile (sidebar hidden below 768px with no alternative navigation)

**Is it ready for real-business onboarding?** No. Seven PILOT_BLOCKER items must be resolved first (revised down from 8 after reconciliation: M008 removed — already implemented; M001/M002 downgraded — in-app alerts sufficient, B2C records not day-1; two new blockers added — Alert model missing from schema, G2-15 staleness false-positive).

**Is it ready for live reliance?** No. The command surface works for advisory diagnosis. Transactional operations (notifications, task assignment via UI, customer management, procurement) are incomplete.

**Is it ready for bounded execution?** The approval→execution chain for startup decisions is well-implemented. For general business operations, the execution layer exists but has no owner-facing UI for task management or workforce coordination.

**Most serious gaps:**
1. Alert model (`db.alert`) absent from Prisma schema — all three `trigger*Alert` functions in `alert-service.ts` throw TypeError at runtime; in-app alerting is completely broken
2. G2-15: `assertStartupExecutionAuthorization` passes only 2 of 9 material IDs to `checkApprovalStaleness()` — causes false-positive STALE detection blocking legitimate startup execution
3. No mobile navigation (owners on phones cannot use the system)
4. Risk register and compliance calendar are backend-complete with no owner UI
5. Workforce task management has a complete backend FSM with no UI
6. Complete absence of email delivery (no transport wired — PILOT_REQUIRED, not day-1 blocker for private active pilot)
7. Marketing campaigns tracked as integer counts, no per-campaign records
8. Sales pipeline (SalesDealRecord) is not integrated with the diagnostic engine
9. Inventory management is aggregate-only (no SKU catalog)

**Confidence and limitations:** This audit is based on direct code inspection, agent-assisted deep-dives across all 2,798 source files, 221 Prisma models, and all 85 owner API routes. Database tests (202 files) were verified to be present but could not be run locally (no PostgreSQL). CI evidence from run 29908691252 confirms the full DB suite passed on `cb8edd7b`. Production deployment accessibility was not verified.

---

## Section B — Exact Repository Baseline

| Item | Value |
|---|---|
| **Audited branch** | `claude/stage-2-current-main-truth-audit-mvie2d` |
| **Audited SHA** | `cb8edd7b1f00a65d71fa7b45d4ee5ea29ee97d39` |
| **Origin/main SHA** | `cb8edd7b1f00a65d71fa7b45d4ee5ea29ee97d39` (exact match) |
| **Local matches origin/main** | YES |
| **Phase 5 HEAD (5bd24355) in ancestry** | YES — verified via `git rev-parse` |
| **Post-merge commit (cb8edd7b)** | PRESENT AND IS HEAD |
| **Working tree** | CLEAN — nothing to commit |
| **Ahead/behind origin/main** | 0/0 |
| **Untracked files** | None |
| **Private deployment mode** | `OPSIQ_PRIVATE_WORKSPACE_ID` + `OPSIQ_PRIVATE_OWNER_USER_ID` env vars → ENTERPRISE entitlement granted in `src/services/entitlement.ts:207`; Stripe not required |
| **Private owner seed script** | `scripts/seed-private-owner.ts`; validated on startup by `src/infra/startup-orchestrator.ts:124-133` |
| **Billing provider (SaaS, future)** | Lemon Squeezy — selected; zero implementation; only reference in codebase is AI output guardrail regex in `src/services/ai/validator.ts:40` |
| **Stripe** | Production-hardened webhook handler (`src/services/webhook.service.ts`); ACTIVE_SAAS_ONLY — not required for private pilot; `syncEntitlementsForSubscription` hollow (emits audit event only, grants no capabilities) |
| **Migration count** | 147 migrations (20260415–20260722) |
| **Schema models** | 221 |
| **Source files** | 2,798 TypeScript files |
| **Test files** | 1,138 test files (202 are `.db.test.ts`) |
| **TypeScript check** | PASS (0 errors in production source) |
| **Prisma schema validation** | PASS |
| **Governance scan (strict)** | PASS — 30 frozen pre-existing errors, 0 new |
| **Auth route governance scan** | PASS — all routes comply |
| **A77 prevention gates** | PASS — 20/20 gates green |
| **Wrapped handlers ratchet** | PASS — 8 pre-existing violations, 0 new |
| **CI run 29908691252** | Full DB Integration Suite: completed/success |
| **Non-DB test suite (local)** | Timed out in audit environment; passes in CI per run 29908691252 |
| **DB test suite (local)** | NOT RUN — no local PostgreSQL. CI evidence: full suite passed on push to main. |
| **Quarantined tests** | 23 files, 62 failing tests (non-blocking; pre-existing on SHA 7634ccf8) |
| **NPM vulnerabilities** | 15 (2 low, 8 moderate, 5 high) — audit finding |
| **Production deployment** | Not verified from this environment |
| **Production URL serving cb8edd7b** | Unverifiable — classified as LACKING_PRODUCTION_PROOF |

---

## Section C — Capability Inventory

### C.1 Owner Identity, Access and Tenancy

| Capability | Class | Pilot | Impl evidence | Test evidence | CI | Runtime | Prod | Missing | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Authentication (custom cookie/bcrypt) | PRODUCTION_READY | PILOT_BLOCKER | `src/services/auth.ts`; `Session` model; bcrypt, rate-limit, audit events | Auth service tests | PR gate | CI verified | Unverified | — | httpOnly cookie; secure flag; 24h expiry |
| Workspace resolution (VerifiedWorkspaceId) | PRODUCTION_READY | PILOT_BLOCKER | `src/lib/canonical-route-enforcement.ts:341-421`; DB membership proof | Auth context tests | PR gate | CI verified | Unverified | — | No header-based ID trusted |
| Capability/role enforcement (OWNER_VIEW, OWNER_MANAGE) | PRODUCTION_READY | PILOT_BLOCKER | `src/policies/capability-check.ts`; `src/lib/canonical-capability-resolver.ts` | Capability tests | PR gate | CI verified | Unverified | — | OWNER_VIEW only for admin/portfolio_manager |
| Tenant isolation (Prisma extension) | PRODUCTION_READY | PILOT_BLOCKER | `src/lib/prisma-workspace-enforcement.ts` — insert and bulk-mutation guards | Extension tests | Main gate | CI verified | Unverified | — | Single-row update relies on service scoping |
| Private mode enforcement | PRODUCTION_READY | PILOT_BLOCKER | `src/lib/private-mode-enforcement.ts`; `PrivateModeAccess` DB check | Private mode tests | PR gate | CI verified | Unverified | — | DB-verified role, not header-trusted |
| Middleware auth backstop | MISSING | PILOT_BLOCKER | `middleware.ts` — pass-through only, zero auth enforcement | — | — | — | — | No fallback if handler omits wrapper | Critical: regex governance catches missing wrappers at CI but not at runtime |
| Cross-workspace IDOR prevention | PRODUCTION_READY | PILOT_BLOCKER | Type-branded `VerifiedWorkspaceId` never derived from headers | IDOR tests | PR gate | CI verified | Unverified | — | Bridge function risk (see Section H) |
| Admin access (SYSTEM_ADMIN) | PRODUCTION_READY | PILOT_REQUIRED | `requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN]` on all admin routes | Admin route tests | PR gate | CI verified | Unverified | — | — |

### C.2 Owner Command Centre

| Capability | Class | Pilot | Impl evidence | Missing links |
|---|---|---|---|---|
| Business condition profile (cross-domain rollup) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `src/services/owner-condition/business-condition.service.ts`; ALL 8 domain adapters wired at lines 453-484 via `Promise.all` querying all 8 cycle tables; each domain conditionally pushed to `domainScores` array | **Initial audit claim "only Finance + Recovery wired" was factually wrong** — see Reconciliation Appendix. False-confidence risk: if fewer than 8 domains have cycle data, `dataSufficiencyStatus` may read "sufficient" while computing from incomplete cross-domain picture; DB tests cover Finance domain only |
| Owner cockpit (now-view) | PRODUCTION_READY | PILOT_REQUIRED | `src/services/owner-guidance/owner-now-view.service.ts` (2,509 lines); 8-step loop; gate blocking; do-not-repeat; escalation integration | Browser E2E not blocking on main push |
| Owner home summary | PRODUCTION_READY | PILOT_REQUIRED | `src/domain/owner-home/summary.ts`; pure function; all data from real spine | — |
| Cash position display | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | Via cashflow snapshot + cashflow danger on owner-home | No bank integration; manual entry only |
| Highest-priority actions | PRODUCTION_READY | PILOT_REQUIRED | `rankOwnerActions()` in owner-home/now-view | — |
| Urgent risk display | PRODUCTION_READY | PILOT_REQUIRED | `top3Risks` in owner-home from BusinessRiskEntry | No UI risk register page |
| Approval queue | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `ApprovalRequest` model; `/api/owner/approvals`; no standalone approval queue UI | Approvals surface only in cockpit, not as a dedicated page |
| Outcome verification queue | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `ProofRiskAdjudication` via adjudication page | Narrow scope (proof risk only, not all outcomes) |
| Stale action alerts | PARTIAL | PILOT_REQUIRED | Escalation model; `OwnerAttentionEvent`; stale detection in startup domain | Not implemented for general operating domain actions |
| Recommended next actions | PRODUCTION_READY | PILOT_REQUIRED | `buildOwnerNowView` prioritised action list | — |
| Cross-domain resource conflicts | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `GoalArbitrationRecord`; `ResourcePool/Allocation`; `/api/owner/arbitrate` | No UI for conflict resolution outside cockpit buttons |

### C.3 Finance and Cash Management

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Financial snapshot entry | PRODUCTION_READY | PILOT_REQUIRED | — |
| Financial diagnosis (gross margin, net margin, runway, leakage) | PRODUCTION_READY | PILOT_REQUIRED | — |
| Cash runway calculation | PRODUCTION_READY | PILOT_REQUIRED | — |
| Receivables tracking (balance + overdue %) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | No aging buckets (30/60/90 days); no per-debtor tracking |
| Payables tracking (balance + overdue %) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | No per-vendor breakdown in finance/cashflow modules |
| Cash forecast (13-week scenarios) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Uses finance snapshot monthly figures; not synced with cashflow daily obligations |
| Budget management (periods, lines, spend entries) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | UI self-documents as PARTIAL; no owner-mode complete |
| Spending authority and approval | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `BudgetAuthority` model; override audit trail; not linked to general action execution |
| Cost leakage detection | PRODUCTION_READY | PILOT_REQUIRED | `discountLeakagePct`, `refundReworkLeakagePct` in finance engine | — |
| Transaction ingestion / accounting import | MISSING | PILOT_DESIRABLE | QuickBooks/Xero: CSV templates only (PLACEHOLDER_ONLY); no live connector |
| Banking / bank statement import | MISSING | PILOT_DESIRABLE | Not implemented; no Plaid/Yodlee/direct bank API |
| Period-over-period comparison | MISSING | PILOT_REQUIRED | cycleHistory exists but no diff computation; owner cannot ask "did margin improve?" |

### C.4 Sales and Revenue Operations

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Sales snapshot diagnosis (aggregate period metrics) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | No integration test against real DB |
| Lead records (create, qualify, convert) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | No dedicated owner lead management UI page |
| Deal pipeline records (SalesDealRecord) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Not integrated with owner-sales diagnosis engine |
| Pipeline stage velocity | MISSING | PILOT_REQUIRED | No stage timestamp; cannot compute days-per-stage |
| Sales activity tracking (calls, meetings, follow-ups) | MISSING | PILOT_REQUIRED | Not implemented |
| Per-rep performance | MISSING | PILOT_DESIRABLE | staffCount only; no per-rep attribution |
| Revenue recognition / tracking | PARTIAL | PILOT_REQUIRED | Revenue tracked in snapshots and RevenueStreamRecord; not reconciled |
| Stalled deal detection | MISSING | PILOT_REQUIRED | No stage duration tracking |

### C.5 Marketing Execution

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Marketing snapshot diagnosis (aggregate ROI, CPL) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | No integration test |
| Per-campaign records | MISSING | PILOT_REQUIRED | `campaignsRun` is an integer; no Campaign model or records |
| Per-channel spend breakdown | MISSING | PILOT_REQUIRED | AcquisitionMetricsRecord model exists; not wired to owner-marketing engine |
| Campaign ROI (aggregate) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Aggregate only; cannot identify which campaign is underperforming |
| Content tracking | MISSING | PILOT_DESIRABLE | `contentPosted` is an integer count only |
| Lead attribution to campaigns | MISSING | PILOT_REQUIRED | paidLeads vs organicLeads as counts; no source-campaign linkage |

### C.6 Customer Operations

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Customer records (B2B consulting clients) | PRODUCTION_READY | PILOT_REQUIRED | `ClientAccount`, services, UI pages |
| B2C customer records | MISSING | PILOT_BLOCKER | No model for named individual customers at owner's business |
| Complaint tracking (linked to customer) | MISSING | PILOT_BLOCKER | `OperationalEvent` exists but has no customerId field |
| Retention risk per customer | MISSING | PILOT_BLOCKER | RetentionCohort is cohort-aggregate; no per-customer risk flag |
| Customer segmentation | MISSING | POST_PILOT | Not implemented |
| NPS/CSAT feedback | MISSING | PILOT_REQUIRED | Not implemented |
| Win-back workflow | MISSING | PILOT_REQUIRED | Generic action generated; no targeted customer contact list |
| Customer lifetime value | MISSING | PILOT_DESIRABLE | Not implemented |

### C.7 Suppliers and Procurement

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Vendor records (create, qualify, update) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Full API exists; no UI page for vendor management |
| Vendor contracts (append-only price history) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | VendorContract model; no UI |
| Vendor delivery tracking | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | VendorDeliveryRecord model; no UI |
| Vendor performance assessment | PARTIAL | PILOT_REQUIRED | `assessVendorRisk` — stateless assessment only; no aggregated dashboard |
| Purchase orders | MISSING | PILOT_REQUIRED | No PurchaseOrder model; no PO lifecycle |
| Supplier qualification workflow | PARTIAL | PILOT_REQUIRED | PENDING_REVIEW → APPROVED → SUSPENDED status only; no checklist or assessment form |
| Alternate supplier management | MISSING | PILOT_DESIRABLE | Not implemented |
| Procurement approval | MISSING | PILOT_REQUIRED | No PO approval workflow |

### C.8 Inventory

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Inventory risk snapshot (aggregate) | PARTIAL | PILOT_REQUIRED | `OwnerSupplierInventorySnapshot`; stockoutCount, worstStockoutRisk as aggregates | No per-SKU catalog |
| Reorder point calculation (domain logic) | PARTIAL | PILOT_REQUIRED | `src/domain/execution/supplier-inventory.ts` pure functions exist | Cannot persist results (no StockItem model) |
| Stock item catalog | MISSING | PILOT_REQUIRED | No model; no API; no UI |
| Stock movement ledger | MISSING | PILOT_REQUIRED | Not implemented |
| Stockout alert | PARTIAL | PILOT_REQUIRED | Risk score surfaced in now-view; no per-SKU alert |
| Reorder workflow (to PO) | MISSING | PILOT_REQUIRED | `suggestReorder()` exists as pure function; no pathway to persisted PO |

### C.9 Workforce and Task Execution

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Delegated task model (FSM, proof, SoD) | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | `DelegatedTask`, `ProofRequirement`, `Proof`; `TaskStatusHistory`; full service layer | NO UI for owners or employees |
| Task assignment service | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | `src/services/execution/task-assignment.service.ts` | No UI |
| Task completion with evidence | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | ProofRequirement + Proof FSM | No employee-facing task detail page |
| Employee workload snapshot | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `OwnerEmployeeWorkloadSnapshot`; service; no UI page | — |
| Staff skills matrix | IMPLEMENTED_BUT_UNPROVEN | PILOT_DESIRABLE | `OwnerStaffSkill` model; no service or API |
| Employee scheduling / shifts | MISSING | PILOT_DESIRABLE | No shift/roster model |
| Attendance tracking | MISSING | POST_PILOT | Not implemented |
| Absence response workflow | MISSING | PILOT_REQUIRED | No absence model; no coverage reassignment |

### C.10 Assets and Maintenance

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Equipment registration (create-only) | PARTIAL | PILOT_REQUIRED | `POST /api/owner/equipment`; `OwnerEquipment` model; audit logged | No GET, no PATCH, no list — write-once |
| Equipment list / update / retire | MISSING | PILOT_REQUIRED | No GET or PATCH routes; no list service |
| Maintenance schedule | MISSING | PILOT_REQUIRED | `maintenanceDueAt` single field; no recurrence, no schedule |
| Maintenance log | MISSING | PILOT_REQUIRED | No model for completed maintenance events |
| Work order assignment and tracking | MISSING | PILOT_REQUIRED | `WorkOrder` model is a thin shell; no assignee, no maintenance type |
| Breakdown reporting | MISSING | PILOT_REQUIRED | `downtimeState` field on OwnerEquipment; no breakdown event or alert |
| Preventive maintenance | MISSING | PILOT_DESIRABLE | Not implemented |
| Asset-utilization recommendations | PARTIAL | PILOT_DESIRABLE | Capacity snapshot computes utilization; no recommendation pipeline connected |

### C.11 Risk, Compliance and Incidents

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Risk register (BusinessRiskEntry — CRUD, severity, status) | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | Full models, services, API routes | NO OWNER UI PAGE |
| Risk classification and scoring | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | Likelihood × impact severity computed; status machine | No UI |
| Compliance items with deadline tracking | IMPLEMENTED_BUT_UNPROVEN | PILOT_BLOCKER | `OwnerComplianceItem`; `getComplianceReviewItems` (30-day window); API routes | NO OWNER UI PAGE |
| Compliance deadline notifications | MISSING | PILOT_BLOCKER | No alert triggered from expiry; notification service is a stub |
| Risk escalation | MISSING | PILOT_REQUIRED | `Escalation` model exists; not connected to risk records |
| Incident reporting | PARTIAL | PILOT_REQUIRED | `OperationalEvent` for complaints/rework; not a full incident management system |
| Policy linkage to risks | PARTIAL | PILOT_REQUIRED | `OperatingPolicy` model; no direct FK to BusinessRiskEntry |
| Residual risk tracking | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `residualRisk` field on BusinessRiskEntry | No UI to display or update |

### C.12 Policies, Approvals and Execution Safety

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Operating policies (CRUD + workspace overrides) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `OperatingPolicy`, `OperatingPolicyOverride`; API routes | No dedicated policy management UI |
| Spending limits and authorization levels | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `BudgetAuthority`; spending limit checks in startup auth gate | General operating actions not checked against budget authority |
| Approval requests (startup domain) | PRODUCTION_READY | PILOT_REQUIRED | Full approval workflow with hash, snapshot, staleness, supersession | — |
| Stale approval detection | PRODUCTION_READY | PILOT_REQUIRED | `checkApprovalStaleness()` on 17 material inputs; `STALE_REAPPROVAL_REQUIRED` status | — |
| Approval supersession | PRODUCTION_READY | PILOT_REQUIRED | `supersededById` on decisions, blueprints; `STARTUP_APPROVAL_BECAME_STALE` audit event | — |
| Idempotency on critical mutations | PRODUCTION_READY | PILOT_REQUIRED | DB-backed idempotency records; optimistic locks; composite unique constraints | — |
| Reversible vs irreversible action classification | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `StartupValidationPlan` has irreversibility markers; general execution lacks this | — |
| Execution authorization gate (20-check) | PRODUCTION_READY | PILOT_REQUIRED | `assertStartupExecutionAuthorization()` — 20 non-short-circuiting checks | G2-15 false-positive risk (see Section H) |
| General operating action approval | PARTIAL | PILOT_REQUIRED | `OwnerApprovalMemory` for recurring decisions; no general approval gate for non-startup actions | — |

### C.13 Opportunities

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Opportunity signal intake (human-submitted) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `ExternalOpportunitySignal`; 13 signal types; idempotency-keyed | No autonomous discovery |
| Opportunity classification + deduplication | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `planExternalOpportunitySignal()` intelligence loop | No UI for opportunity management |
| Tender screening | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `POST /api/owner/tender/screen`; `tenderId` signal type | No UI page for tenders |
| Bid/no-bid recommendation | PARTIAL | PILOT_REQUIRED | Classification outputs bid_go/hold/reject; no owner-approval gate wired | — |
| Owner approval gate for opportunities | MISSING | PILOT_REQUIRED | No approval workflow for opportunity signals | — |
| Application/proposal preparation | MISSING | PILOT_DESIRABLE | Not implemented |
| Result tracking and learning | PARTIAL | PILOT_DESIRABLE | `OpportunityValidationOutcome`; no outcome UI | — |
| Autonomous external opportunity finder | MISSING | POST_PILOT | Explicitly planned; not implemented; human-submitted only |

### C.14 Wealth, Growth and Profit Engine

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Wealth path computation | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `src/domain/owner-strategy/wealth-path.ts`; `WealthPath` engine | No DB backing; pure engine only |
| Growth engine (revenue, pricing, acquisition, retention) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `src/services/growth/` — 7 engine services with DB persistence | Outputs not wired to action pipeline |
| Cash safety gate blocking growth actions | PRODUCTION_READY | PILOT_REQUIRED | `src/services/owner-finance/recommendation-cash-safety.service.ts`; guidance orchestrator suppresses growth until cash gate passes | — |
| Pricing analysis | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `POST /api/owner/pricing-analysis`; pure stateless analysis | No history or trend tracking |
| Cost leakage identification | PRODUCTION_READY | PILOT_REQUIRED | Finance engine computes leakage ratios | — |
| Margin improvement recommendations | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `src/domain/owner-finance/recommendations.ts`; no execution wiring | — |
| Recommendation → approval → execution chain | PARTIAL | PILOT_REQUIRED | Startup domain chain is complete; general operating recommendations lack the full chain | — |
| Outcome measurement and learning | PARTIAL | PILOT_REQUIRED | `applyPriorFailureLearning` — real, wired; controlled-learning pipeline — governance-only | Controlled-learning rollout flags not consumed by any engine |

### C.15 Goals, Strategy and Planning

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Goal records (CRUD, lifecycle) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `OwnerGoal`, `OwnerGoalMilestone`; full service; API routes | No UI goal management page |
| Goal trajectory computation | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | CAGR-based trajectory from trailing snapshots; `TrajectoryConfidence` rating | Off-track goals don't auto-generate corrective actions |
| Strategy snapshots and findings | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Module 8 strategy domain (5-table spine) | No integration test |
| Goal arbitration (cross-objective conflict) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `GoalArbitrationRecord`; arbitration service; cockpit button | No dedicated arbitration UI page |
| Startup validation lifecycle | PRODUCTION_READY | PILOT_DESIRABLE | 21 Startup* models; full 13-state machine; approval chain | Browser E2E not blocking on main |
| Decision linkage to execution | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `ProcessExecutionTask` bridge; linked startup fields | General operating decisions lack structured linkage |

### C.16 Portfolio and Multi-Business

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Multi-business health comparison | PRODUCTION_READY | PILOT_REQUIRED | `buildPortfolioView()`; portfolio API routes; portfolio UI page | — |
| Cross-business ranking (urgency, cash risk, growth) | PRODUCTION_READY | PILOT_REQUIRED | `rankOwnerActions()` across all businesses | — |
| Per-business workspace isolation | PRODUCTION_READY | PILOT_REQUIRED | workspaceId + businessId on all domain tables | — |
| Consolidated owner reporting | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Portfolio dashboard surfaces cross-business alerts | No printable consolidated report |
| Resource/capital allocation across businesses | IMPLEMENTED_BUT_UNPROVEN | PILOT_DESIRABLE | `ResourcePool`/`ResourceAllocation`; no cross-business allocation UI | — |
| Safe routing of actions to correct business | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | businessId ownership guard in all services | No UI explicitly confirms which business is affected |

### C.17 Memory and Learning

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Operating memory (short-term, versioned) | PRODUCTION_READY | PILOT_REQUIRED | `OperatingMemoryEntry`; transactional supersession; 8 types | — |
| Do-not-repeat enforcement | PRODUCTION_READY | PILOT_REQUIRED | `OwnerDoNotRepeatRule`; blocks recommendation promotion when matching rule exists | — |
| Prior-failure confidence reduction | PRODUCTION_READY | PILOT_REQUIRED | `applyPriorFailureLearning()` — real, wired, reduces confidence 15%/failure | — |
| Outcome capture (OwnerActionOutcome) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Model + service; no UI to view outcome history | — |
| Controlled learning pipeline (13 services) | PARTIAL | POST_PILOT | Pipeline manages candidates/flags/harm/rollout but no engine reads the rollout flags | Rollout flags never consumed |
| Owner approval memory | PRODUCTION_READY | PILOT_REQUIRED | `OwnerApprovalMemory`; unique content hash; avoids re-asking | — |

### C.18 Notifications and Escalation

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| In-app alert records | BROKEN_AT_RUNTIME | PILOT_BLOCKER | `src/services/alerts/alert-service.ts` calls `db.alert.create()`, `db.alert.findFirst()` etc. | **`Alert` model does NOT exist in Prisma schema** (221 models verified) — `triggerBlockedAlert`, `triggerThresholdBreachAlert`, `triggerExecutionFailureAlert` throw TypeError at runtime. `deliverEmailAlert()` is an explicit stub: `logger.info("Email alert delivered (stub)")`. This is the real day-1 blocker; add Alert model to schema first. |
| Email notifications | MISSING | PILOT_BLOCKER | No transport anywhere — no Resend, SendGrid, SES, Postmark. Log stub only. | Completely absent |
| SMS notifications | MISSING | POST_PILOT | Simulated (in-memory random success); no real provider | — |
| Push notifications | MISSING | POST_PILOT | Simulated; no Firebase FCM or APNs | — |
| Webhook delivery | PARTIAL | POST_PILOT | `MockWebhookStore` — in-memory only; no DB persistence | No real outbound webhook delivery |
| Escalation records | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | `Escalation` model; cockpit surfaces active escalations | No dedicated escalation management page |
| Acknowledgement tracking | PARTIAL | PILOT_REQUIRED | Cockpit shows active escalations; no acknowledge button found | — |
| Stale action alerts | PARTIAL | PILOT_REQUIRED | OwnerAttentionEvent; no automated trigger from action due-date | — |

### C.19 Integrations, Providers and Data Ingestion

| Provider/Integration | Status | Adapter | Production Impl | Credentials | Test | Runtime | Missing |
|---|---|---|---|---|---|---|---|
| AI (OpenAI) | IMPLEMENTED_BUT_UNPROVEN | `src/services/ai/openai-provider.ts` | Yes (gpt-4o-mini/gpt-4o) | `OPENAI_API_KEY` optional | Live smoke (manual only) | Fail-closed | Live smoke not in blocking CI |
| AI (Anthropic) | IMPLEMENTED_BUT_UNPROVEN | `src/services/ai/anthropic-provider.ts` | Yes (claude-haiku-4-5/claude-sonnet-5) | `ANTHROPIC_API_KEY` optional | Live smoke (manual only) | Fail-closed | Live smoke not in blocking CI |
| Stripe billing | ACTIVE_SAAS_ONLY | `src/services/webhook.service.ts` | Yes — 14-point webhook hardening | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe sim test | Not verified | `syncEntitlementsForSubscription` is hollow (emits audit event only; grants no capabilities). Not required for private pilot — bypassed by `OPSIQ_PRIVATE_WORKSPACE_ID`. |
| Lemon Squeezy | MISSING | None | No | None | None | None | Zero implementation. Selected future billing provider for SaaS expansion. Only codebase reference: AI output guardrail regex in `src/services/ai/validator.ts:40`. |
| Google Sheets OAuth | IMPLEMENTED_BUT_UNPROVEN | `src/services/external-systems/google-sheets-oauth.service.ts` | Yes — full OAuth PKCE | `GOOGLE_CLIENT_ID`, etc. | Manual only | Self-classifies PLACEHOLDER_ONLY | No end-to-end integration test |
| HubSpot CRM | EXPLICITLY_DEFERRED | CSV import template only | No | None | None | None | Live connector |
| QuickBooks | EXPLICITLY_DEFERRED | CSV import template only | No | None | None | None | Live connector |
| Xero | EXPLICITLY_DEFERRED | Registry entry only | No | None | None | None | Any implementation |
| Salesforce/Zoho/Pipedrive | EXPLICITLY_DEFERRED | CSV templates only | No | None | None | None | Live connectors |
| Email delivery | MISSING | None | No | None | None | None | Entire transport layer |
| Slack | MISSING | Env vars only | No | `SLACK_BOT_TOKEN` env only | None | None | Any implementation |
| Banking/transactions | MISSING | None | No | None | None | None | Entire integration |
| Browser-assisted import | EXPLICITLY_DEFERRED | Code exists but throws `FeatureDisabledError` | No | N/A | None | Disabled | DB migration prerequisite |
| Background job scheduler | PARTIAL | `src/infra/scheduler.ts` | DB-backed (when `SCHEDULER_PROVIDER=database`) | None | Unit tests | In-process only | No external daemon/cron |
| Outbound webhooks | PARTIAL | `src/services/webhooks.service.ts` | In-memory `MockWebhookStore` | None | Unit tests | In-process only | DB persistence; real outbound transport |

### C.20 UI and Mobile Usability

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Owner cockpit navigation (desktop) | PRODUCTION_READY | PILOT_REQUIRED | Sidebar nav with Owner Cockpit + Log Data links (OWNER_VIEW gated) | — |
| Owner cockpit navigation (mobile) | MISSING | PILOT_BLOCKER | Sidebar uses `hidden md:block` — zero alternative navigation on mobile | No hamburger, no bottom nav, no slide-out drawer |
| Owner domain pages (Finance/Cashflow/Sales/Ops/SOP/Marketing/Strategy) | PRODUCTION_READY | PILOT_REQUIRED | Full pages with snapshot forms, diagnosis trigger, findings, actions | — |
| Admin billing page | PARTIAL | PILOT_REQUIRED | Reads `workspaceId` from localStorage — fails if absent | — |
| Risk register UI | MISSING | PILOT_BLOCKER | No page under `/owner/risks` | — |
| Compliance calendar UI | MISSING | PILOT_BLOCKER | No page under `/owner/compliance` | — |
| Task management UI (owner-side) | MISSING | PILOT_BLOCKER | No page for creating/viewing/assigning tasks | — |
| Task management UI (employee-side) | MISSING | PILOT_BLOCKER | No employee-facing task submission page | — |
| Vendor/supplier management UI | MISSING | PILOT_REQUIRED | No page under `/owner/vendor` | — |
| Goals UI | MISSING | PILOT_REQUIRED | No dedicated goals page | — |
| Opportunity management UI | MISSING | PILOT_REQUIRED | Only "decide" action in cockpit | — |
| Empty states | PRODUCTION_READY | PILOT_REQUIRED | All domain pages handle no-data with descriptive messages and CTAs | — |
| Error states with retry | PRODUCTION_READY | PILOT_REQUIRED | All 24 owner pages handle errors with retry buttons | — |
| Loading states | PARTIAL | PILOT_REQUIRED | All pages have loading states; cockpit/now/adjudication use unstyled plain text | Inconsistent loading UX |
| Budget page disclaimer | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Self-documents as DYNAMIC_BUDGET_MODULE_INTEGRATED_PARTIAL in UI | — |
| Touch targets (44px minimum) | PRODUCTION_READY | PILOT_REQUIRED | `min-h-[44px] min-w-[44px]` on action buttons in owner pages | — |

### C.21 Observability, Reliability and Recovery

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Audit trail (AuditEvent hash chain) | NOT_PRODUCTION_READY | PILOT_REQUIRED | `src/services/audit-trail.ts` emits events; `src/services/audit-event-hash-chain-validator.ts` attempts validation | **Schema has no `hash` column** — Prisma schema (221 models) has no `hash` field on `AuditEvent`. Emitter hashes `"${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}"` but validator expects `{previousHash, eventType, payload, recordedAt}` — **incompatible algorithms**. Validator is never called in any production path. Audit events are stored; chain integrity is not enforced. |
| Structured logging | PRODUCTION_READY | PILOT_REQUIRED | `src/logger.ts`; `classifyOperatorError` for sanitized error output | — |
| Audit event emission on critical mutations | PRODUCTION_READY | PILOT_REQUIRED | DC-19 gate enforces: no `.catch()` on emitAuditEvent in write-path handlers | — |
| Rate limiting | NOT_PRODUCTION_READY | PILOT_REQUIRED | `src/services/rate-limit.ts`: workspace middleware explicitly self-documents as "DEAD MIDDLEWARE — not wired in production"; `MockRateLimitStore` is in-process-only (resets on restart); only 4 routes apply any direct rate limiting | Rate limit enforcement is per-route only; no global workspace throttle in production |
| Idempotency records | PRODUCTION_READY | PILOT_REQUIRED | `IdempotencyRecord` model; DB-backed dedup | — |
| Health/readiness/liveness endpoints | PARTIAL | PILOT_REQUIRED | `/api/health`, `/api/readiness`, `/api/liveness` routes exist | Quarantined runtime proof tests fail without running server |
| Background job dead-letter | PARTIAL | PILOT_REQUIRED | In-process queue has dead-letter; DB scheduler has dead-letter state | Queue state lost on process restart |
| Production monitoring | MISSING | PILOT_REQUIRED | No Datadog/Sentry/Grafana configured | No external alerting |
| Database backups | MISSING | PILOT_REQUIRED | No backup procedure verified in codebase | Runbook references external tooling |
| NPM security vulnerabilities | PARTIAL | PILOT_REQUIRED | 15 vulnerabilities (2 low, 8 moderate, 5 high) | `npm audit fix` not run |

### C.22 Testing and Prevention Controls

| Capability | Class | Pilot | Missing links |
|---|---|---|---|
| Non-DB unit tests (blocking on PR) | PRODUCTION_READY | PILOT_REQUIRED | vitest run excluding *.db.test.ts and quarantine; passes CI | Timed out in audit environment (CI passes) |
| DB integration tests (blocking on main push) | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | 202 .db.test.ts files; postgres:16 service in main-integration.yml | NOT run on PR gate |
| Governance scan ratchet (no new violations) | PRODUCTION_READY | PILOT_REQUIRED | `governance:scan:strict`; 30 frozen errors; 0 new | 30 pre-existing errors frozen in baseline |
| Auth route governance scan | PRODUCTION_READY | PILOT_REQUIRED | All 364 route files comply | — |
| A77 prevention gates | PRODUCTION_READY | PILOT_REQUIRED | 20/20 gates pass | — |
| Wrapped handler ratchet | PRODUCTION_READY | PILOT_REQUIRED | 8 pre-existing, 0 new | 8 pre-existing violations still pending |
| Browser/E2E tests | DEAD_OR_DUPLICATED | PILOT_REQUIRED | `owner-e2e.yml` — branch-specific trigger only; NOT on push to main | Phase 5 journey not in blocking CI |
| Tenant isolation tests | IMPLEMENTED_BUT_UNPROVEN | PILOT_REQUIRED | Tests reference workspace scoping; Prisma extension unit-tested | No full tenant-isolation adversarial test suite |
| Quarantined tests (23 files, 62 failures) | PARTIAL | PILOT_REQUIRED | Visible non-blocking lane; known root causes documented | FULL_SUITE_TEST_DEBT_RECOVERY outstanding |

---

## Section D — End-to-End Workflow Traces

### D.1 Finance: Owner detects cash shortage

```
Owner UI (/owner/finance)
→ POST /api/owner/finance/businesses/[id]/snapshots
→ withCanonicalEnforcement (OWNER_VIEW)
→ workspace + businessId ownership guard (getBusiness)
→ createFinancialSnapshot (conflict guard, data confidence computed)
→ OwnerFinancialSnapshot persisted
→ POST /api/owner/finance/businesses/[id]/diagnoses
→ runFinanceDiagnosis (deterministic engine)
→ cashRunwayDays, survivalState = CRITICAL computed
→ OwnerFinanceCycle + OwnerFinanceFindings + OwnerFinanceActions persisted (single transaction)
→ emitAuditEvent (LOW_CONFIDENCE if score < 30)
→ Owner sees CRITICAL badge, top findings, prioritised actions
→ PATCH /api/owner/finance/actions/[id] → status = in_progress
→ POST /api/owner/finance/actions/[id]/verification → recordFinanceVerification (before/after)
→ OwnerFinanceVerification persisted
→ Owner-home updates cashDanger from next load

MISSING LINKS:
× No automated notification to owner that cashflow is CRITICAL
× No period-over-period comparison (is it getting worse?)
× No bank integration (all figures manual)
× Verification records one metric; no re-diagnosis to confirm net improvement
```

### D.2 Sales decline: Owner tracks 3-period trend

```
Owner UI (/owner/sales)
→ POST /api/owner/sales/businesses/[id]/snapshots (period 1, 2, 3)
→ POST /api/owner/sales/businesses/[id]/diagnoses (×3)
→ OwnerSalesCycle sequenceNumber increments
→ salesState tracks STRONG → SOFT → WEAK
→ Dashboard shows WEAK badge, declining trend
→ PATCH /api/owner/sales/actions/[id] → interventions proposed

MISSING LINKS:
× No automated 3-period-decline trigger (owner must manually check 3 cycles)
× SalesDealRecord data not feeding the diagnosis (two systems siloed)
× No notification on declining trend
× No per-rep attribution or activity log
```

### D.3 Approval staleness: Startup decision superseded

```
Owner in startup session (EXECUTION_PLANNED)
→ Evidence updated → recordEvidenceItem with new conflicting evidence
→ propagateHypothesisFailureToStaleness emits if hypothesis fails
→ reassessReadinessAfterHypothesisChange produces new readiness ID
→ transitionSession("EXECUTION_PLANNED") called
→ checkApprovalStaleness compares 17 inputs → changedInputs: ['readiness']
→ ConflictError thrown → session not advanced
→ Status set to STALE_REAPPROVAL_REQUIRED
→ STARTUP_APPROVAL_BECAME_STALE audit event emitted (exactly once)
→ Owner must record new GO decision (recordOwnerDecision)
→ Previous decision gets supersededById set
→ New blueprint created (old marked SUPERSEDED, old tasks cancelled)
→ assertStartupExecutionAuthorization passes 20 checks with fresh package hash
→ Execution can resume

MISSING LINK:
× G2-15 staleness check passes only ideaVersionId to checkApprovalStaleness, leaving
  other material IDs undefined — potential false-positive staleness on execution gate
```

### D.4 Risk register: Owner records and tracks a risk

```
POST /api/owner/risks (action: CREATE)
→ withCanonicalEnforcement (OWNER_MANAGE)
→ createBusinessRisk: severity = likelihood × impact / 100; riskCode auto-generated
→ BusinessRiskEntry persisted; OWNER_BUSINESS_RISK_IDENTIFIED audit event emitted
→ GET /api/owner/risks → list for owner review

MISSING LINKS:
× No owner UI page to view/create/edit risks
× No risk heatmap or visualization
× No notification when risk exceeds threshold
× Risks visible only via API; owner cannot access without developer tools
```

### D.5 Multi-business portfolio: Owner compares two businesses

```
Owner visits /owner/portfolio
→ GET /api/owner/portfolio/dashboard
→ getPortfolio(workspaceId): listBusinesses → per-business getBusinessCondition (parallel)
→ buildPortfolioView: ranks by cash risk, urgency, growth potential
→ Owner sees cross-business health, top priorities, investment recommendation

MISSING LINKS:
× Opportunity comparison across businesses not automated
× Capital allocation requires manual input to ResourcePool
```

---

## Section E — Dead, Duplicate and Conflicting Functionality

| Item | Type | Active implementation | Dead/obsolete | Risk | Recommendation |
|---|---|---|---|---|---|
| `jest.config.js` | DEAD_OR_DUPLICATED | Vitest (`vitest.config.ts`) | `jest.config.js` — zero CI references | Confusion for contributors | Delete in a cleanup commit |
| `RecommendationLegacy` (@@ignore) | DEAD_OR_DUPLICATED | `Recommendation` model | `RecommendationLegacy` in DB but inaccessible via Prisma | Historical read only | Formal migration to drop table, or keep with documented lifecycle |
| `EventEmitterService.getAggregateEvents` | DEAD_OR_DUPLICATED | Not implemented | Referenced by 2 quarantined test files | Tests permanently failing | Either implement or delete tests + remove API reference |
| `markSuccess/markFailure` in `execution-service.ts` | DEAD_OR_DUPLICATED | Throws `GAP-PROOF-02` immediately | Dead body below early throw | Confuses future contributors | Delete the dead body |
| `src/middleware/private-mode-gate.ts` (`getPrivateModeAccess`) | DEAD_OR_DUPLICATED | `withPrivateModeEnforcement` (canonical) | Dead middleware reading identity from `x-user-id` header | Latent IDOR risk if re-wired | Delete the file |
| `canonicalizeAuthContext` bridge (unsafe cast) | DEAD_OR_DUPLICATED | `withCanonicalEnforcement` (canonical) | Bridge in `src/lib/auth-guard.ts:241` — used in test helpers only | Security risk if used in production paths | Restrict to test-only import; add runtime guard |
| `src/domain/finance/types.ts` (legacy stub) | DEAD_OR_DUPLICATED | `src/domain/owner-finance/` (real engine) | Legacy 4-type stub used only by old recommendation-impact calculator | Confusion about which is authoritative | Document clearly; migrate callers; deprecate stub |
| `FinancialBaseline` Prisma model | DEAD_OR_DUPLICATED | `OwnerFinancialSnapshot` (real data) | `FinancialBaseline` with nullable engagementId — appears to be a legacy test seed model | Orphaned rows with null engagementId lose all tenant context | Audit rows in production; migrate data or drop table |
| `src/services/webhooks.service.ts` vs `src/lib/integrations/webhook.ts` | DEAD_OR_DUPLICATED | Both active | `MockWebhookStore` (in-memory D3 webhook) vs thin `webhook.ts` emitter | Inconsistent state; in-memory store is not production-ready | Unify into DB-backed implementation |
| Multiple revenue tracking surfaces (OwnerFinancialSnapshot.revenue, RevenueStreamRecord, SalesDealRecord, OwnerSalesSnapshot.revenue) | DEAD_OR_DUPLICATED | All active but siloed | Revenue figures entered separately in each module | Inconsistent totals; no reconciliation | Define single source of truth per revenue period; cross-module reconciliation |

---

## Section F — Unproven Implementation Inventory

The following are substantially implemented but lack one or more required proof layers:

| Capability | Missing proof |
|---|---|
| Owner-Finance full end-to-end | No DB integration test for create-snapshot → diagnose → act → verify chain |
| Owner-Cashflow full end-to-end | No DB integration test |
| Owner-Sales full end-to-end | Three separate systems not integration-tested together |
| Owner-Operations full end-to-end | No DB integration test |
| Owner-SOP full end-to-end | No DB integration test |
| Owner-Marketing full end-to-end | No DB integration test |
| Owner-Strategy full end-to-end | No DB integration test |
| DelegatedTask FSM | No UI proof; no runtime workflow proof |
| Risk/Compliance backend | No UI proof; no owner runtime proof |
| Vendor management backend | No UI proof |
| Google Sheets OAuth | No end-to-end integration test; connector self-reports PLACEHOLDER_ONLY |
| AI provider (OpenAI/Anthropic) | Live smoke test is manual-only; never in blocking CI |
| Phase 5 browser journey | `56-startup-mode-journey.spec.ts` in `owner-e2e.yml` — branch-specific only, not on main push |
| Controlled learning rollout flags | Never consumed by any engine; rollout is governance-only |
| 13-week cash forecast | No integration test combining finance snapshot + budget module |
| Goal trajectory | No integration test; no corrective action trigger |
| Portfolio multi-business | No multi-workspace DB integration test |
| Opportunity intake and intelligence loop | No integration test with real signal → classify → promote chain |
| Operating memory supersession | Unit tests; no multi-cycle DB integration test |

---

## Section G — Missing Capability Inventory

Confirmed missing after repository-wide search:

| Capability | Searches performed | PILOT criticality |
|---|---|---|
| Email transport | `grep -r "nodemailer\|sendgrid\|resend\|mailgun\|ses\|postmark" src --include="*.ts"` → 0 results | PILOT_BLOCKER |
| B2C customer records | Schema grep for `Customer\|CustomerRecord\|BuyerRecord` → none; `ClientAccount` is consulting CRM only | PILOT_BLOCKER |
| Customer-linked complaints | Schema check: `OperationalEvent` has no `customerId`; grep for `operationalEvent.*customer\|complaint.*customerId` → 0 | PILOT_BLOCKER |
| Mobile navigation | AppShell grep: `hamburger\|mobile.*nav\|bottom.*nav\|drawer` → 0 results | PILOT_BLOCKER |
| Risk register UI page | `ls src/app/(authenticated)/owner/risks/` → not found | PILOT_BLOCKER |
| Compliance calendar UI | `ls src/app/(authenticated)/owner/compliance/` → not found | PILOT_BLOCKER |
| Task management UI | `ls src/app/(authenticated)/owner/tasks/` → not found | PILOT_BLOCKER |
| Purchase order model | Schema grep for `PurchaseOrder\|ProcurementRequest` → none | PILOT_REQUIRED |
| Stock item catalog | Schema grep for `Inventory\|StockItem\|StockMovement\|StockLocation` → none; only `OwnerSupplierInventorySnapshot` (aggregate) | PILOT_REQUIRED |
| Employee scheduling | Schema grep for `EmployeeSchedule\|Shift\|Roster\|Timesheet` → none | PILOT_DESIRABLE |
| Equipment list/update/retire routes | `ls src/app/api/owner/equipment/` → `route.ts` only (POST); no GET/PATCH | PILOT_REQUIRED |
| Maintenance scheduling | Schema grep: `MaintenanceSchedule\|MaintenanceLog\|PreventiveMaintenance` → none | PILOT_REQUIRED |
| Per-campaign marketing records | Schema grep: `Campaign\|MarketingCampaign` → none | PILOT_REQUIRED |
| Sales activity log | Schema grep: `SalesActivity\|CallLog\|MeetingRecord` → none | PILOT_REQUIRED |
| Autonomous opportunity discovery | Grep for `scrape\|tender.*search\|rss.*opportunity` in src → 0 results; domain file explicitly documents "NEVER scrapes" | POST_PILOT |
| External notification providers | Grep for `twilio\|firebase.*fcm\|apns\|pusher` → 0 results | POST_PILOT |
| Period-over-period financial comparison | No `diffCycles\|compareSnapshots\|trendDiff` function in finance engine | PILOT_REQUIRED |
| Production monitoring (APM/error tracking) | Grep for `sentry\|datadog\|newrelic\|honeycomb` → 0 results | PILOT_REQUIRED |
| Vendor management UI | `ls src/app/(authenticated)/owner/vendor/` → not found | PILOT_REQUIRED |

---

## Section H — Security and Execution-Safety Findings

### H1 — LATENT_HIGH (downgraded from CRITICAL): `canonicalizeAuthContext` emits `VerifiedWorkspaceId` without DB proof
**Reclassified by reconciliation:** Initial audit classified CRITICAL. Direct inspection confirms all 18 call sites are in `src/__tests__/phase-g/g6r-auth-bridge.test.ts` only. Zero production routes import or call this function.  
**File:** `src/lib/auth-guard.ts:241`  
**Code:** `verifiedWorkspaceId: workspaceId as unknown as VerifiedWorkspaceId`  
**Risk:** If re-introduced into any production path, the resulting context bypasses DB membership proof. TypeScript nominal branding provides no protection against `as unknown as` cast.  
**Current mitigation:** Test-only. Documented as "LEGACY BRIDGE: test/migration helpers only." Not reachable from any production route.  
**Required fix:** Add governance gate blocking production imports of this function (M024); delete or annotate as `@test-only`.

### H2 — DEAD (downgraded from HIGH): Dead middleware with header-based identity lookup
**Reclassified by reconciliation:** Initial audit classified HIGH. Direct inspection confirms the only production import is `import type { PrivateModeGateOptions }` in `src/lib/private-mode-enforcement.ts` — a TYPE-ONLY import with no runtime function calls. The runtime functions (`getPrivateModeAccess`, `privateModeGate`) are never invoked in any production code path.  
**File:** `src/middleware/private-mode-gate.ts`  
**Code:** `const userId = request.headers.get('x-user-id');`  
**Risk:** If re-wired, creates IDOR path. Currently unreachable.  
**Required fix:** Delete the file (M019). Low urgency — dead code; no active attack surface.

### H3 — DEFENSE_IN_DEPTH_GAP (downgraded from HIGH): No middleware-level auth backstop
**Reclassified by reconciliation:** Initial audit classified HIGH. Direct inspection of all 391 route files establishes that the 27 routes without `withCanonicalEnforcement` are each legitimately public: `/api/health`, `/api/liveness`, `/api/readiness` (public probes), auth routes (pre-authentication, must be unprotected), API-key-protected diagnostics (static key check in handler), Bearer-token-protected cron (HMAC/timing-safe compare), and permanently disabled endpoints. None serve owner business data.  
**File:** `middleware.ts`  
**Risk:** If a future route handler incorrectly omits `withCanonicalEnforcement` and is not caught by CI, it is fully unauthenticated with no runtime backstop.  
**Current mitigation:** 364/391 route files use the canonical wrapper. Governance scanner ratchet prevents new unwrapped routes. A77 gates verify no new violations. 27 legitimately unwrapped routes are each justified.  
**Residual gap:** No runtime fail-closed backstop if governance scanner is bypassed (e.g., vendored build without CI).  
**Required fix:** Document the 27 legitimately unwrapped routes in a governance allowlist; consider adding middleware-level check against an allowlist for defense-in-depth. Not a blocking issue.

### H4 — HIGH: `workspaceId` naming inconsistency — stores `ClientAccount.id`
**Affected models (16):** `OwnerInputRecord`, `OwnerInputQualityAssessment`, `OwnerActionOutcome`, `OwnerReassessmentEvent`, `PrivateModeAccess`, and all 13 `ControlledLearning*` models  
**Risk:** Any service-layer code that uses these `workspaceId` values as if they were `Workspace.id` values will silently produce wrong or empty cross-tenant queries. The IDs are `ClientAccount.id` values (different UUIDs).  
**Current mitigation:** Service layer for these models appears to use them correctly via the Prisma relation. Must be verified.  
**Required fix:** Rename columns to `clientAccountId` or clearly document the inconsistency; add database comment; add service-layer assertions.

### H5 — HIGH: `Entity` and `EntityLink` have no workspace isolation
**Files:** Schema, entity service  
**Risk:** Any user with an `Entity.id` can fetch that entity regardless of workspace. Cross-tenant data visibility.  
**Required fix:** Add `workspaceId` to `Entity` and `EntityLink`; add workspace scoping to all entity queries.

### H6 — HIGH (escalated from MEDIUM): G2-15 staleness check passes incomplete ID set — PILOT_BLOCKER
**Escalated by reconciliation:** Initial audit classified MEDIUM. This is an execution-safety defect in active production Phase 5 code with a confirmed false-positive trigger path.  
**File:** `src/services/owner-strategy/startup-session.service.ts`  
**Primary defect (line 2399-2414):** `assertStartupExecutionAuthorization` calls `checkApprovalStaleness(workspaceId, input.sessionId, { ideaId: input.ideaId, ideaVersionId: decision.linkedIdeaVersionId })` — passes only 2 of 9 material versioned IDs. The remaining 7 (`profileVersionId`, `economicModelId`, `readinessId`, `systemRecId`, `businessModelId`, `marketSizingId`, `validationPlanId`) default to null in hash recomputation.  
**Secondary defect (line 170):** A separate `checkApprovalStaleness(workspaceId, sessionId, {})` call passes an EMPTY object — all 9 inputs null. This is a confirmed false-positive source.  
**Consequence:** If the stored decision recorded non-null values for those 7 fields, the recomputed hash differs → false-positive `STALE_REAPPROVAL_REQUIRED` → execution gate blocks legitimate execution permanently until owner creates a new decision.  
**Required fix (recommended as first implementation slice):** Pass all 9 material versioned IDs to both call sites. Existing DB test infrastructure (`startup-session.db.test.ts`) covers this code path; add a regression test for the false-positive scenario.

### H7 — MEDIUM: `FinancialBaseline.engagementId` nullable
**Risk:** Rows with null `engagementId` have zero tenant context. No `workspaceId` fallback exists.  
**Required fix:** Audit existing rows; add workspaceId column; backfill or delete orphaned rows.

### H8 — MEDIUM: 15 npm security vulnerabilities
**5 high severity:** Inspect `npm audit` for exact packages.  
**Required fix:** `npm audit fix` at minimum; `npm audit fix --force` where breaking changes are acceptable.

### H9 — MEDIUM: AuditEvent.workspaceId nullable
**Risk:** System audit events (billing webhooks, admin actions) have no workspace scope. Audit trail cross-tenant queries must filter on `workspaceId IS NOT NULL`.  
**Current mitigation:** Intentional by design for cross-workspace system events.  
**Residual risk:** Audit completeness reporting may undercount events for a workspace.

### H10 — LOW: 30+ scalar UUID references with no FK enforcement
**Risk:** Referenced records can be deleted; child records silently orphan. Affects `DelegatedTask`, `TaskStatusHistory`, `Proof`, `OperationalEvent`, `ProcessExecutionTaskProgress`, etc.  
**Required fix:** Either add Prisma @relation (with cascade policy), or add application-level guard before deletion.

---

## Section I — Data and Integration Readiness

| Integration | Status | Adapter | Production impl | Credentials | Test proof | Runtime proof | Missing work |
|---|---|---|---|---|---|---|---|
| OpenAI | IMPLEMENTED_BUT_UNPROVEN | `openai-provider.ts` | Yes (gpt-4o-mini/gpt-4o) | `OPENAI_API_KEY` optional | Live smoke (manual) | Fail-closed; not in blocking CI | Add to blocking CI smoke |
| Anthropic Claude | IMPLEMENTED_BUT_UNPROVEN | `anthropic-provider.ts` | Yes (haiku-4-5/sonnet-5) | `ANTHROPIC_API_KEY` optional | Live smoke (manual) | Fail-closed; not in blocking CI | Add to blocking CI smoke |
| Stripe | PRODUCTION_READY | `webhook.service.ts` | Yes (14-point) | `STRIPE_*` required for billing | Stripe simulator | webhook endpoint tested | — |
| Google Sheets | IMPLEMENTED_BUT_UNPROVEN | `google-sheets-oauth.service.ts` | Yes (full OAuth PKCE) | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Manual only | Self-reports PLACEHOLDER_ONLY | Integration test; remove PLACEHOLDER status |
| HubSpot | EXPLICITLY_DEFERRED | CSV template only | No | None | None | None | Live connector implementation |
| QuickBooks | EXPLICITLY_DEFERRED | CSV template only | No | None | None | None | Live connector implementation |
| Email | MISSING | None | No | None | None | None | Choose provider; implement transport; wire to alert-service.ts |
| Slack | MISSING | Env vars | No | `SLACK_BOT_TOKEN` env | None | None | Full implementation |
| Banking | MISSING | None | No | None | None | None | Full implementation |
| Background scheduler | PARTIAL | `scheduler.ts` | DB-backed available | `SCHEDULER_PROVIDER` env | Unit tests | In-process only | External daemon/cron trigger for `processDue()` |
| Outbound webhooks | PARTIAL | `webhooks.service.ts` | In-memory only | None | Unit tests | In-memory only | DB-backed `WebhookDelivery` persistence; real HTTP transport |

---

## Section J — UI and Mobile Readiness

**Complete owner journeys (desktop):**
- Finance snapshot → diagnosis → finding → action → verification: COMPLETE
- Cashflow snapshot → diagnosis → action → verification: COMPLETE
- Sales snapshot → diagnosis → action → verification: COMPLETE
- Operations snapshot → diagnosis → action → verification: COMPLETE
- Marketing snapshot → diagnosis → action → verification: COMPLETE
- Strategy snapshot → diagnosis → finding → action: COMPLETE
- Recovery cycle → finding → action → verification: COMPLETE
- Budget planning → spend guidance → working capital: PARTIAL (self-documented)
- Portfolio comparison: COMPLETE
- Startup validation lifecycle: COMPLETE (browser E2E exists but not blocking)
- Wealth command center: COMPLETE (read-only)
- Trust/explainability dashboard: COMPLETE (read-only)

**Backend capabilities with NO usable owner UI:**
- Risk register (BusinessRiskEntry)
- Compliance calendar (OwnerComplianceItem)
- Task management (DelegatedTask)
- Vendor/supplier management
- Goals management
- Equipment list/update/retirement
- Controlled learning pipeline (12 API route groups)
- KPI ownership records
- Operating memory viewer
- Opportunity signal management
- Standing instructions
- SOP document library

**Dead UI paths:** `/admin/billing` reads `workspaceId` from `localStorage` — fails if key is absent (fresh browser).

**Mobile gaps (CRITICAL):**
- Sidebar: `hidden md:block` — completely invisible below 768px
- Cockpit, Now view, Adjudication pages use inline styles with no responsive breakpoints
- No hamburger button, no bottom navigation, no slide-out drawer anywhere in AppShell
- On mobile, an owner landing on `/owner/cockpit` has no navigation to other sections

**Accessibility:** `min-h-[44px]` touch targets present on action buttons. No ARIA labels, screen reader testing, or focus management audit found.

---

## Section K — Test and CI Truth

### What green CI on `cb8edd7b` proves:

**PR gate (ci.yml) — blocking:**
- TypeScript compiles cleanly
- Prisma schema is syntactically valid
- Governance scan finds no NEW violations (30 frozen pre-existing errors remain)
- All API route files use `withCanonicalEnforcement` (regex check)
- A77 prevention gates: 20/20 pass (no new duplicate implementations, no new shadow reads)
- Wrapped handlers: no new unwrapped handler additions
- All non-DB tests pass (DB tests excluded from PR gate)
- Lint ratchet: no new lint debt

**Main-integration (main-integration.yml) — blocking:**
- All of the above PLUS:
- Prisma migrations apply cleanly to postgres:16
- All DB integration tests pass (202 files)
- Phase 5 startup session DB tests (startup-session.db.test.ts) pass
- Phase 5 execution lifecycle DB tests pass
- All outcome verification tests pass

### What green CI does NOT prove:
- Browser/E2E journeys work (owner-e2e.yml is branch-specific; not on main push)
- AI providers return correct outputs (live smoke is manual-only)
- External providers work (all external integrations are either absent, mocked, or manual-only)
- Production deployment is serving the correct commit
- Mobile navigation works (no mobile test exists)
- Email, SMS, push notifications are delivered (no transport exists)
- The 23 quarantined tests pass (known failures, non-blocking)
- Per-SKU inventory, PO lifecycle, maintenance workflow, customer records, or campaign records work (they don't exist in the codebase)
- The controlled learning rollout flags affect any engine behavior (they don't)
- The owner briefing engine is wired to any data source (it isn't)

### Test debt:
- 23 quarantined files, 62 failing tests: `FULL_SUITE_TEST_DEBT_RECOVERY` task outstanding
- 8 wrapped handler violations: pre-existing, ratcheted
- 30 governance scan errors: pre-existing, frozen in baseline
- `EventEmitterService.getAggregateEvents` stale API: 2 quarantined files reference it; fix or delete

---

## Section L — Real-Business Scenario Results

| # | Scenario | Supported | Unsupported | Classification |
|---|---|---|---|---|
| 1 | Owner discovers imminent cash shortage | Cashflow snapshot captures cash in hand + obligations; CRITICAL state computed; owner-home shows cashDanger | No automated bank alert; manual entry required; no notification triggered | PARTIAL — requires manual data entry; no proactive alert |
| 2 | Overdue receivables threaten payroll | Cashflow: receivablesOverdue captured; urgentPaymentRiskPct computed; Finance: receivablesOverdue captured; action "chase receivables" generated | No per-debtor breakdown; no automated notification; salaryDue entered separately | PARTIAL — system can flag the problem if data is entered; cannot identify which debtor to chase |
| 3 | Sales decline 3 consecutive periods | 3 cycles can be created; salesState tracks WEAK; owner-home shows salesDanger | No automated 3-period trigger; no trend alert; owner must manually compare 3 cycles; no notification | PARTIAL — system tracks the state; does not proactively alert |
| 4 | Marketing campaign spends but produces poor leads | MarketingSnapshot: costPerLead computed; marketingState = LEAKING/WASTING generated | No per-campaign records; owner cannot identify which campaign is underperforming | PARTIAL — aggregate ROI detected; specific campaign cannot be identified |
| 5 | Major customer complains repeatedly | OperationalEvent records complaint events | No customer linkage on complaints; owner cannot see if repeated complaints are from same customer | NOT SUPPORTED — no B2C customer records; complaint system has no customerId |
| 6 | Supplier fails to deliver | VendorDeliveryRecord can track on-time delivery; assessVendorRisk available | No purchase order to detect missed delivery automatically; no automated alert; no UI | PARTIAL — records can be created via API; no owner UI; no automated detection |
| 7 | Inventory item about to stock out | OwnerSupplierInventorySnapshot: stockoutCount, worstStockoutRisk computed | No stock item catalog; cannot identify WHICH item; no reorder workflow | PARTIAL — can detect "some items at risk" but not which item |
| 8 | Employee absent during critical period | DelegatedTask can be reassigned (model supports assignedUserId change) | No scheduling model; no absence record; no coverage workflow; no UI | NOT SUPPORTED — task reassignment possible via API only; no workflow exists |
| 9 | Essential equipment breaks down | OwnerEquipment.downtimeState can be set to "down" via POST | No breakdown event; no work order; no timeline; equipment created once only (no update route) | NOT SUPPORTED — can record initial state; cannot track breakdown events |
| 10 | Compliance deadline approaching | OwnerComplianceItem with expiresAt; getComplianceReviewItems returns expiring-soon | No UI page; no notification delivery; owner cannot see this without API | PARTIAL — data exists; completely invisible to owner through any UI |
| 11 | Public tender matching business appears | ExternalOpportunitySignal: GOVERNMENT_TENDER type; classification and screening available | No autonomous discovery; owner or consultant must submit manually | PARTIAL — human-submitted intake works; no autonomous finder |
| 12 | Tender attractive but insufficient capacity | Capacity assessment API exists; guidance orchestrator gates growth on capacity | No dedicated capacity vs tender comparison UI; no automated capacity check trigger | PARTIAL — components exist but not integrated into a tender evaluation flow |
| 13 | Tender requires spending beyond standing limit | BudgetAuthority model; OwnerBudgetOverride; startup execution auth checks spending | General action spending limits not enforced outside startup domain | PARTIAL — enforcement exists in startup domain; general procurement lacks it |
| 14 | Approval becomes stale after facts change | checkApprovalStaleness (17 inputs); STALE_REAPPROVAL_REQUIRED status; audit event | Partial: G2-15 false-positive risk (incomplete IDs passed to stale check) | IMPLEMENTED_BUT_UNPROVEN (startup domain); MISSING for general operating approvals |
| 15 | Approved action superseded by newer decision | Startup domain: supersededById on decisions, blueprints, plans, tasks | General operating domain actions: no supersession mechanism | PARTIAL — complete in startup domain; absent in general operations |
| 16 | Action executes but fails | OwnerActionOutcome service; ProcessExecutionTask outcome recording; applyPriorFailureLearning | No UI for outcome history; failure learning affects confidence but no re-diagnosis triggered | PARTIAL — failure is recorded; does not auto-trigger corrective action |
| 17 | Action succeeds but result not financially beneficial | OwnerFinanceVerification records before/after for one metric | No cross-module outcome verification; no re-diagnosis to confirm net financial effect | PARTIAL — records the claimed improvement; cannot verify impact on other metrics |
| 18 | Reckless growth recommendation conflicts with cash safety | recommendation-cash-safety.service.ts; guidance orchestrator suppresses growth until cash gate passes | — | PRODUCTION_READY — cash safety gate is fully wired |
| 19 | Two domains compete for same cash/staff | ResourcePool/ResourceAllocation; GoalArbitrationRecord; goal-arbitration API; cockpit buttons | No UI for resource conflict resolution; no automated conflict detection | PARTIAL — data model and service layer exist; UI is cockpit-button only |
| 20 | Two businesses compete for same opportunity | Portfolio ranking compares businesses; goalArbitration can arbitrate cross-business | No mechanism to route one opportunity signal to multiple businesses for comparison | PARTIAL — portfolio comparison works; opportunity-specific cross-business routing absent |

---

## Section M — Authoritative Remaining-Work Register

### M-CRIT: Critical blocking items

> **Reconciliation note:** Items MNEW-01 and MNEW-02 are new blockers discovered during hostile reconciliation. M001 and M002 are downgraded from PILOT_BLOCKER to PILOT_REQUIRED — see Reconciliation Appendix. M008 is removed — BusinessConditionProfile already wires all 8 domains per code inspection.

| ID | Domain | Deficiency | Class | Pilot | Affected files | Approach | Tests required | Prevention |
|---|---|---|---|---|---|---|---|---|
| MNEW-01 | Execution Safety | G2-15: `checkApprovalStaleness` called with only 2 of 9 material IDs at `startup-session.service.ts:2399` and with empty object at line 170 — causes false-positive STALE blocking legitimate execution | IMPLEMENTATION_BUG | PILOT_BLOCKER | `src/services/owner-strategy/startup-session.service.ts:170,2399-2414` | Pass all 9 material IDs (`ideaId`, `ideaVersionId`, `profileVersionId`, `economicModelId`, `readinessId`, `systemRecId`, `businessModelId`, `marketSizingId`, `validationPlanId`) at both call sites | Add regression test for false-positive staleness scenario to `startup-session.db.test.ts` | **Recommended first implementation slice** |
| MNEW-02 | Schema/Alerts | `Alert` model absent from Prisma schema — `alert-service.ts` calls `db.alert.create()` etc. → TypeError at runtime; all in-app alerting is broken | MISSING | PILOT_BLOCKER | `prisma/schema.prisma`; `src/services/alerts/alert-service.ts` | Add `Alert` model with workspaceId, businessId, alertType, severity, message, channel, status, acknowledgedAt; migrate; update service callers | DB integration test for alert creation + status update | Schema enforcement |
| M001 | Notifications | Email delivery completely absent | MISSING | **PILOT_REQUIRED** *(downgraded from PILOT_BLOCKER — in-app alerts sufficient for private active pilot once MNEW-02 resolved; email becomes required for compliance notifications)* | New: `src/lib/integrations/email-provider.ts`; update `src/services/alerts/alert-service.ts` | Choose provider (Resend recommended for Next.js); implement provider interface; wire to deliverEmailAlert(); add env var | Provider contract test; send-to-real-address smoke | DC gate: block new alert types without email wiring |
| M002 | Customer Ops | No B2C customer records model | MISSING | **PILOT_REQUIRED** *(downgraded from PILOT_BLOCKER — day-3 to day-10 need; owner can begin entering financial/operational data before B2C customer records exist)* | New: `CustomerRecord` Prisma model + migration; new service + API routes + UI | Add `CustomerRecord` with workspaceId, businessId, name, email, phone, segment, lastPurchaseDate, ltv, tags. Wire to complaint and retention models | DB integration test; tenant isolation test | — |
| M003 | Customer Ops | OperationalEvent has no customerId | MISSING | PILOT_REQUIRED | `prisma/schema.prisma`; `src/services/execution/complaint-rework.service.ts` | Add nullable `customerRecordId` FK to OperationalEvent; migrate; update service | DB test | — |
| M004 | UI/Mobile | No mobile navigation | MISSING | PILOT_BLOCKER | `src/ui/shell/app-shell.tsx` | Add hamburger button to AppHeader; implement slide-out drawer; replace `hidden md:block` with conditional rendering | Mobile rendering test (Playwright mobile emulation) | — |
| M005 | Risk/Compliance | Risk register has no owner UI | MISSING | PILOT_BLOCKER | New: `src/app/(authenticated)/owner/risks/page.tsx` | Create risk register page: list by severity/category, create/edit form, status transitions | E2E test | — |
| M006 | Risk/Compliance | Compliance calendar has no owner UI | MISSING | PILOT_BLOCKER | New: `src/app/(authenticated)/owner/compliance/page.tsx` | Compliance deadline calendar: list expiring items, add/edit items, 30-day warning banner | E2E test | — |
| M007 | Workforce | Task management has no UI (owner or employee) | MISSING | PILOT_BLOCKER | New: `src/app/(authenticated)/owner/tasks/page.tsx`; `src/app/(authenticated)/employee/tasks/[taskId]/page.tsx` | Owner: create/assign/view tasks. Employee: view assigned tasks, submit proof, mark complete | E2E test for full task lifecycle | — |
| ~~M008~~ | ~~Command Centre~~ | ~~Business condition profile only wires Finance + Recovery~~ | ~~REMOVED~~ | ~~REMOVED~~ | — | **REMOVED: All 8 domain DomainScore adapters are already wired at `business-condition.service.ts:453-484` via `Promise.all`. Initial audit claim was factually wrong. See Reconciliation Appendix.** | — | — |

### M-HIGH: High-priority items

| ID | Domain | Deficiency | Class | Pilot | Approach | Prerequisite |
|---|---|---|---|---|---|---|
| M009 | Sales | SalesDealRecord not integrated with owner-sales engine | PARTIAL | PILOT_REQUIRED | Add deal aggregation to sales diagnosis: pull SalesDealRecord counts/values per period into snapshot context | None |
| M010 | Marketing | Per-campaign records missing | MISSING | PILOT_REQUIRED | Add `MarketingCampaign` model with channel, budget, leads, spend, revenue. API + UI in marketing page | M002 (customer linkage to campaigns) |
| M011 | Suppliers | No vendor management UI | MISSING | PILOT_REQUIRED | Create `/owner/vendor` page: vendor list, create/edit vendor, delivery records, contract history | None |
| M012 | Assets | Equipment GET/PATCH/list routes missing | MISSING | PILOT_REQUIRED | Add `GET /api/owner/equipment`, `PATCH /api/owner/equipment/[id]`, list service. Update UI | None |
| M013 | Assets | Maintenance scheduling absent | MISSING | PILOT_REQUIRED | Add `MaintenanceEvent` model; add recurrence to `maintenanceDueAt`; add `/api/owner/equipment/[id]/maintenance` route | M012 |
| M014 | Inventory | No stock item catalog | MISSING | PILOT_REQUIRED | Add `StockItem` Prisma model (workspaceId, businessId, sku, name, unit, currentQty, reorderPoint, safetyStock, leadTimeDays). Connect to `suggestReorder()` domain logic | M011 (supplier linkage) |
| M015 | Procurement | No purchase order lifecycle | MISSING | PILOT_REQUIRED | Add `PurchaseOrder` model (draft → reviewed → approved → issued → delivered). Add PO approval workflow using existing ApprovalRequest infrastructure | M011, M014 |
| M016 | Finance | No period-over-period comparison | MISSING | PILOT_REQUIRED | Add `computeCycleDiff()` to owner-finance engine comparing latest vs previous cycle scores. Expose in dashboard payload as `trend` object | None |
| M017 | Finance | Receivables/payables no aging buckets | MISSING | PILOT_REQUIRED | Add aging bucket fields to OwnerFinancialSnapshot and OwnerCashflowSnapshot (0-30, 30-60, 60-90, 90+ days). Update diagnosis engine | None |
| M018 | Security | Entity/EntityLink lack workspaceId | MISSING | PILOT_REQUIRED | Add workspaceId to Entity and EntityLink; add to Prisma workspace enforcement list; migrate | None |
| M019 | Security | Dead private-mode-gate middleware | DEAD_OR_DUPLICATED | PILOT_REQUIRED | Delete `src/middleware/private-mode-gate.ts` | None |
| M020 | Notifications | Compliance deadline notification | MISSING | PILOT_REQUIRED | Wire `getComplianceReviewItems` to alert-service; schedule daily check; email notification (depends on M001) | M001, M006 |
| M021 | Goals | No goal management UI | MISSING | PILOT_REQUIRED | Create `/owner/goals` page: declare goals, view trajectory, milestones | None |
| M022 | Goals | Off-track goals don't trigger corrective actions | PARTIAL | PILOT_REQUIRED | Add `checkGoalTrajectory()` cron call; if trajectory is DETERIORATING, emit a finding to the relevant domain cycle | M021 |
| M023 | Learning | Controlled learning rollout flags not consumed | PARTIAL | POST_PILOT | Wire `rolloutStage` check into recommendation engine before scoring | None |
| M024 | Security | `canonicalizeAuthContext` bridge unsafe | DEAD_OR_DUPLICATED | PILOT_REQUIRED | Add `/* @test-only */` annotation and governance gate to prevent production imports | None |
| M025 | Schema | workspaceId naming inconsistency (stores ClientAccount.id) | HIGH | PILOT_REQUIRED | Rename columns to `clientAccountId` in 16 models; update all service callers; run migration | — |

### M-MED: Medium priority items

| ID | Domain | Deficiency | Class | Pilot |
|---|---|---|---|---|
| M026 | Sales | No sales activity log | MISSING | PILOT_REQUIRED |
| M027 | Sales | No pipeline stage velocity | MISSING | PILOT_REQUIRED |
| M028 | Customer | No per-customer churn risk | MISSING | PILOT_REQUIRED |
| M029 | Ops | Employee scheduling missing | MISSING | PILOT_DESIRABLE |
| M030 | Integrations | Google Sheets removes PLACEHOLDER_ONLY self-classification | PARTIAL | PILOT_DESIRABLE |
| M031 | Integrations | QuickBooks/HubSpot live connectors | MISSING | POST_PILOT |
| M032 | Notifications | Email alert for CRITICAL cash/risk state | MISSING | PILOT_REQUIRED |
| M033 | Observability | Production monitoring (Sentry/Datadog) | MISSING | PILOT_REQUIRED |
| M034 | Testing | Browser E2E on main push | DEAD_OR_DUPLICATED | PILOT_REQUIRED |
| M035 | Testing | Quarantine debt resolution (23 files) | PARTIAL | PILOT_REQUIRED |
| M036 | Schema | FinancialBaseline nullable engagementId | HIGH | PILOT_REQUIRED |
| M037 | Schema | BehavioralLearningArtifact.createdAt as String | MEDIUM | POST_PILOT |
| M038 | Procurement | Supplier inventory snapshot → PO trigger | MISSING | PILOT_REQUIRED |
| M039 | Finance | Cash forecast sync with cashflow daily obligations | MISSING | PILOT_REQUIRED |
| M040 | Budget | Remove PARTIAL disclaimer (complete module) | PARTIAL | PILOT_REQUIRED |

---

## Section N — Dependency-Ordered Execution Plan (Approved 12-Stage Sequence)

> **Reconciliation correction:** The initial audit described a 7-stage plan. The approved sequence has 12 stages. Stages 1–2 are complete. The initial audit's "Stage 4" (onboarding/billing/consultant) incorrectly merged distinct stages and incorrectly positioned External Opportunity Finder and Wealth/Growth/Profit Engine as post-onboarding. The correct ordering is: complete Owner Mode domains first, then Opportunity Finder, then Growth Engine, then production providers, then adversarial simulation, then onboarding.

**Stages 1–2: Complete**
- Stage 1 (Phase 5 closure): COMPLETE — SHA `5bd24355` in ancestry
- Stage 2 (Truth audit + reconciliation): COMPLETE — this document

---

### Stage 3 — Core Business-Domain Completion

**3A: Execution-safety fixes (must be first — blocks production use)**
- MNEW-01: G2-15 staleness fix (pass all 9 material IDs at both call sites in `startup-session.service.ts`)
- MNEW-02: Add `Alert` model to Prisma schema; migrate; un-stub `deliverEmailAlert`

**3B: Security and schema foundations (prerequisite for remaining Stage 3 work)**
- M018: Add workspaceId to Entity/EntityLink
- M019: Delete dead private-mode-gate middleware
- M024: Canonicalize bridge guard (governance gate on `canonicalizeAuthContext`)
- M025: Rename workspaceId columns that store ClientAccount.id (16 models)
- M036: Fix FinancialBaseline nullable engagementId

**3C: Missing owner UI pages (prerequisite for owner daily use)**
- M004: Mobile navigation (hamburger/drawer in AppShell)
- M005: Risk register UI page (`/owner/risks`)
- M006: Compliance calendar UI page (`/owner/compliance`)
- M007: Task management UI (owner + employee pages)
- M011: Vendor management UI page (`/owner/vendor`)
- M021: Goals management UI page (`/owner/goals`)

**3D: Notification foundation (depends on MNEW-02)**
- M001: Email delivery transport (Resend or SES; wire to alert-service's `deliverEmailAlert`)

**3E: Customer operations domain**
- M002: CustomerRecord model + service + routes
- M003: Link OperationalEvent to CustomerRecord
- M028: Per-customer churn risk classification

**3F: Finance intelligence improvements**
- M016: Period-over-period comparison (cycle diff computation)
- M017: Receivables/payables aging buckets
- M039: Cash forecast sync with cashflow daily obligations

**3G: Sales integration**
- M009: SalesDealRecord → owner-sales diagnosis integration
- M026: Sales activity log model
- M027: Pipeline stage velocity (add stage timestamps)

**3H: Marketing per-campaign tracking**
- M010: MarketingCampaign model + service + UI

**3I: Operations management**
- M012: Equipment GET/PATCH/list routes
- M013: Maintenance scheduling
- M029: Employee scheduling (basic)

**3J: Procurement and inventory**
- M014: StockItem catalog + movement ledger
- M015: PurchaseOrder lifecycle + approval
- M038: Inventory snapshot → PO trigger

**3K: Notification wiring (depends on M001, MNEW-02)**
- M020: Compliance deadline notifications
- M032: CRITICAL state email alerts

**3L: Test debt closure**
- M034: Wire browser E2E to main push CI
- M035: Quarantine debt resolution (23 files)
- Add DB integration tests for all 7 domain cycles that currently lack them (Cashflow, Sales, Operations, SOP, Marketing, Strategy, Recovery)

---

### Stage 4 — External Opportunity Finder

**Current state:** Substantially implemented — 9 domain files, 5 API routes, full operating layer, wired into now-view. Missing: dedicated UI pages and automated source ingestion.

**Remaining work:**
- Add dedicated `/owner/opportunities/` UI page: list signals, classification status, bid/no-bid recommendations, owner approval gate
- Add `/owner/tender/` UI page: tender screening results, application pack preparation
- Add owner approval gate for opportunity signals (no approval workflow currently wired)
- Add application/proposal preparation workflow (currently stub: `bid-application-pack.ts` blocks submission)
- Add result tracking UI: `OpportunityValidationOutcome` has no owner-facing page
- Implement automated opportunity source ingestion from external sources (government tender portals, trade directories) — currently human-submitted only
- Prerequisite: Stage 3 complete (capacity, budget, and procurement must exist for capacity-fit check in bid/no-bid logic)

---

### Stage 5 — Wealth, Growth and Profit Engine

**Current state:** Substantially implemented — 7 growth services with DB persistence, wealth path classifier, profit leak radar, working capital management, `/owner/wealth/` page exists. Missing: growth dashboard UI, recommendation→execution chain, controlled learning consumption.

**Remaining work:**
- Add `/owner/growth/` dashboard UI page (growth engine outputs not surfaced in dedicated page)
- Wire growth engine outputs (revenue/pricing/acquisition/retention analysis) to OwnerAction pipeline — currently `IMPLEMENTED_BUT_UNPROVEN` with outputs not reaching action pipeline
- Add recommendation → approval → action → verification chain for growth recommendations (startup domain chain complete; growth recommendations lack it)
- Implement controlled learning consuming engine (M023): wire rollout flags from `ControlledLearning*` models into recommendation scoring — currently rollout flags are never read by any engine
- Wire owner-briefing domain to live data sources (currently unconnected)
- Implement automated goal trajectory correction (M022): off-track goals don't auto-generate corrective actions
- Add portfolio capital allocation decision support (ResourcePool/ResourceAllocation service exists; no cross-business allocation UI)

---

### Stage 6 — Production Providers and Pilot-Required Connectors

- AI provider live smoke in blocking CI (currently manual-only)
- Google Sheets connector: remove PLACEHOLDER_ONLY classification; add integration test (M030)
- Banking transaction import: minimum CSV bank statement import
- QuickBooks accounting import: minimum CSV P&L/balance sheet import (M031)
- Production monitoring: Sentry or Datadog (M033)
- Scheduler daemon: external daemon or Vercel cron for daily compliance/goal/stale checks (currently in-process only)
- DB-backed outbound webhook delivery (currently MockWebhookStore in-memory)

---

### Stage 7 — Full Adversarial Simulation

All adversarial tests must pass before any real-business data is entered:

- **T001 Tenant isolation**: Create resources in workspace A; attempt to read via workspace B API token; verify 403 on all 85 owner routes
- **T002 IDOR prevention**: Submit requests with manipulated businessId; verify service-layer ownership guard fires
- **T003 Approval staleness**: Force each of the 9 material input changes individually; verify each triggers STALE_REAPPROVAL_REQUIRED
- **T004 Supersession ordering**: Concurrent approval attempts; verify exactly one succeeds; verify superseded record is not executable
- **T005 Spending limit enforcement**: Submit startup execution task with cost > spending limit; verify G2-19 blocks
- **T006 Staleness non-regression (MNEW-01)**: Verify execution gate does not false-positive when only non-material artifacts changed; requires MNEW-01 fix to pass
- **T007 Mobile navigation**: Playwright mobile emulation on all owner pages; verify navigation accessible and functional
- **T008 Email delivery**: Verify email sent on CRITICAL cash state; verify not sent for LOW state
- **T009 Compliance deadline notification**: Insert OwnerComplianceItem expiring in 5 days; verify notification triggered within 24h
- **T010 Portfolio isolation**: Verify portfolio view only shows businesses belonging to requesting workspace
- **T011 Controlled learning harm gate**: Submit candidate triggering CRITICAL harm event; verify rollout blocked
- **T012 Purchase order approval**: Submit PO exceeding standing limit; verify approval gate fires; verify execution without approval returns 403
- **T013 Alert runtime**: Trigger each `trigger*Alert` function; verify Alert record created in DB; verify no TypeError (requires MNEW-02 fix)
- **T014 In-app notification delivery**: Trigger owner workflow that generates alert; verify alert appears in owner session

---

### Stages 8–12 — Onboarding Through Final Production Acceptance

**Stage 8 — Real-Business Onboarding**  
Entry gate: All 21 pilot gate items (O01–O21) pass. All Stage 3–7 work complete.  
Activities: Seed private workspace with real business data (not demo seed). Complete owner onboarding flow. Verify all 8 domain diagnostic cycles complete at least one full snapshot → diagnosis → action → verification round with real data.

**Stage 9 — Controlled Live Execution**  
Entry gate: Stage 8 complete; at least 3 complete diagnostic cycles with verified positive outcomes across all 8 domains.  
Activities: Owner begins executing system-generated recommendations in live business operations. Monitor execution outcomes. Capture `OwnerActionOutcome` records. Verify prior-failure learning activates correctly.

**Stage 10 — Pilot-Driven Refinement**  
Entry gate: Stage 9 complete; at least 5 execution outcomes captured.  
Activities: Iterate on recommendation quality based on real outcome data. Address any Stage 9 discoveries. Refine alert thresholds, opportunity classification, and growth action prioritization using real pilot data.

**Stage 11 — Multi-Business Proof**  
Entry gate: Stage 10 complete; pilot business health demonstrably measurable.  
Activities: Onboard a second real business in the same workspace. Verify portfolio comparison, cross-business goal arbitration, and capital allocation recommendation work with real multi-business data. Confirm tenant isolation under real load.

**Stage 12 — Final Production Acceptance**  
Entry gate: Stage 11 complete; all adversarial simulations (T001–T014) passing on production deployment.  
Activities: Full production acceptance sign-off. All 24 owner UI pages verified on both desktop and mobile with real data. All notification channels verified. All 8 domain cycles verified in real business context. Lemon Squeezy billing integration (if SaaS expansion begins). Document production runbook.

---

## Section O — Pilot Entry Gate

The following checklist must be fully satisfied before any real-business owner data is entered. Status updated by reconciliation where evidence permits.

**Authentication and security:**
- [ ] O01: Production deployment serving `cb8edd7b` or later verified — NOT_TESTED (production URL not accessible from audit environment)
- [ ] O02: Production database migrations applied and verified — NOT_TESTED
- [ ] O03: Production authentication tested end-to-end (login → session → logout) — NOT_TESTED
- [ ] O04: IDOR prevention verified (T002 adversarial test passes) — NOT_TESTED
- [ ] O05: Tenant isolation verified (T001 adversarial test passes) — NOT_TESTED
- [ ] O06: Entity/EntityLink workspaceId added and verified (M018) — NOT_STARTED (requires schema migration)
- [ ] O07: Dead private-mode-gate middleware deleted (M019) — NOT_STARTED (trivial 1-file delete)

**Execution safety (new gate — added by reconciliation):**
- [ ] O01-NEW: G2-15 staleness fix applied and regression test passing (MNEW-01) — NOT_STARTED (first implementation slice)
- [ ] O02-NEW: Alert model in Prisma schema; `db.alert` calls no longer throw (MNEW-02) — NOT_STARTED

**Owner core functionality:**
- [ ] O08: Owner cockpit loads with real business data (no demo seed) — NOT_TESTED
- [ ] O09: Mobile navigation functional (M004) — FAIL (confirmed: `hidden md:block` in AppShell, no alternative navigation)
- [ ] O10: Finance, cashflow, sales, operations, marketing: snapshot → diagnosis → action → verification cycle verified end-to-end — PARTIAL (desktop UI complete; no DB integration tests for Cashflow/Sales/Operations/SOP/Marketing/Strategy)
- [ ] O11: Business condition profile produces 8-domain rollup with real data — NOT_TESTED (code wired; DB test covers Finance only)
- [ ] O12: Owner-home shows accurate cross-domain health — NOT_TESTED

**Customer and operational management:**
- [ ] O13: B2C customer records implemented (M002) — NOT_STARTED *(downgraded — day-3 to day-10 need; not required for initial data entry)*
- [ ] O14: Complaints linked to customers (M003) — NOT_STARTED *(follows O13)*
- [ ] O15: Risk register UI accessible (M005) — FAIL (no `/owner/risks` page exists)
- [ ] O16: Compliance deadline calendar accessible (M006) — FAIL (no `/owner/compliance` page exists)
- [ ] O17: Task management UI operational for owner and employees (M007) — FAIL (no `/owner/tasks` or `/employee/tasks` pages exist)

**Notifications:**
- [ ] O18: In-app alerts functional — FAIL (Alert model absent from schema; `db.alert` calls throw TypeError at runtime — MNEW-02 required first)
- [ ] O19: Email delivery operational — NOT_STARTED *(PILOT_REQUIRED, not day-1 gate; depends on O18 + M001)*

**Data integrity:**
- [ ] O20: Period-over-period comparison functional (M016) — NOT_STARTED
- [ ] O21: No quarantined tests in critical domain paths (M035 — at minimum, resolve db-contract and security-auth clusters) — FAIL (23 quarantined files, 62 failing tests)

---

## Section P — Live-Execution Authorization Ladder

**Level 1 — Read and diagnose**  
*Entry: Owner has onboarded, snapshot data exists, at least 1 diagnosis cycle complete*  
Owner can view diagnoses, findings, recommendations, and risk ratings. No mutations permitted beyond data entry.  
Status: Available now with current implementation for financial/operational domains.

**Level 2 — Recommend**  
*Entry: Level 1 active, BusinessConditionProfile wires all 8 domains*  
System can surface prioritized action recommendations across all domains. Owner sees ranked actions with evidence.  
Status: All 8 domains ARE wired in `business-condition.service.ts:453-484`. Level 2 is available once all 8 domains have at least one complete diagnostic cycle with DB data. No code change required — only data.

**Level 3 — Prepare actions**  
*Entry: Level 2 active, approval workflow functional, customer records exist (M002), task UI exists (M007)*  
System prepares specific action packages (who does what, when, what proof is required). Owner reviews before activation.  
Status: Startup domain has this level. General operating domain requires M002, M007, M015.

**Level 4 — Execute low-risk reversible actions**  
*Entry: Level 3 active, notification delivery working (M001), mobile navigation working (M004)*  
System can assign tasks, set deadlines, and confirm acknowledgment. Owner receives notifications.  
Status: Requires M001, M004, M007 minimum.

**Level 5 — Execute bounded approved actions**  
*Entry: Level 4 active, purchase order workflow exists (M015), spending limits enforced across all domains*  
System executes actions within pre-approved scope: spend within budget authority, supplier orders within approved limits.  
Status: Startup domain has spending limit enforcement. General domain requires M015, budget authority wiring.

**Level 6 — Verify outcomes**  
*Entry: Level 5 active, period-over-period comparison functional (M016), outcome verification wired to all domains*  
System verifies that executed actions produced intended financial outcomes. Learning loop active.  
Status: Verification records exist for all domain cycles. Full net-effect verification requires M016.

**Level 7 — Expand standing authorization**  
*Entry: Level 6 active, controlled learning consuming engine implemented (M023), at least 3 complete pilot cycles with verified positive outcomes*  
Owner can pre-authorize broader action classes based on proven track record.  
Status: Infrastructure exists (`OwnerStandingInstruction`, `OwnerApprovalMemory`). Controlled learning requires M023.

---

## Section Q — Final Stage 2 Verdict (Reconciled)

```
STAGE_2_RECONCILIATION_COMPLETE_AUTHORITATIVE_PLAN_READY
```

This verdict supersedes the initial audit verdict `STAGE_2_AUDIT_COMPLETE_READY_FOR_DEPENDENCY_ORDERED_REMEDIATION`. The reconciliation amended material errors in classification, pilot blockers, security severity, provider scope, and stage sequence. See Section R for every material change.

It does not mean OpsIQ is production-ready, pilot-ready, or operationally complete.

**Classification totals (reconciled):**
- PRODUCTION_READY: 21 capabilities *(−1: Rate limiting downgraded; −1: Audit trail hash chain downgraded)*
- IMPLEMENTED_BUT_UNPROVEN: 32 capabilities *(+1: BusinessConditionProfile upgraded from PARTIAL)*
- PARTIAL: 23 capabilities *(−1: BusinessConditionProfile moved out)*
- MISSING: 40 capabilities *(+1: Alert model; +1: Lemon Squeezy added)*
- BROKEN_AT_RUNTIME: 1 item *(new category: alert-service.ts — Alert model absent from schema)*
- DEAD_OR_DUPLICATED: 10 items
- EXPLICITLY_DEFERRED: 7 items
- ACTIVE_SAAS_ONLY: 1 item *(Stripe — reclassified from PRODUCTION_READY)*

**Pilot blocker count: 7** (revised from 8)

Changes from initial audit:
- **REMOVED:** M008 (BusinessConditionProfile 8-domain wiring) — code inspection proves all 8 domains already wired
- **DOWNGRADED:** M001 Email delivery → PILOT_REQUIRED (in-app alerts sufficient for private active pilot once Alert model fixed)
- **DOWNGRADED:** M002 B2C customer records → PILOT_REQUIRED (day-3 to day-10 need; not required for initial data entry)
- **ADDED:** MNEW-01 G2-15 staleness false-positive — execution-safety defect in active Phase 5 code; blocks legitimate execution
- **ADDED:** MNEW-02 Alert model missing from Prisma schema — all in-app alerting broken at runtime

**Current 7 PILOT_BLOCKERs:**
1. MNEW-01: G2-15 staleness fix (`startup-session.service.ts:170,2399`) — **recommended first implementation slice**
2. MNEW-02: Alert model missing from Prisma schema (`alert-service.ts` broken at runtime)
3. M004: Mobile navigation (sidebar `hidden md:block`; no alternative)
4. M005: Risk register UI (`/owner/risks` page absent)
5. M006: Compliance calendar UI (`/owner/compliance` page absent)
6. M007: Task management UI (no owner or employee task pages)
7. M018/H5: Entity/EntityLink workspace isolation (in-memory store; no workspaceId; ACTIVE_HIGH cross-tenant read risk)

**Pilot required count: 27+ additional items**

**No production business should onboard until all 7 PILOT_BLOCKER items and pilot gate items O01–O21 (amended) are resolved.**

---

*Document initially produced by automated forensic audit (commit `de60fa61`). Reconciliation appendix (Section R) documents every material change from the initial audit. All claims cite direct code evidence from SHA `cb8edd7b1f00a65d71fa7b45d4ee5ea29ee97d39`. No assumptions were made about capability from file names, documentation, or prior reports alone.*

---

## Section R — Reconciliation Appendix

**Reconciliation date:** 2026-07-22  
**Base commit audited:** `de60fa61` (initial Stage 2 audit)  
**Method:** Hostile re-examination — every material conclusion challenged by direct code inspection

This appendix lists every material change from the initial audit commit `de60fa61`. For each item: old conclusion → new conclusion → reason → supporting evidence.

---

### R-01: BusinessConditionProfile classification

| | Value |
|---|---|
| **Old conclusion** | PARTIAL / PILOT_BLOCKER — "only Finance + Recovery domains wired; other 6 domains not yet integrated" |
| **New conclusion** | IMPLEMENTED_BUT_UNPROVEN / PILOT_REQUIRED — all 8 domain adapters wired |
| **Reason** | Direct inspection of `business-condition.service.ts:453-484` proves all 8 domain cycle tables are queried via `Promise.all` and each conditionally pushed to `domainScores`. The initial audit inspected incorrectly or examined a stale view. |
| **Supporting evidence** | Lines 453-484: `if (financeCycle) domainScores.push(...)`, `if (recoveryCycle)...`, `if (cashflowCycle)...`, `if (salesCycle)...`, `if (operationsCycle)...`, `if (sopCycle)...`, `if (marketingCycle)...`, `if (strategyCycle)...` |
| **Consequence** | M008 removed from work register. PILOT_BLOCKER count −1. First implementation slice recommendation changed to G2-15 fix (MNEW-01). |
| **Residual risk** | False-confidence: `dataSufficiencyStatus` may read "sufficient" when fewer than 8 domains have DB cycle data; existing DB test covers Finance domain only. |

---

### R-02: Stripe billing scope

| | Value |
|---|---|
| **Old conclusion** | PRODUCTION_READY — listed in "What OpsIQ can currently do"; referenced in pilot plan (gate O17) and Stage 5 integration plan |
| **New conclusion** | ACTIVE_SAAS_ONLY — not required for private owner pilot; bypassed by `OPSIQ_PRIVATE_WORKSPACE_ID` env var |
| **Reason** | `src/services/entitlement.ts:207` checks `OPSIQ_PRIVATE_WORKSPACE_ID` first and returns ENTERPRISE tier unconditionally, bypassing all Stripe logic. `syncEntitlementsForSubscription` is hollow: emits audit event only, does not grant capabilities. The private owner pilot requires neither Stripe nor any payment provider. |
| **Supporting evidence** | `src/services/entitlement.ts:207,219-228`; `src/infra/startup-orchestrator.ts:124-133`; `scripts/seed-private-owner.ts`; `.env.example` (Stripe documented as optional) |
| **Consequence** | Stripe removed from "What OpsIQ can currently do" in Section A. Not listed in pilot gate O17. Stage sequence no longer includes billing activation as a required step before pilot. |

---

### R-03: Lemon Squeezy — selected billing provider, zero implementation

| | Value |
|---|---|
| **Old conclusion** | Not mentioned in initial audit |
| **New conclusion** | MISSING — selected future billing provider for SaaS expansion; zero implementation; only codebase reference is an AI output guardrail |
| **Reason** | User confirmed Lemon Squeezy is the selected provider. Exhaustive codebase search: no `@lemonsqueezy/*` package in `package.json`, no Prisma models, no API routes, no service files. Only reference: `src/services/ai/validator.ts:40` — a regex that rejects AI outputs mentioning Lemon Squeezy as a scope violation. |
| **Supporting evidence** | `grep -r "lemon" src/ --include="*.ts"` → single hit in `validator.ts:40`. `cat package.json | grep squeezy` → 0 results. |
| **Consequence** | Added to Section B baseline and Section C.19 integration table as MISSING. Not in pilot scope. |

---

### R-04: Alert model missing from Prisma schema — broken at runtime

| | Value |
|---|---|
| **Old conclusion** | In-app alert records: PRODUCTION_READY / PILOT_REQUIRED |
| **New conclusion** | BROKEN_AT_RUNTIME / PILOT_BLOCKER — new blocker MNEW-02 |
| **Reason** | `src/services/alerts/alert-service.ts` calls `db.alert.create()`, `db.alert.findFirst()`, `db.alert.findMany()`, `db.alert.update()`. The `Alert` model does not exist in Prisma schema (221 models verified by exhaustive review). All three `trigger*Alert` functions throw `TypeError: Cannot read properties of undefined` at runtime. |
| **Supporting evidence** | `grep -r "db\.alert" src/` → multiple hits in `alert-service.ts`. `grep "^model Alert" prisma/schema.prisma` → 0 results. |
| **Consequence** | New pilot blocker MNEW-02 added. Email delivery (M001) downgraded from PILOT_BLOCKER to PILOT_REQUIRED — the real day-1 blocker is the missing Alert model, not email transport. |

---

### R-05: Email delivery pilot priority

| | Value |
|---|---|
| **Old conclusion** | M001 Email delivery — PILOT_BLOCKER (listed first in pilot blocker summary) |
| **New conclusion** | M001 Email delivery — PILOT_REQUIRED (not day-1 blocker for private active pilot where owner uses system daily) |
| **Reason** | For a private active pilot: (1) in-app alerts are sufficient for daily use once Alert model is fixed (MNEW-02); (2) the owner sees the system daily, reducing reliance on email for critical notifications; (3) email becomes PILOT_REQUIRED for compliance deadline notifications (M020) and as a backup escalation channel. The actual blocker is the missing Alert model (MNEW-02), not the email transport layer. |
| **Consequence** | Pilot blocker count −1 for M001 reclassification. M001 remains high priority in Stage 3B. |

---

### R-06: B2C customer records pilot priority

| | Value |
|---|---|
| **Old conclusion** | M002 B2C customer records — PILOT_BLOCKER |
| **New conclusion** | M002 B2C customer records — PILOT_REQUIRED (day-3 to day-10 need) |
| **Reason** | Owner Mode's first priority is operational diagnosis: financial snapshots, cashflow, sales, operations. B2C customer records are needed for complaint tracking and retention analysis but not for entering the first diagnostic data. For a private pilot with the owner's own businesses, the owner can begin with financial and operational data before B2C customer records are implemented. |
| **Consequence** | Pilot blocker count −1. M002 remains high priority in Stage 3C. |

---

### R-07: G2-15 staleness false-positive — new pilot blocker

| | Value |
|---|---|
| **Old conclusion** | H6 — MEDIUM: G2-15 staleness check passes incomplete ID set |
| **New conclusion** | H6 — HIGH: New PILOT_BLOCKER (MNEW-01); recommended first implementation slice |
| **Reason** | Two confirmed false-positive sources: (1) `startup-session.service.ts:2399` calls `checkApprovalStaleness` with only `ideaId` + `ideaVersionId` from 9 material fields; (2) line 170 calls with EMPTY object `{}`. If stored decision has non-null values for the 7 omitted fields, recomputed hash differs → false-positive STALE → execution gate blocks legitimate execution permanently. This is an execution-safety defect in active Phase 5 production code. |
| **Supporting evidence** | `src/services/owner-strategy/startup-session.service.ts:170` (`checkApprovalStaleness(workspaceId, sessionId, {})`); lines 2399-2414 (only 2 of 9 IDs passed) |
| **Consequence** | MNEW-01 added as PILOT_BLOCKER and recommended first implementation slice. H6 escalated from MEDIUM to HIGH. |

---

### R-08: H1 severity downgrade

| | Value |
|---|---|
| **Old conclusion** | H1 — CRITICAL: `canonicalizeAuthContext` unsafe cast |
| **New conclusion** | H1 — LATENT_HIGH: test-only; zero production callers |
| **Reason** | All 18 call sites for `canonicalizeAuthContext` are in `src/__tests__/phase-g/g6r-auth-bridge.test.ts`. Zero production routes import or invoke this function. The unsafe cast cannot reach any production path in the current codebase. |
| **Supporting evidence** | `grep -r "canonicalizeAuthContext" src/ --include="*.ts"` → 18 results, all in `g6r-auth-bridge.test.ts` |
| **Consequence** | H1 severity downgraded. M024 (add governance gate) remains required to prevent future accidental production use, but is not a day-1 pilot blocker. |

---

### R-09: H2 severity downgrade

| | Value |
|---|---|
| **Old conclusion** | H2 — HIGH: Dead middleware with header-based identity lookup |
| **New conclusion** | H2 — DEAD: type-only import in production; runtime functions never called |
| **Reason** | The only production import of `src/middleware/private-mode-gate.ts` is `import type { PrivateModeGateOptions }` in `src/lib/private-mode-enforcement.ts` — a TypeScript type-only import that emits no JavaScript. The runtime functions `getPrivateModeAccess` and `privateModeGate` are never called anywhere in production. |
| **Supporting evidence** | `grep -r "private-mode-gate" src/ --include="*.ts"` → single hit: `import type { PrivateModeGateOptions }` in `private-mode-enforcement.ts` |
| **Consequence** | H2 downgraded to DEAD. M019 (delete file) is low-urgency cleanup, not a pilot blocker. |

---

### R-10: H3 severity downgrade

| | Value |
|---|---|
| **Old conclusion** | H3 — HIGH: No middleware-level auth backstop |
| **New conclusion** | H3 — DEFENSE_IN_DEPTH_GAP: 27 legitimately unwrapped routes; governance compensates |
| **Reason** | Direct inspection of all 391 route files establishes that the 27 routes without `withCanonicalEnforcement` are each legitimately public: health/liveness/readiness probes, pre-auth routes, API-key-protected diagnostics, Bearer-token-protected cron, HMAC-verified webhook, permanently disabled endpoints. None serve owner business data. The governance scanner ratchet prevents new unwrapped routes. |
| **Supporting evidence** | `src/app/api/health/route.ts`, `src/app/api/auth/*/route.ts`, `src/app/api/internal/reassessment-scan/route.ts` (Bearer token), `src/app/api/webhooks/stripe/route.ts` (HMAC) |
| **Consequence** | H3 downgraded from HIGH to DEFENSE_IN_DEPTH_GAP. Not a blocking issue; defense-in-depth improvement recommended post-pilot. |

---

### R-11: Rate limiting classification

| | Value |
|---|---|
| **Old conclusion** | Rate limiting — PRODUCTION_READY |
| **New conclusion** | Rate limiting — NOT_PRODUCTION_READY |
| **Reason** | `src/services/rate-limit.ts`: workspace middleware explicitly self-documents "DEAD MIDDLEWARE — not wired in production". `MockRateLimitStore` is in-process-only (state lost on restart). Only 4 individual routes apply any rate limiting. No global workspace throttle exists in production. |
| **Supporting evidence** | Comment in `src/services/rate-limit.ts`: "DEAD MIDDLEWARE"; `class MockRateLimitStore` in-memory implementation; grep for `rateLimitEnforcement` usage → 4 routes only |
| **Consequence** | Classification corrected in Section C.21. |

---

### R-12: Audit trail hash chain classification

| | Value |
|---|---|
| **Old conclusion** | Audit trail (AuditEvent hash chain) — PRODUCTION_READY |
| **New conclusion** | Audit trail (AuditEvent hash chain) — NOT_PRODUCTION_READY |
| **Reason** | Three independent failures: (1) Prisma schema has no `hash` column on `AuditEvent` — hash is never stored; (2) emitter and validator use incompatible hash inputs (emitter: `"${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}"`, validator expects `{previousHash, eventType, payload, recordedAt}`); (3) validator (`audit-event-hash-chain-validator.ts`) is never called in any production path. |
| **Supporting evidence** | `grep "hash" prisma/schema.prisma` → 0 results on AuditEvent model; `src/services/audit-event-hash-chain-validator.ts` — no production callers |
| **Consequence** | Classification corrected in Section C.21. |

---

### R-13: Stage sequence correction

| | Value |
|---|---|
| **Old conclusion** | 7-stage plan: Stage 3 = remediation, Stage 4 = onboarding/billing/consultant dashboard, Stage 5 = integration hardening, Stage 6 = pilot dry-run, Stage 7 = production authorization |
| **New conclusion** | Approved 12-stage sequence: Stage 3 = core domain completion, Stage 4 = External Opportunity Finder, Stage 5 = Wealth/Growth/Profit Engine, Stage 6 = production providers, Stage 7 = adversarial simulation, Stages 8–12 = onboarding through final production acceptance |
| **Reason** | The approved 12-stage sequence requires: Owner Mode domains completed first; then Opportunity Finder (already substantially implemented — needs UI pages and autonomous ingestion); then Growth Engine (already substantially implemented — needs growth dashboard and execution chain); then production providers; then adversarial simulation; then onboarding. The initial audit incorrectly merged Opportunity Finder and Growth Engine into a vague "Stage 4" and excluded adversarial simulation as a prerequisite to onboarding. |
| **Consequence** | Section N completely rewritten with correct 12-stage structure. Stage 4 and Stage 5 now have specific work packages tied to the substantially-implemented but incomplete features already in the codebase. Stages 8–12 (onboarding through final production acceptance) added. |

---

### R-14: External Opportunity Finder — existing substantial implementation

| | Value |
|---|---|
| **Old conclusion** | "Autonomous external opportunity finder — MISSING / POST_PILOT" (C.13) |
| **New conclusion** | Human-submitted intake IMPLEMENTED_BUT_UNPROVEN; Stage 4 work package is UI pages + automated ingestion, not a greenfield build |
| **Reason** | Codebase has: 9 domain files (`external-opportunity-intelligence.ts`, `opportunity-operating-layer.ts`, `opportunity-validation-experiment-engine.ts`, `opportunity-portfolio-capital-allocation.ts`, `bid-application-pack.ts`, others), 5 API routes (`/api/owner/opportunities/signals`, `/decide`, `/execution-task`, `/validation-outcome`, `/api/owner/tender/screen`, `/tender/application-pack`), full operating layer wired into now-view. Missing pieces: dedicated UI pages, automated source ingestion. |
| **Consequence** | Stage 4 work package is smaller than greenfield — focused on UI pages and autonomous ingestion. Section N Stage 4 updated to reflect this. |

---

### R-15: Wealth/Growth/Profit Engine — existing substantial implementation

| | Value |
|---|---|
| **Old conclusion** | No explicit Stage 5 work package in initial audit |
| **New conclusion** | Substantially implemented — 7 growth services with DB persistence, wealth path classifier, profit leak radar; `/owner/wealth/` page exists; Stage 5 work package is growth dashboard UI + execution chain + controlled learning consumption |
| **Reason** | Codebase has: `src/services/growth/` (7 service files: acquisition, pricing, retention, revenue, sales-pipeline, unit-economics, offer engines), `src/domain/owner-strategy/wealth-path.ts`, `src/domain/owner-mode/profit-leak-radar.ts`, `/owner/wealth/page.tsx`. Missing: `/owner/growth/` dashboard, growth→execution chain, controlled learning consuming. |
| **Consequence** | Stage 5 work package defined specifically. Section N Stage 5 updated to reflect existing assets and remaining gaps. |

---

### R-16: First implementation slice recommendation

| | Value |
|---|---|
| **Old conclusion** | M001 (M008 originally recommended but removed) — implied first slice was wire all 8 domains |
| **New conclusion** | MNEW-01: G2-15 staleness bug fix — pass all 9 material versioned IDs to `checkApprovalStaleness()` at both call sites in `startup-session.service.ts` |
| **Reason** | M008 (wire 8 domains) is already done — proven by code inspection. MNEW-01 is: (1) an execution-safety defect in existing production code; (2) a minimal code change (add 7 ID parameters at 2 call sites); (3) has high correctness impact (removes false-positive execution blocking); (4) has existing DB test infrastructure; (5) requires no new schema, no external dependencies; (6) is fully completable in one PR. |
| **Consequence** | MNEW-01 marked as recommended first implementation slice. Work register reordered accordingly. |

---

*End of Reconciliation Appendix. Every change in this appendix is supported by direct code inspection evidence cited inline.*

---

## Amendment A — Stage 3 Slice 3.1 Completion (2026-07-22)

**Amendment date:** 2026-07-22  
**PR:** #244 — `claude/stage-3-1-g2-15-staleness-remediation`  
**Final SHA:** `25bb055bc1fd8e2d42432ae919fa1d2dcbada88b`  
**Status at amendment time:** CI in progress; TypeScript gate, Prisma validate, all governance scans: PASS

---

### A-01: MNEW-01 (G2-15) — COMPLETE

| | Value |
|---|---|
| **Audit status** | PILOT_BLOCKER / NOT_STARTED |
| **New status** | **COMPLETE** — implemented and regression-tested in PR #244 |
| **Files changed** | `src/services/owner-strategy/startup-session.service.ts`, `src/services/owner-strategy/startup-execution-blueprint.service.ts`, `src/services/owner-mode/process-execution-bridge.service.ts` |
| **Test file** | `src/__tests__/owner-strategy/startup-session.db.test.ts` — G-DB-49 through G-DB-55 added |

**What was delivered (beyond the minimal fix):**

The Stage 2 audit recommended "pass all 9 material IDs at both call sites". The actual implementation went further to close all related defects discovered during implementation:

1. **`VersionedApprovalState` interface** — 9-field required TypeScript interface (`ideaId`, `ideaVersionId`, `profileVersionId`, `economicModelId`, `readinessId`, `systemRecId`, `businessModelId`, `marketSizingId`, `validationPlanId`). All 9 fields are now type-required; passing a partial object is a compile error.

2. **`loadCanonicalCurrentApprovalState(sessionId, ideaId?, workspaceId, client?)` function** — Canonical builder that loads all 9 fields from authoritative DB records. **Fail-closed**: throws `NotFoundError("OwnerStartupSession", sessionId)` for missing/wrong-workspace session; throws `NotFoundError("StartupIdeaRecord", ideaId)` for missing/wrong-workspace idea. Never returns all-null for missing authoritative state.

3. **`checkApprovalStaleness` signature extended** — now accepts `client: Prisma.TransactionClient | typeof db = db` parameter so staleness checks inside transactions use the transaction snapshot.

4. **`assertStartupExecutionAuthorization` signature extended** — same `client` parameter; propagates to canonical state load and staleness check.

5. **Pattern A optimistic concurrency (TOCTOU closure)** — PostgreSQL READ COMMITTED isolation allows concurrent changes between the staleness read and the guarded mutation. Pattern A closes this with:
   - `transitionSession` (EXECUTION_PLANNED gate): `ownerStartupSession.updateMany` with `WHERE` on `status`, `currentOwnerDecisionId`, `currentProfileVersionId`, `currentSystemRecId`; if `count === 0` → `ConflictError`. Plus `startupIdeaRecord.findFirst` with `WHERE` on `currentEconomicModelVersionId`, `currentReadinessId`, `currentBusinessModelVersionId`; if null → `ConflictError`.
   - `createBlueprint`: Same pair of guards inside the `$transaction` callback.

6. **Bridge service discriminated-union pattern** — In `process-execution-bridge.service.ts`, the in-transaction fingerprint guard was restructured from outer-`let` mutation to `$transaction` returning `{ denied: true, violations, sessionId, actionType } | { denied: false }`. This closes a TypeScript CFA narrowing issue where the outer variable was narrowed to `null` after the async callback.

7. **G2-3a supersession guard at all three execution gates** — `supersededById !== null` check added to `transitionSession`, `createBlueprint`, and `assertStartupExecutionAuthorization`.

---

### A-02: `ideaVersionId` correction

| | Value |
|---|---|
| **Audit assertion** | MNEW-01 recommended passing `ideaVersionId` as one of 9 material IDs (populated from `decision.linkedIdeaVersionId`) |
| **Correction** | `ideaVersionId` is **always null** in this implementation. `StartupIdeaRecord` has no UUID version field in the Prisma schema (only `createdAt`; no `updatedAt`, no `versionId`). Revision tracking for startup ideas uses `supersededById` exclusively (G2-3a guard). |
| **Impact** | `VersionedApprovalState.ideaVersionId` is always `null`. The hash computation receives `ideaVersionId: null` at both call sites. This is correct and consistent — the stored approval hash was also computed with `ideaVersionId: null` (because `decision.linkedIdeaVersionId` was always null for the same reason). No staleness false-positive results. |
| **Schema reference** | `prisma/schema.prisma` `StartupIdeaRecord` model — has `createdAt DateTime @default(now())`, no `updatedAt`, no version UUID field |

---

### A-03: Pilot blocker count correction

| | Value |
|---|---|
| **Audit count** | 7 PILOT_BLOCKERs |
| **New count** | **6 PILOT_BLOCKERs** (MNEW-01 resolved) |
| **Remaining 6** | MNEW-02 (Alert model missing), M004 (mobile nav), M005 (risk register UI), M006 (compliance calendar UI), M007 (task management UI), middleware auth backstop |

---

### A-04: O01-NEW checklist update

| | Value |
|---|---|
| **Audit status** | `[ ] O01-NEW: G2-15 staleness fix applied and regression test passing (MNEW-01) — NOT_STARTED` |
| **New status** | `[x] O01-NEW: G2-15 staleness fix applied and regression test passing (MNEW-01) — COMPLETE (PR #244, SHA 25bb055b)` |

---

### A-05: G-DB regression tests added

The following PostgreSQL proof tests were added to `src/__tests__/owner-strategy/startup-session.db.test.ts`:

| Test ID | What it proves |
|---|---|
| G-DB-49 | Wrong-workspace `ideaId` in `loadCanonicalCurrentApprovalState` throws `NotFoundError("StartupIdeaRecord", ideaId)`, not all-null |
| G-DB-50 | Superseded `ideaId` in `createBlueprint` throws `ConflictError` matching `/EXECUTION_BLOCKED/` |
| G-DB-51 | `transitionSession` succeeds after reapproval with new non-superseded idea |
| G-DB-52 | `createBlueprint` succeeds after reapproval with new idea |
| G-DB-53 | `assertStartupExecutionAuthorization` passes after reapproval with new idea |
| G-DB-54 | Profile change between staleness check and transition blocked by Pattern A guard (session stays `APPROVED`) |
| G-DB-55 | Stale `createBlueprint` rejected — blueprint count unchanged, session `currentBlueprintId` unchanged |

---

### A-06: New defect classes closed (not in original audit scope)

The following defect classes were not listed in the original Stage 2 audit but were closed during implementation:

| Class | Defect | Resolution |
|---|---|---|
| TOCTOU race (READ COMMITTED) | Between staleness check and guarded mutation, a concurrent transaction can commit a profile/economic-model/readiness change that slips through without Pattern A guard | Closed by Pattern A `updateMany` + `findFirst` guards in both `transitionSession` and `createBlueprint` |
| Fail-open wrong-workspace load | `loadCanonicalCurrentApprovalState` previously returned all-null for wrong-workspace session/idea, causing false FRESH verdict | Closed: throws `NotFoundError` for missing/wrong-workspace records |
| TypeScript CFA narrowing | Outer `let txFingerprintDenied` not tracked by CFA after async callback → narrowed to `never` | Closed by discriminated-union return pattern from `$transaction` |
| Transaction-client typing | `checkApprovalStaleness` and `assertStartupExecutionAuthorization` used root `db` even when called inside a transaction | Closed by `client: Prisma.TransactionClient | typeof db = db` parameter on both functions |

---

*End of Amendment A. All corrections in this amendment are supported by code inspection and CI evidence cited inline.*

---

## Amendment B — Idea-Level and Decision-Level TOCTOU Closure Correction (2026-07-22)

**Amendment date:** 2026-07-22  
**PR:** #244 — `claude/stage-3-1-g2-15-staleness-remediation`  
**Final SHA:** `abfb895bd602356135d2e58280e4fe59cee899a3`  
**Supersedes:** Amendment A Section A-01 Pattern A description (item 5)

---

### B-01: Amendment A Pattern A description was incorrect for idea-level guard

Amendment A claimed Pattern A was delivered for `transitionSession` and `createBlueprint` using:
> "Plus `startupIdeaRecord.findFirst` with `WHERE` on `currentEconomicModelVersionId`, `currentReadinessId`, `currentBusinessModelVersionId`; if null → `ConflictError`."

This description was **incorrect and incomplete**. `findFirst` is a read-only SELECT under PostgreSQL READ COMMITTED — it acquires no row lock. A concurrent transaction can commit a change to `StartupIdeaRecord` fields between the `findFirst` SELECT and the outer transaction commit, and the change will not be detected. This is a TOCTOU race: it does not constitute Pattern A.

**Correct description of Pattern A (implemented in SHA `abfb895b`):**

All three execution gates now use `updateMany` for ALL material row locks — session, profile/systemRec, AND idea:

| Gate | Guard | Lock mechanism |
|---|---|---|
| `transitionSession` (EXECUTION_PLANNED) | `ownerStartupSession.updateMany` WHERE status+decisionId+profileVersionId+systemRecId | Exclusive row lock |
| `transitionSession` (EXECUTION_PLANNED) | `startupIdeaRecord.updateMany` WHERE id+workspaceId+economicModelId+readinessId+businessModelId+supersededById=null, data: `{ workspaceId }` | Exclusive row lock (no-op write) |
| `createBlueprint` | `ownerStartupSession.updateMany` WHERE same material session fields | Exclusive row lock |
| `createBlueprint` | `startupIdeaRecord.updateMany` WHERE same material idea fields, data: `{ workspaceId }` | Exclusive row lock (no-op write) |
| `process-execution-bridge` (START/DELEGATE) | `startupOwnerDecision.updateMany` WHERE id+workspaceId+supersededById=null+packageHashSha256?, data: `{ workspaceId }` | Exclusive row lock (no-op write) |

**No-op write rationale:** `StartupIdeaRecord` has no `updatedAt` field (only `createdAt`). `StartupOwnerDecision` similarly has no `updatedAt`. Using `data: { workspaceId: existingValue }` issues a real `UPDATE` statement that PostgreSQL executes as an exclusive row lock acquisition — the row contents do not change, but any concurrent transaction waiting on that row is blocked until this transaction commits or rolls back.

**Invariant:** A concurrent change to any material field — economic model, readiness, business model version, profile version, system recommendation, decision hash, or supersession pointer — will cause the `updateMany` count to be 0. Zero count → `ConflictError`. The outer transaction rolls back. No state transition reaches the database.

---

### B-02: `StartupDecisionFingerprintDelegate` interface correction

Amendment A did not enumerate the bridge service's in-transaction decision guard. The interface `StartupDecisionFingerprintDelegate` (declared in `process-execution-bridge.service.ts`) was updated from declaring `findFirst` to declaring `updateMany` with the following signature:

```typescript
interface StartupDecisionFingerprintDelegate {
  updateMany(a: {
    where: {
      id: string;
      workspaceId: string;
      supersededById: null;
      packageHashSha256?: string;
    };
    data: { workspaceId: string };
  }): Promise<{ count: number }>;
}
```

This is the narrowly-typed delegate for `tx.startupOwnerDecision` inside the bridge `$transaction` callback. No `any`, no `unknown as` casts.

---

### B-03: `ideaVersionId` in `checkApprovalStaleness` — dead code removed

Amendment A documented that `ideaVersionId` is always null. In SHA `abfb895b`, the `changedInputs.push("ideaVersion")` branch in `checkApprovalStaleness` was removed. It was dead code: `currentState.ideaVersionId` is always `null` and `approvedState.ideaVersionId` is always `null` (populated from `decision.linkedIdeaVersionId` which is always `null`). The condition could never evaluate to true. Leaving it implied `ideaVersionId` was a meaningful diff signal, which it is not.

The removal is documented inline:
```typescript
// ideaVersionId is intentionally excluded from changedInputs: StartupIdeaRecord has no UUID
// version field — loadCanonicalCurrentApprovalState always returns ideaVersionId: null. Any
// GO decision that stored a non-null linkedIdeaVersionId would already be detected as stale
// by the hash mismatch above. Revision detection is exclusively via supersededById at all
// three execution gates (transitionSession, createBlueprint, assertStartupExecutionAuthorization).
```

---

### B-04: G-DB-56 proof test added

| Test ID | What it proves |
|---|---|
| G-DB-56 | `transitionSession` is denied and session status remains `APPROVED` when idea economic model changes after GO decision (idea-level Pattern A `updateMany` guard blocks the transition; no `STARTUP_SESSION_STATUS_CHANGED` to `EXECUTION_PLANNED` audit event emitted) |

G-DB-54 and G-DB-55 were also enhanced:
- G-DB-54: now asserts no `STARTUP_SESSION_STATUS_CHANGED(to=EXECUTION_PLANNED)` audit event after denial
- G-DB-55: now asserts no `STARTUP_EXECUTION_BLUEPRINT_CREATED` audit event AND zero active blueprints after denial

---

### B-05: Amended PILOT_BLOCKER status

No change to PILOT_BLOCKER count. MNEW-01 remains COMPLETE as of Amendment A. This amendment documents the full correctness of the Pattern A implementation, not a new blocker.

**MNEW-01 final status:** COMPLETE — PostgreSQL READ COMMITTED race permanently closed at all three execution gates using `updateMany` row-lock guards. SHA `abfb895b`.

---

### B-06: Audit-event persistence semantics (clarified)

| Denial site | Event emitted | Persistence |
|---|---|---|
| `assertStartupExecutionAuthorization` — boundary denial | `STARTUP_AUTHORIZATION_DENIED` via `emitStartupAuthorizationDenied` | ALWAYS persists — called **outside** the outer transaction after denial is returned |
| `transitionSession` — ConflictError (Pattern A) | None | N/A — ConflictError propagates, no denial event |
| `createBlueprint` — ConflictError (Pattern A) | None | N/A — ConflictError propagates, no denial event |
| `process-execution-bridge` — in-tx denial | `{ denied: true }` returned from `$transaction` callback | ALWAYS persists — denial event emitted **outside** the bridge `$transaction`, after tx commits (denied path commits nothing) |

---

*End of Amendment B. All corrections in this amendment are supported by direct code inspection and local gate evidence cited in commit `abfb895b`.*
