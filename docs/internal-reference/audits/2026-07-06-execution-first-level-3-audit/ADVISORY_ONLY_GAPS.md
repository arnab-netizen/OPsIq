# PASS 18 — Advisory-Only Gaps (Execution-First Level 3)

Audited main HEAD: `a5c2d929`. These are the surfaces where OpsIQ **stops at advice** (or presents governance/outcome claims it does not fulfil), ranked by severity. Format per gap: module → advisory-only behaviour → why it is not Level 3 enough → required execution conversion → safe execution mode → owner approval needed? → suggested remediation.

The single structural cause behind most HIGH gaps: **the owner-facing "process-intelligence" cockpit engines are read-only and are NOT wired into OpsIQ's real execution substrate** (the domain `Finding→Action→/verify` services, `sop-document.service`, `staff-training.service`, `owner-load.service` standing instructions, and the `OpportunityExecutionTask` FSM). The intelligence is computed and labelled but never persisted as a governed, owner-assigned, evidence-gated task.

---

## CRITICAL

### C1 — SOP/Training effectiveness asserts causation it cannot support
- **Advisory-only behaviour:** Reports `IMPROVED — the correction appears to be working` when a metric moved between two dashboard snapshots. Wiring sets `active/windowElapsed = (prev !== null)` (`owner-now-view.service.ts:1282-1283`) and derives the SOP/TRAINING label from the mere presence of a *proposal* (`:1272-1274`) — not from any approved `OwnerSopDocument` or completed (proof-backed) training.
- **Why not Level 3:** It presents correlation as verified outcome — a fabricated causal claim in a governed product, violating the repo's "no fabricated figures / honest DATA_INSUFFICIENT" rule. The DB sim confirms it flips to IMPROVED with no correction executed in between.
- **Required execution conversion:** Gate the "appears to be working" verdict on a real executed artifact (approved SOP id / completed-training id in the window). Where none exists, report `NOT_ATTRIBUTABLE` / `INSUFFICIENT_DATA` honestly.
- **Safe execution mode:** honesty fix (remove the false claim) — no autonomy, no new external action.
- **Owner approval needed?** No (it removes a claim). But it changes accepted, CI-gated behaviour → owner should authorise the semantics change.
- **Remediation:** Bounded. Change the wiring + effectiveness verdict language + update the effectiveness DB sim to assert the honest NOT_ATTRIBUTABLE path.

---

## HIGH

### H1 — Process corrections carry approval labels but create no governed task
- **Behaviour:** `ProcessCorrection` structs (`requiresOwnerApproval`, `requiredApprovalLevel`, evidence IDs) are recomputed each request, never persisted (payload omits them, `owner-now-view.service.ts:1238`); no `ProcessCorrection` model; no approve/reject/complete endpoint.
- **Why not Level 3:** The module the cockpit presents as "governed execution" produces a proposal object nothing consumes into an owner-assigned, evidence-gated, verifiable task.
- **Required conversion:** Persist a correction as an owner/manager task (reuse the existing `Action`/`DelegatedTask`/owner-action-gate spine) with an owner, evidence requirement, completion state, and reassessment follow-up.
- **Safe mode:** OPSIQ_CREATES_OWNER_APPROVAL_TASK / OPSIQ_CREATES_TASK_FOR_MANAGER. **Owner approval:** yes (new persisted work-item flow). **Remediation:** BROAD — owner-approved.

### H2 — SOP correction drafts never reach the SOP approval service
- **Behaviour:** The engine emits governed drafts but never calls `sop-document.service.createSopDraft/approveSopDocument`; the owner must re-key the draft into the form. Approval itself requires no evidence.
- **Required conversion:** Bridge engine draft → `createSopDraft` (carry evidence/successMetric/reviewCadence); require evidence to approve; schedule `reviewAfterDays`. **Owner approval:** yes. **Remediation:** BROAD-ish (bridge + evidence gate).

### H3 — Training is proposed, never assigned; completion path is dead code
- **Behaviour:** Persistence stops at `OwnerTrainingRecommendation` status `recommended` (no `→assigned`); `completeTraining` (proof+recheck+audit) has zero production callers → no proof-of-completion is ever recorded in prod.
- **Required conversion:** Add `recommended→assigned` (staff task) and expose `completeTraining` via a route so a completed training carries proof. **Manager/staff execution + evidence.** **Owner approval:** assignment yes / completion is staff+evidence. **Remediation:** BROAD-ish.

### H4 — Cash/profit protective actions are labels, not tasks; runway/margin are false-precision proxies
- **Behaviour:** `protectiveAction` (e.g. `PROTECT_CASH_RUNWAY`) is a display string routed to no task; evidence arrays fed empty; 6/9 leak inputs hardcoded 0; `cashRunwayDays`/`netMarginPct` are 5-value state-bucket constants rendered as measured days/%.
- **Required conversion:** Route each material protective action into the owner-action-gate/task FSM; stop presenting bucket constants as measured metrics (null or relabel as a tier); wire real leak counts. **Owner approval:** yes for material actions. **Remediation:** false-precision relabel is BOUNDED; task routing is BROAD-ish.

### H5 — Owner workload reduction recommends; the real reducer is un-wired
- **Behaviour:** `DELEGATE_TO_MANAGER`/`CONVERT_TO_POLICY` are strings; the genuine reducer `owner-load.service.recordStandingInstruction` (real `auto_allow` governed execution) is never invoked by the engine.
- **Required conversion:** Route `CONVERT_TO_POLICY` findings → `recordStandingInstruction` (owner-confirmed); measure whether burden fell. **Owner approval:** yes (owner confirms each standing instruction). **Remediation:** BOUNDED-to-medium.

