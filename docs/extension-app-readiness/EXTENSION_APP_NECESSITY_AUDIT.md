# OpsIQ Extension App Necessity Audit

Investigation-only report. No production logic, schema, migrations, or UI were modified.
Every claim below is anchored to repo evidence (file paths / models / routes). Where
evidence is insufficient, the text says **NOT PROVEN**.

---

## 1. Executive Verdict

**OpsIQ does not currently need most of the proposed department apps, and it cannot
safely command any of them yet.** The single most important finding is that **the
external department-app connector does not exist**. There is outbound webhook code and
inbound Stripe/CSV ingestion, but there is no authenticated, idempotent, versioned,
bidirectional contract for dispatching instructions to a department app and ingesting
its proof/result/exception/learning callbacks.

Consequently:

- **No extension app should be built now.** The correct first deliverable is the
  **External Department Connector Contract** (Option B), built inside OpsIQ core.
- Of the five proposed apps, **only the Growth & Customer Department App is a genuine
  independent-extension candidate** — because it is the only one whose core value is
  *external execution* (posting campaigns, outbound follow-up, complaints/reviews
  capture) that OpsIQ deliberately does **not** implement today. It is
  `BUILD_INDEPENDENT_EXTENSION_NOW_AFTER_CONNECTOR`, i.e. first *after* the connector.
- **Operations Execution** is already implemented *inside* OpsIQ (guided execution +
  proof FSM + operator queue + escalation are runtime-proven). A full Operations app
  would duplicate the core execution state machine. Only a **thin operator companion**
  is justified.
- **Finance & Resource Control** core (cashflow, budget, spend governance,
  receivables/payables, cost-leakage, margin gates, spend approval) is runtime-proven
  inside OpsIQ. A separate finance app would be **dangerous duplication** of the spend
  governance engine. The real gaps (vendors, inventory, procurement) are orphaned
  models needing internal wiring, not an external app.
- **Workforce & Training** is mostly greenfield or dead code. The pieces that exist
  belong **inside OpsIQ core** (SOP/training/skill-matrix models already live in the
  schema). Build internally, not as an app.
- **Intelligence, Compliance & Automation** must **stay in OpsIQ core** — it is the
  command center's brain. Splitting it out would create a second owner dashboard
  (violating the owner-workload rule) and duplicate the audit/intelligence layer. The
  real gap is the **dead scheduler** (no background runner), which is internal infra
  that the connector also depends on.

---

## 2. Evidence Baseline (Phase 1)

| Item | Value |
|---|---|
| Current branch | `claude/opsiq-extension-audit-j4tgzy` |
| Current HEAD | `c160634e4844e110af46bbbac5c4625f762443f7` |
| HEAD subject | "OpsIQ Known-to-Unknown Corpus: Growth / Profit / Scaling Pack 150 (#71)" |
| Base branch | `main` (recent merges are `#66`–`#71` scenario packs) |
| Working tree | **Clean** (`git status --short` empty at audit start) |
| App shape | **Single Next.js App Router app** (`package.json name: "opsiq"`). No monorepo/`apps/` dir, no existing extension apps. |
| ORM / DB | Prisma 7 + PostgreSQL (`prisma/schema.prisma`, 4500 lines, ~180 models) |
| Validation | Zod 4 |
| Test runner | Vitest; `test:db` gated on `TEST_WITH_DB=true` |
| CI workflows | 70+ under `.github/workflows/` incl. owner-mode, DB-verification, guided-execution proof, finance-cash, daily-operations, staff-proof-anti-gaming |
| Existing extension docs | **None** (no connector/department/extension design doc existed before this report) |

Relevant CI evidence: `owner-e2e.yml`, `owner-pilot-db.yml`, `db-verification.yml`,
`db-blocker-proof.yml`, `finance-cash.yml`, `daily-operations.yml`,
`staff-proof-anti-gaming.yml`, `module-4-operations-runtime-proof.yml`,
`module-7-sop-runtime-proof.yml`.

---

## 3. Current OpsIQ Capability Matrix (Phase 2)

Classification legend is exactly as specified in the audit brief. "Runtime-wired"
means an API route AND/OR UI page invokes the service; service-only files are
downgraded to `PARTIAL_STATIC_ONLY`.

### Core governance spine (directly inspected)

| # | Domain | Classification | Evidence | Extension would duplicate? |
|---|---|---|---|---|
| 1 | Owner Mode command center | COMPLETE_RUNTIME_PROVEN | `src/app/api/owner/command-center/route.ts` → `getBusinessCondition` (cross-domain rollup + single prioritized next action); unified owner UI under `src/app/(authenticated)/owner/*` (17 pages) | Yes — this IS the single owner surface |
| 2 | Guided execution | COMPLETE_RUNTIME_PROVEN | `src/services/routes/guided-execution-handlers.ts` (`ownerGuidedChoiceHandler`, `employeeTaskListHandler`, `employeeTaskGuidanceHandler`, `proofSubmitHandler`, `proofReviewHandler`, `raiseEscalationHandler`); `src/services/execution-core/*` (action-fsm, execution-orchestrator, sequencer, failure-containment) | Yes (Operations app) |
| 3 | Action/task model | COMPLETE_RUNTIME_PROVEN | `Action` model (`schema.prisma:11`), `OperatorItem` (661), `DelegatedTask` (3889), `WorkOrder` (3875); `src/app/api/actions/[actionId]/{start,complete,impact-delta}/route.ts` with optimistic `version` concurrency | Yes (Operations app) |
| 4 | Operator/staff completion path | COMPLETE_RUNTIME_PROVEN | `src/app/api/operator/{queue,my-day,route}.ts`, `src/app/operator/page.tsx`, `src/services/operator/*`, `src/services/execution/task-completion.service.ts` | Yes (Operations app) |
| 5 | Proof/evidence capture | COMPLETE_RUNTIME_PROVEN | `Proof`/`ProofRequirement` models (4107/4122), `src/services/execution/{proof.service,proof-precheck.service}.ts` (duplicate file-hash guard, `duplicateFlagged`), `src/app/api/proof/{submit,review}/route.ts` | Yes (Operations app) |
| 6 | Actual outcome tracking | COMPLETE_RUNTIME_PROVEN | `recordOutcome` called in `actions/[actionId]/complete/route.ts:64`; `OwnerActionOutcome` (3529), `src/services/outcome/*` | Partial (measurement half) |
| 7 | Verification / dispute status | COMPLETE_RUNTIME_PROVEN | Per-domain `Owner*Verification` models + `src/services/execution/verification-engine.ts`; `.../actions/[actionId]/verify/route.ts` across finance/cashflow/sales/operations/sop/marketing/strategy/recovery | Yes (Operations app) |
| 8 | Audit events | COMPLETE_RUNTIME_PROVEN | `AuditEvent` (58) + `CanonicalEvent` (154); `src/infra/audit.ts` (`emitAuditEvent`, `queryAuditEvents`, `verifyAuditChainIntegrity` — hash-chained); `src/app/api/audit/*` | Yes (Intelligence app) |
| 9 | AI ledger / advisory ledger persistence | PARTIAL_RUNTIME_WIRED | `src/services/ai/ledger-persistence.ts`, `AIProposalSandbox` model (38), `AI_LEDGER_PERSISTENCE_REPORT.md`. Full runtime path NOT independently re-verified here. | Partial |
| 10 | Workspace isolation | COMPLETE_RUNTIME_PROVEN | `withCanonicalEnforcement` (`ctx.verifiedWorkspaceId`) on all governed routes; workspace-scoped Prisma queries throughout; `AggregateLock` (1546) | Yes (any app) |
| 11 | Owner approval workflow | COMPLETE_RUNTIME_PROVEN | `src/services/approval/workflow.ts` (`requestApproval`/`approveOutcome`/`rejectOutcome`/`enforceApprovalRequirement`), `ApprovalRequest` (1525) + `OwnerApprovalMemory` (1289) + `OwnerStandingInstruction` (1488); `src/app/api/owner/approvals/{memory,resolve}/route.ts` | Yes (any app) |
| 12 | Risky / needs_owner_approval behavior | COMPLETE_RUNTIME_PROVEN | `src/domain/owner-budget/spend-governance.ts` (`REQUIRE_OWNER_APPROVAL`, `HOLD`, SOD self-approval block); `owner-approval-resolution.service.ts` auto-handles via standing instruction/memory (real workload reduction) | Yes (Finance app) |
| 13 | Daily operations scenarios | COMPLETE_TEST_PROVEN_ONLY | `daily-operations.yml` CI + Daily Operations Pack 300 (commits `#68`), DB-backed proof reports | n/a (test corpus) |
| 14 | Training/domain foundation (AI) | COMPLETE_TEST_PROVEN_ONLY | `src/domain/domain-training/*` — trains the OpsIQ **AI advisor** (`TrainingLevel LEVEL_0..LEVEL_6`), NOT staff | n/a |

### Department-capability inventory (from parallel deep audits)