### H6 — Complaint escalation is advisory; a complaint against accepted proof does not auto re-verify
- **Behaviour:** Overdue-severe complaint yields an `escalationTrigger` string (no reassessment/owner action); a complaint linked to an ACCEPTED proof does not trigger the dispute/re-verification flow.
- **Required conversion:** On overdue-severe or complaint-vs-accepted-proof, emit a reassessment event / open a proof dispute automatically (both services already exist). **Safe internal action + owner-visible.** **Owner approval:** no (safe internal reassessment). **Remediation:** BOUNDED (reuse `reassessment-event.service` / `disputeAcceptedProof`).

### H7 — No automated post-completion outcome/KPI measurement (dead verification engine)
- **Behaviour:** `verification-engine.ts` (`verifyCompletion`/`detectFakeCompletion`) and `coordinateExecution` have no runtime callers; the only post-completion follow-up is a human-initiated dispute.
- **Required conversion:** Either wire an outcome/KPI check after a governed completion, or remove the dead engine and document the limitation honestly. **Owner approval:** wiring = broad; removal = bounded cleanup. **Remediation:** decide wire-vs-remove.

### H8 — Cross-tenant READ isolation is not adversarially proven
- **Behaviour:** `sec-04`/`sec-02` prove empty-WHERE bulk-write and cross-tenant write are blocked, but no test seeds two populated tenants and confirms a workspace-A read path filters workspace-B out.
- **Required conversion:** Add a two-populated-tenant cross-READ DB test across the owner-mode read services. **Owner approval:** no (test only). **Remediation:** BOUNDED (test-coverage).

### H9 — Browser E2E has silent no-op guards and no UI-driven completion/evidence journey
- **Behaviour:** 44/45 substantive assertions are wrapped in `if (await panel.count())` → silently pass if seeds under-produce; the owner never completes an execution task, submits evidence, or approves an `OWNER_APPROVAL_REVIEW` through the UI; no manager/staff browser journey exists.
- **Required conversion:** Deterministic seeds (assert the panel exists) + a browser journey that completes a task with evidence and approves an owner-approval item. **Owner approval:** no (test only). **Remediation:** BOUNDED-to-medium.

### H10 — Cockpit renders approval affordances it cannot fulfil
- **Behaviour:** The cockpit shows "Owner approval required" badges (`ProcessIntelligencePanel.tsx:189,239,594`) with no approve/delegate/complete control — the visible face of H1/H4.
- **Required conversion:** Once H1/H4 persist tasks, add the action affordance (approve/delegate/complete). **Owner approval:** yes. **Remediation:** follows H1/H4.

### H11 — Audit atomicity fault-injection covers only 2 of 7 governed write services
- **Behaviour:** Rollback-on-audit-failure proven for `updateItem`/`applyOverride`; the 5 opportunity/validation/proof-dispute/adjudication/signal services rely on architectural claim.
- **Required conversion:** Extend the fault-injection audit-rollback test to those services; add a hash-chain concurrency (no-fork) test. **Owner approval:** no. **Remediation:** BOUNDED (test-coverage).

---

## MEDIUM
- **M1 Capability gap detector** — recommends OpsIQ's own backlog with no governed adoption-decision track (advisory by design).
- **M2 Adjudication auth scope** — `PROOF_REVIEW_LOW_RISK` can adjudicate CRITICAL findings; `ownerActionRequired` never becomes a tracked task.
- **M3 Anti-gaming two-tier wiring** — the owner-callable `gaming-analytics.service.ts` is the weaker (proof-ID-less, non-adjudicable) path; declared complaint↔proof gaming signals are never emitted.
- **M4 Opportunity DO_NOW** — a validated small scale reaches MANAGER (not OWNER) approval (still post-PASS, not unsafe).
- **M5 Opportunity CONTACT/DRAFT tasks** — advertise `requiredEvidence` but do not enforce it (prep tasks; no unsafe action, but an evidence-integrity mismatch).
- **M6 Multi-actor role trust** — enforcement is by caller-supplied `actorRole` string; the EXTERNAL_ADVISOR actor never actually acts.
- **M7 Intake fit defaults** — `operationalFit/capabilityFit` optimistically default MODERATE/STRONG when `locationContext` present (bounded; downstream gates still require validation).

---

## What is genuinely Level 3 (not advisory) — for balance
- **Opportunity loop** (intake→intelligence→validation→outcome→portfolio→`OpportunityExecutionTask`): persisted, evidence-gated, owner-approval-gated, stop-loss-cannot-pass, no auto-submit/spend — CI + DB + browser proven.
- **Proof-integrity core** (intake→precheck→completion-gate→adjudication→dispute→reassessment): fake/reused/tampered proof cannot reach verified completion; human-review acceptance; atomic audit.
- **Approval/auto-action safety spine**: `NEVER_AUTO` + `enforceOwnerActionGates` throws on every material transition; no unsafe autonomy exists.
- **Audit atomicity** (2 paths) and **workspace WRITE isolation**: fail-closed, proven.
- **Multi-actor + full-adversarial DB sims**: fail closed (no-write nulls, IN_PROGRESS persistence, no `*submit*` task type), in a real CI lane.