| # | Domain | Classification | Key evidence |
|---|---|---|---|
| 15 | Staff training / SOP / checklist management | PARTIAL_RUNTIME_WIRED | SOP docs: `OwnerSopDocument` (1464) + `src/services/owner-mode/sop-document.service.ts` + `src/app/api/owner/sop-documents/route.ts` (no UI page). Staff training: `OwnerTrainingRecommendation` (1441) + `staff-training.service.ts` + `POST /api/owner/staff-training` (record/derive wired; `completeTraining` has **no route**). |
| 16 | Finance / budget governance | COMPLETE_RUNTIME_PROVEN | Cashflow/budget/working-capital fully wired (domain+service+routes+UI+models `1990–2126`, `4176–4416`). See §Finance below. |
| 17 | Discount / spend approval | SPLIT: spend = COMPLETE_RUNTIME_PROVEN; discount = PARTIAL_STATIC_ONLY | Spend: `spend-governance.ts` + `recordSpendEntry` gate + `/api/owner/budget/{spend,authority,override}`. Discount: only `risk-rules.ts:363` "Discount leakage" detection, no gate. |
| 18 | Inventory / procurement / vendor / resource control | PARTIAL_STATIC_ONLY | `VendorRecord` (4340) + `vendor.service.ts` = **zero importers, no route/UI**. `OwnerSupplierInventorySnapshot` (4076) + `supplier-inventory-snapshot.service.ts` = **no route/UI**. Procurement = advisory text only, no PO entity. Equipment = POST-only, no read UI. |
| 19 | Marketing / campaign / content / growth | PARTIAL_RUNTIME_WIRED (advisory only) | `src/domain/owner-marketing/*` + `/api/owner/marketing/*` + `/owner/marketing` UI are **diagnostic/advisory**; `campaignsRun`/`contentPosted` are owner-entered inputs. **No campaign execution/publishing/content generation.** `src/services/growth/*` engines are **in-memory Maps** (non-durable). |
| 20 | CRM / lead / customer follow-up | Lead/CRM = COMPLETE_RUNTIME_PROVEN; follow-up = MISSING | `LeadRecord` (635) + `src/services/lead.ts` + `/api/leads` + `/(authenticated)/leads` UI; `ClientAccount`/`ClientContact` + `/clients` UI. Follow-up automation = only advisory metric, no scheduler/reminder. |
| 21 | Complaint / helpdesk / reputation | MISSING | No service/model/route/UI. Grep hits are test fixtures only. |
| 22 | Review management | MISSING | No customer-review/reputation feature; "review" in repo = decision-review / ML-learning-review. |
| 23 | Reporting / KPI / dashboard | PARTIAL_RUNTIME_WIRED | Two disjoint report engines (`src/services/report/engine.ts` shallow; `src/services/report-generator.ts` rich, wired to `engagements/[id]/report`). `generateAndStoreReport`/`getDeliverableReport` non-functional (throws). KPI model + UI exist but fragmented; no unified dashboard. |
| 24 | Compliance / document / expiry | PARTIAL_RUNTIME_WIRED | `OwnerComplianceItem` (1312) + `compliance.service.ts` + `/api/owner/compliance`; `isExpiringSoon`/`isExpired` in `compliance-boundary.ts`. **No document upload/storage, no UI, pull-only (no expiry alerts), no "contract" kind.** |
| 25 | Workflow automation | PARTIAL_STATIC_ONLY | `ScheduledTask` (914) + `src/infra/scheduler.ts` (DatabaseSchedulerProvider) exist but **ZERO runtime callers** of `processDue`/`schedule`. No cron/worker/`setInterval` runner. Everything is request-triggered. |
| 26 | External app connector / API | MISSING (as a department connector) | See §7. Only outbound webhook code + inbound Stripe/CSV import. |
| 27 | External callback ingestion | PARTIAL (billing only) | `POST /api/webhooks/stripe` is a real DB-backed idempotent state machine (`WebhookEvent` 1161, `webhook.service.ts`). No department-app callback endpoints. |
| 28 | External proof/result ingestion | MISSING | `proof/submit` is **human-session** auth (`withCanonicalEnforcement`), not machine/external. No external result/exception ingestion. |
| 29 | External app auth / idempotency / versioning | PARTIAL_STATIC_ONLY | `IdempotencyRecord` (571) infra exists but is not applied to any external connector. **No ApiKey/ServiceAccount/ExternalApp auth model** in schema. No contract versioning. |
| 30 | Owner exception-only interface | COMPLETE_RUNTIME_PROVEN | `OwnerAttentionEvent` (1510), `command-center` single-next-action rollup, standing-instruction/approval-memory auto-handling — the owner is asked only when action is truly required. |

---

## 4. Extension-by-Extension Necessity Analysis (Phase 3)

### 4.1 Growth & Customer Department App — `BUILD_INDEPENDENT_EXTENSION_NOW_AFTER_CONNECTOR`

- **A. Capabilities it would own:** campaign execution, social posting, content, lead
  capture, CRM/pipeline sync, customer follow-up, complaints/helpdesk, reviews/
  reputation, retention/reactivation, campaign ROI attribution.
- **B. Already in OpsIQ:** marketing/sales **diagnosis & advisory** (`owner-marketing`,
  `owner-sales`), lead capture + CRM (durable: `LeadRecord`, `ClientAccount`), campaign
  ROI **measurement** (from owner-entered snapshots).
- **C. Partial:** growth analytics engines (`src/services/growth/*`) exist but are
  **in-memory, non-durable, no UI** — pipeline/retention/offer ROI.
- **D. Missing:** social media, complaints/helpdesk, reviews/reputation, follow-up
  automation, reactivation/win-back, actual campaign *execution/publishing*.
- **E. Dangerous duplication:** none for execution; but lead/CRM data and ROI
  *measurement* must remain OpsIQ-owned (the app should push data in, not fork the CRM).
- **F. Stays in OpsIQ core:** advisory/diagnosis, ROI measurement, lead/CRM system of
  record, approval gates.
- **G. Safe in a background app:** outbound execution — send campaigns, publish
  content, run follow-up sequences, ingest complaints/reviews, run reactivation.
- **H. Owner opens it directly?** No. Instructions/approvals/results flow through OpsIQ.
- **I. API contract needed:** connector (see §7) + growth-specific instruction types
  (`campaign.launch`, `followup.sequence`, `review.request`) and result/proof callbacks.
- **J. Approval gates:** spend/discount approval (reuse `spend-governance`), send-volume
  caps, brand/tone guardrails → `needs_owner_approval`.
- **K. Proof/result feedback:** delivery receipts, engagement metrics, complaint/review
  captures → OpsIQ outcome + audit.
- **L. Tests required first:** connector contract tests + growth instruction/result
  round-trip + idempotent re-delivery + approval-gate enforcement.
- **M. Final classification:** **`BUILD_INDEPENDENT_EXTENSION_NOW_AFTER_CONNECTOR`** —
  the only proposed app whose core value is genuinely external execution OpsIQ lacks.

### 4.2 Operations Execution Department App — `BUILD_THIN_COMPANION_ONLY`

- **A. Capabilities:** task/job/checklist execution, operator work queue, proof of work,
  completion verification, SLA tracking, issue escalation, dispatch/delivery.
- **B. Already in OpsIQ:** essentially all of it — guided execution
  (`guided-execution-handlers.ts`), `DelegatedTask`/`WorkOrder`/`OperatorItem`, proof
  FSM (`proof.service.ts`, `Proof`/`ProofRequirement`, duplicate-hash), verification
  engine, `Escalation` (4148) + `raiseEscalationHandler`, operator queue + `/operator`.
- **C. Partial:** SLA/dispatch specifics are thin (no dedicated SLA timer/dispatch
  model beyond `dueAt`).
- **D. Missing:** dispatch/pickup/delivery logistics (business-specific).
- **E. Dangerous duplication:** a full app would fork the **execution state machine,
  proof engine, and escalation** — the highest-risk duplication in the whole audit.
- **F. Stays in OpsIQ core:** the entire execution/proof/verification/escalation spine.
- **G. Safe in a companion:** a **staff/operator mobile/adapter** that renders the
  OpsIQ work queue and captures proof at the point of work — no business logic.
- **H. Owner opens it directly?** No (owner never operated operations app anyway).
- **I. API contract:** connector task-dispatch + proof-callback only (thin).
- **J. Approval gates:** reuse existing.  **K.** proof/result already modeled.
- **L. Tests:** proof round-trip via connector, offline-capture idempotency.
- **M. Final classification:** **`BUILD_THIN_COMPANION_ONLY`**.

### 4.3 Workforce & Training Department App — `BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`

- **A. Capabilities:** shifts, attendance, workload, performance, incentives, SOPs,
  staff training, skill matrix, certification, payroll inputs.
- **B. Already in OpsIQ:** SOP management (docs + diagnosis, API-wired), staff training
  (evidence-gated, partially wired), skill matrix **model+service** (`OwnerStaffSkill`
  1421) — but **dead code** (no route/UI/caller).
- **C. Partial:** staff workload (`OwnerEmployeeWorkloadSnapshot` 3965) — service+tests
  but **not runtime-reachable**.
- **D. Missing:** shifts/scheduling, attendance, staff performance, incentives/payroll,
  certification (all greenfield; at most AI-advisory string mentions).
- **E. Dangerous duplication:** SOP/training/skill-matrix already live in the schema —
  an external app would fork them.
- **F. Stays in OpsIQ core:** SOP/training/skill-matrix (wire the orphaned models).
- **G. Safe in a companion (later):** a thin staff attendance/shift-clock + training-
  completion capture app — but only after the internal models are wired and a connector
  exists.
- **H. Owner opens it directly?** No.
- **I–L.** Not applicable yet — the prerequisite is internal wiring, not an app.
- **M. Final classification:** **`BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`** (wire the
  existing dead models; revisit a thin attendance companion post-connector).

### 4.4 Finance & Resource Control Department App — `DO_NOT_BUILD_DUPLICATES_OPSIQ_CORE`

- **A. Capabilities:** cash, budgets, margins, purchases, inventory, procurement,
  vendors, receivables/payables, cost leakage, resource usage, financial approval.
- **B. Already in OpsIQ (COMPLETE_RUNTIME_PROVEN):** cashflow, budgets, margins (gate),
  receivables/payables (working-capital ageing), cost leakage, spend-approval controls.
- **C. Partial:** resource usage (equipment POST-only), discount approval (detection
  only).
- **D. Missing:** purchase-order/procurement workflow; **vendors** and **inventory**
  exist as **orphaned models+services** (no route/UI).
- **E. Dangerous duplication:** a separate finance app would fork the **spend-governance
  engine, budget authority, and approval workflow** — governance-critical; unacceptable.
- **F. Stays in OpsIQ core:** all financial governance.
- **G. Safe in a background app:** essentially none — finance governance must be owner-
  controlled and centralized.
- **H. Owner opens it directly?** No — and finance is exactly where a second dashboard
  would be most harmful.
- **I–L.** The remedy is internal wiring (vendors/inventory routes+UI, discount gate),
  not an app.
- **M. Final classification:** **`DO_NOT_BUILD_DUPLICATES_OPSIQ_CORE`** (with internal
  wiring of vendor/inventory/procurement gaps as `BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`).

### 4.5 Intelligence, Compliance & Automation Department App — `BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`

- **A. Capabilities:** reporting, KPI dashboards, anomaly detection, compliance docs,
  license/contract expiry, recurring workflows, automation, audit summaries, cross-app
  intelligence.
- **B. Already in OpsIQ:** audit trail (wired), reporting (partial), KPI (fragmented),
  compliance items + expiry helpers (API only), intelligence engines (single-workspace).
- **C. Partial:** everything here is partial — see matrix rows 23–25, 8.
- **D. Missing:** true business anomaly detection, compliance document storage + expiry
  alerting, an operational scheduler/runner, genuinely cross-domain intelligence.
- **E. Dangerous duplication:** audit + intelligence + reporting are core OpsIQ brain
  functions; an external app would duplicate them **and** create a second owner-facing
  dashboard (direct violation of the owner-workload rule).
- **F. Stays in OpsIQ core:** all of it — this is the command center's analysis layer.
- **G. Safe in a background app:** none as an owner-facing app; the *automation runner*
  is internal infra (also a connector prerequisite).
- **H. Owner opens it directly?** Must not — it is the OpsIQ dashboard itself.
- **M. Final classification:** **`BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`** (priority
  internal gap: activate the dead scheduler as a background runner).

---

## 5. Duplication Risk Audit (Phase 4)

| Parallel system | Files | Risk | Recommendation |
|---|---|---|---|
| **Outbound webhook (3 competing impls)** | `src/services/integration/webhook.ts` (`sendWebhook` = `console.log` **stub**); `src/lib/integrations/webhook.ts` (`emitWebhook` = fetch to single `process.env.WEBHOOK_URL`); `src/services/webhooks.service.ts` (`deliverWebhookEvent` = HMAC+retry but **in-memory `MockWebhookStore`**, no prod caller) | HIGH — three incompatible notions of "webhook"; none is production-grade; `WebhookDelivery` model (1141) is unused by the service | Consolidate into ONE persisted, signed, retried delivery service as part of the connector |
| **Action/execution engines** | `Action` (11) + `OperatorItem` (661) + `DelegatedTask` (3889) + `WorkOrder` (3875); `execution-core/action-fsm.ts` vs operator `store.ts` | MEDIUM — multiple task-like entities | Keep, but an Operations app must NOT add a 5th; dispatch from these |
| **Proof engines** | `src/services/execution/proof.service.ts` (DB `Proof`) vs growth in-memory stores | LOW | Single proof engine is canonical; forbid app-side proof engines |
| **Approval engines** | `src/services/approval/workflow.ts` + `owner-approval-resolution.service.ts` + `spend-governance.ts` | LOW (complementary layers) | Keep centralized; apps must call, not fork |
| **Audit/event systems** | `AuditEvent` (58) + `CanonicalEvent` (154); `src/infra/audit.ts` vs `src/services/audit/*` | LOW | Keep; connector must emit into this, not a parallel log |
| **Budget/finance engines** | `owner-finance` vs `owner-budget` vs `owner-cashflow` | LOW (distinct concerns, share `OwnerFinancialSnapshot`) | Keep; a Finance app would duplicate — do not build |
| **Growth engines (in-memory)** | `src/services/growth/{offer,retention,revenue,sales-pipeline,unit-economics,pricing}.ts` (all `new Map`) | MEDIUM — non-durable shadow of owner-marketing/sales | Decide: promote to DB inside core OR let the Growth app own execution and push results back |
| **Dashboards / owner queues** | unified `command-center` + per-domain dashboards | LOW today | Any new app must NOT add an owner-facing dashboard |
| **Workspace isolation helpers** | `withCanonicalEnforcement` (canonical) | LOW | Reuse; connector must enforce the same scoping |

---

## 6. Owner Workload Risk Audit (Phase 5)

Product rule: **Owner → OpsIQ → Department App → OpsIQ → Owner.** The owner should
normally touch only OpsIQ.

| App | Separate dashboard risk | Separate approvals | Separate alerts | Verdict |
|---|---|---|---|---|
| Growth | LOW if headless (no owner UI); instructions/results via OpsIQ | Reuse OpsIQ approval | Route to `OwnerAttentionEvent` | Acceptable IF headless |
| Operations | Would duplicate operator queue if full app | Reuse | Reuse escalation | Companion only, no owner UI |
| Workforce | N/A (internal) | Reuse | Reuse | Internal |
| Finance | **HIGH** — a finance dashboard is the worst violation | Would fork spend approval | Would fork | **Do not build** |
| Intelligence | **HIGH** — it *is* a second command center | n/a | Would fork alerts | **Do not build as app** |

Current repo structure does **not** violate the rule (single unified owner surface at
`src/app/(authenticated)/owner/*` fed by `command-center`). The risk is entirely
prospective: any extension that ships an owner-facing dashboard, its own approval queue,
or its own alert channel would break the model. **Hard requirement: extension apps ship
admin/debug UIs only; all owner interaction stays in OpsIQ.**

---

## 7. Connector Readiness Audit (Phase 6)

**Verdict: NOT READY. A department-app connector does not exist.**

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | External instruction schema | **MISSING** | No instruction/command contract; `domain/integration/types.ts` is a 4-line `WebhookEvent` |
| 2 | External task/action dispatch | **MISSING** | No dispatch endpoint; internal only |
| 3 | Approval request schema | PARTIAL (internal) | `ApprovalRequest` (1525) is internal, not exposed to external apps |
| 4 | Owner decision callback | **MISSING** | No external callback of owner decisions |
| 5 | External app authentication | **MISSING** | No `ApiKey`/`ServiceAccount`/`ExternalApp` model; routes use human-session `withCanonicalEnforcement` |
| 6 | Workspace/business/location scoping | PARTIAL | Internal scoping is strong (`verifiedWorkspaceId`); no external-principal scoping |
| 7 | Idempotency | PARTIAL | `IdempotencyRecord` (571) exists but not applied to a connector; Stripe path has its own |
| 8 | Retry handling | PARTIAL | `deliverWithRetry` in `webhooks.service.ts` (in-memory, not persisted) |
| 9 | Versioning | **MISSING** | No versioned external contract |
| 10 | Audit trail | PRESENT (internal) | `emitAuditEvent`; connector must emit into it |
| 11 | Proof upload/callback | **MISSING** (external) | `proof/submit` is human-session, not machine |
| 12 | Result callback | **MISSING** | No external result ingestion |
| 13 | Exception callback | PARTIAL (internal) | `Escalation` (4148) internal only |
| 14 | Learning signal callback | **MISSING** (external) | Controlled-learning is internal governance |
| 15 | Failure handling | PARTIAL | Internal `failure-containment.ts`; no external contract |
| 16 | Replay/debug tools | PARTIAL | Stripe dead-letter/replay exists; not generalized |
| 17 | Contract tests | **MISSING** | `src/__tests__/api/webhooks.test.ts` tests the in-memory delivery only; no department-connector contract tests |

**Recommendation: build the External Department Connector Contract inside OpsIQ core
before any extension app.** It must supply items 1, 2, 4, 5, 9, 11, 12, 13, 14, 17 and
consolidate the three webhook implementations (§5) into one persisted, signed, retried,
idempotent delivery service backed by the existing `WebhookDelivery` model + a new
external-principal auth model.

---

## 8. Recommended Extension Decision

| Proposed app | Final classification |
|---|---|
| Growth & Customer | **BUILD_INDEPENDENT_EXTENSION_NOW_AFTER_CONNECTOR** |
| Operations Execution | **BUILD_THIN_COMPANION_ONLY** |
| Workforce & Training | **BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD** |
| Finance & Resource Control | **DO_NOT_BUILD_DUPLICATES_OPSIQ_CORE** |
| Intelligence, Compliance & Automation | **BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD** |

**Should any extension be built now?** No. Build the connector first.

---

## 9. Recommended Build Order (Phase 7)

Derived from evidence, not the assumed order. **Chosen: Option B, then Option C.**

1. **External Department Connector Contract (Option B) — FIRST.**
   - Why now: nothing else is safe without it (§7); it is the single blocker.
   - Prerequisites: external-principal auth model; consolidate webhooks; apply
     `IdempotencyRecord` to inbound; activate a background runner (scheduler is dead).
   - Blocking gaps: items 1,2,4,5,9,11,12,14,17 in §7.
   - Acceptance tests: signed instruction dispatch; idempotent re-delivery; auth
     rejection; proof/result/exception callback round-trip; versioned contract test.
   - Risks: forking audit/approval; leaking cross-workspace data.
   - Must NOT build: any owner-facing app UI; any second approval/audit engine.

2. **Growth & Customer Department App (Option C) — FIRST app, after connector.**
   - Why now (after connector): only app with genuine external-execution value OpsIQ
     lacks (social, complaints, reviews, follow-up, reactivation, campaign execution).
   - Why not earlier: needs the connector + spend/brand approval gates.
   - Prerequisites: connector; decide the fate of in-memory growth engines.
   - Blocking gaps: no execution layer today; growth engines non-durable.
   - Acceptance tests: campaign/follow-up dispatch + result callback; approval-gated
     spend; complaint/review ingestion → OpsIQ outcome + audit.
   - Risks: forking the CRM/lead system of record; owner-facing dashboard creep.
   - Must NOT build: a Growth owner dashboard; a second CRM.

3. **Operations Companion (Option F) — thin, not a full app.** Renders OpsIQ work queue
   + captures proof; no execution logic. Only after connector.

4. **Internal OpsIQ features (not apps):** activate scheduler/runner; wire orphaned
   vendor/inventory/skill-matrix/workload models; discount-approval gate; compliance
   document storage + expiry alerting; unified KPI/report surface. These are Options for
   Workforce (E), Finance (D), and Intelligence (G) reframed as **internal** work.

5. **Intelligence/Compliance/Automation (Option G) — internal, later.** Stays in core;
   the automation runner from step 1 unlocks recurring workflows and expiry alerts.

**Option A ("no apps yet; harden core first") is partially adopted:** the connector and
internal wiring precede every app.

---

## 10. Hard Blockers (before ANY extension app)

1. No external-app authentication model (no `ApiKey`/`ServiceAccount`/`ExternalApp`).
2. No external instruction/command dispatch schema or endpoint.
3. No external proof/result/exception/learning callback ingestion with machine auth.
4. Outbound webhook delivery not production-grade: `sendWebhook` is a `console.log`
   stub; `emitWebhook` targets a single `WEBHOOK_URL`; `deliverWebhookEvent` uses an
   in-memory `MockWebhookStore` with no production caller; `WebhookDelivery` model unused.
5. No versioning on any external contract.
6. No background/scheduled runner — `src/infra/scheduler.ts` `processDue` has **zero
   callers**; autonomous background execution is impossible today.
7. No connector contract tests.
8. Idempotency infra (`IdempotencyRecord`) not applied to any external boundary.

---

## 11. Required Tests Before Implementation

- Connector: signed-instruction dispatch; auth rejection (bad/missing key, wrong
  workspace); idempotent re-delivery (duplicate → single effect); versioned payload
  compatibility; proof/result/exception/learning callback round-trip into audit+outcome.
- Approval enforcement across the connector (`needs_owner_approval`, spend/discount
  gates) — no external app can bypass owner approval.
- Workspace isolation under the external principal (cross-tenant deny).
- Growth app: campaign/follow-up dispatch + result attribution; complaint/review
  ingestion; approval-gated spend.
- Background runner: due-task execution, retry, dead-letter (`ScheduledTask`).
- Regression: consolidating the three webhook impls must not break existing callers in
  `src/app/api/operator/route.ts` and `src/app/api/run/route.ts`.

---

## 12. Exact File / Test Evidence (index)

- Owner command center: `src/app/api/owner/command-center/route.ts`;
  `src/app/(authenticated)/owner/*`.
- Guided execution / proof / escalation: `src/services/routes/guided-execution-handlers.ts`;
  `src/services/execution/{proof.service,proof-precheck.service,verification-engine,task-completion.service}.ts`;
  `src/services/execution-core/{action-fsm,execution-orchestrator}.ts`;
  `src/app/api/proof/{submit,review}/route.ts`; `src/app/api/operator/*`.
- Approval: `src/services/approval/workflow.ts`;
  `src/services/owner-mode/owner-approval-resolution.service.ts`;
  `src/app/api/owner/approvals/{memory,resolve}/route.ts`.
- Spend governance: `src/domain/owner-budget/spend-governance.ts`;
  `src/services/owner-budget/budget.service.ts`.
- Audit: `src/infra/audit.ts`; models `AuditEvent`/`CanonicalEvent` (`prisma/schema.prisma:58,154`).
- Webhooks (connector-relevant): `src/services/integration/webhook.ts`;
  `src/lib/integrations/webhook.ts`; `src/services/webhooks.service.ts`;
  `src/domain/webhooks/webhook-contracts.ts`; `src/app/api/webhooks/{subscribe,[id]/test,stripe}/route.ts`;
  `src/services/webhook.service.ts` (Stripe); `src/__tests__/api/webhooks.test.ts`.
- External import (inbound data, not a connector): `src/domain/external-systems/provider-registry.ts`;
  `src/services/external-systems/*`.
- Scheduler (dead): `src/infra/scheduler.ts`; `ScheduledTask` (`prisma/schema.prisma:914`).
- Orphaned models: `VendorRecord` (4340) + `src/services/owner-budget/vendor.service.ts`;
  `OwnerSupplierInventorySnapshot` (4076) + `src/services/owner-guidance/supplier-inventory-snapshot.service.ts`;
  `OwnerStaffSkill` (1421) + `src/services/owner-mode/staff-training.service.ts`.
- Missing growth execution: `src/services/growth/*` (in-memory `Map`); no complaint/
  review/social/follow-up code.
- Compliance: `OwnerComplianceItem` (1312) + `src/services/owner-mode/compliance.service.ts` +
  `src/domain/owner-mode/compliance-boundary.ts` + `src/app/api/owner/compliance/route.ts`.
- Idempotency: `IdempotencyRecord` (`prisma/schema.prisma:571`).

---

## 13. Open Questions

1. Should the in-memory growth engines (`src/services/growth/*`) be promoted to DB
   inside OpsIQ core, or retired in favor of the Growth app owning execution? (Affects
   duplication boundary.)
2. Is the AI ledger persistence path (`src/services/ai/ledger-persistence.ts`) fully
   runtime-wired? — **NOT PROVEN** in this audit (schema + report exist; full path not
   re-verified).
3. Which background runtime (cron, queue worker, serverless schedule) is acceptable for
   activating the scheduler? No `vercel.json`/cron config exists.
4. Are dispatch/pickup/delivery logistics in scope for Operations, or business-specific?
5. Target external department apps: greenfield builds, or adapters over third-party
   tools (HubSpot/Meta/etc. already in `provider-registry.ts`)?

---

## 14. Final Classification

- **Connector:** NOT READY — build first (Option B).
- **Growth & Customer:** `BUILD_INDEPENDENT_EXTENSION_NOW_AFTER_CONNECTOR` (first app).
- **Operations Execution:** `BUILD_THIN_COMPANION_ONLY`.
- **Workforce & Training:** `BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`.
- **Finance & Resource Control:** `DO_NOT_BUILD_DUPLICATES_OPSIQ_CORE`.
- **Intelligence, Compliance & Automation:** `BUILD_INTERNAL_OPSIQ_FEATURE_INSTEAD`.
- **Build anything now?** Only the connector. No extension app is safe to build yet.

---

## Appendix — Phase 9: Tests

Per the audit brief ("run existing tests only if safe and time permits; prefer
non-invasive verification"), this was a **non-invasive, read-only** audit. The test
suite was **not executed** for these reasons (reported, not faked):

- **DB-gated:** the meaningful proofs require `TEST_WITH_DB=true` + a Postgres instance
  (`test:db`, `test:all`); no database/secrets are provisioned in this audit context, so
  a run would report false negatives, not truth.
- **Scale:** the repo carries thousands of tests across 70+ CI lanes; a full local run
  is out of scope for an investigation-only pass.
- **Evidence used instead:** existing CI lanes (`owner-e2e.yml`, `db-verification.yml`,
  `db-blocker-proof.yml`, `finance-cash.yml`, `daily-operations.yml`,
  `staff-proof-anti-gaming.yml`, `module-4/7-runtime-proof.yml`) and committed DB-proof
  reports substantiate the runtime-proven classifications.

**Tests not run:** `npm run typecheck` (no such script; TS via `next build`/vitest),
`npm test`, `npm run test:db`, `npm run test:e2e` — all deferred (DB/secrets/scope).
No test result is claimed as passing or failing by this report.
</content>
</invoke>
