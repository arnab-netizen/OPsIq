# PASS 21 — Remaining Advisory / Restriction Gaps (after the bridge)

Audited main HEAD `c3cd299c`. The process-correction execution bridge + Increment 1 closed the dominant PASS 18 advisory gap (process corrections + cash/profit + complaint now route into governed, persisted, evidence-gated, completion→reassessment execution). What remains is a small set of **restrictions**, ranked. None is unsafe; none reintroduces a fabricated figure or unsafe autonomy.

## MEDIUM

### R1 — Cockpit affordances are read-only
- The owner **sees** the single top bridged action (route, owner, approval, evidence, risk) but cannot yet **approve / delegate / complete** it with a click in the UI. The governed persist/complete loop exists and is DB/CI-proven at the service layer (`process-execution-bridge.service.ts`), but is not yet wired to interactive controls or a `/api/owner/process-execution` route.
- **Why it matters:** the diagnosis→route conversion is done (no re-key to *see* the action), but the end-user *completion* loop is service-level, not click-level.
- **Conversion:** add a `POST /api/owner/process-execution` (persist) + a complete/approve control on the panel, guarded by the existing service (owner-only, evidence-required). No new autonomy.

### R2 — Standalone SOP / training / workload / capability engines bridged only via the process-correction router
- The bridge consumes `processCorrections` + `cashProfitProtection`. SOP (`sop-checklist-correction`), training (`staff-training`), workload (`owner-workload-reduction`), and capability-gap analyses are bridged only insofar as the process-correction router emits their correction types (UPDATE_CHECKLIST / ASSIGN_TRAINING_REVIEW / …). Their **dedicated** analyses are not fed into the bridge, so a workload `CONVERT_TO_POLICY` or a capability-adoption recommendation still terminates as a read-only recommendation.
- **Conversion:** feed those analyses into `buildProcessExecutionBridge` (or route them to their existing services — e.g. workload `CONVERT_TO_POLICY` → `recordStandingInstruction`, training → the staff-training assign/complete path).

### R3 — SOP adherence + training completion re-verification
- A bridged SOP/training task completes with evidence and opens a reassessment, but there is no scheduled adherence probe (did staff actually follow the new checklist over the next N days?) or a direct read-back of a completed training into the effectiveness loop.
- **Conversion:** on completion, schedule an adherence/effectiveness re-check and feed the executed-correction signal back into `deriveEffectivenessItems` (which C1 currently keeps at INSUFFICIENT_DATA until such a link exists).

### R4 — Adjudication auth scope (carried from PASS 18)
- CRITICAL proof-risk findings remain adjudicable by a `PROOF_REVIEW_LOW_RISK` holder. Unchanged this loop.

## LOW

### R5 — Complaint auto-route is explicit, not inline
- `routeComplaintToReassessment` must be called explicitly (or via the bridge). Recording an overdue-severe complaint does not yet fire it inline from `recordOperationalEvent`.

### R6 — Two-tenant read proof + audit fault-injection are representative, not exhaustive
- `sec-05` proves cross-tenant read isolation for the execution-task read path; extend to more owner-mode read services. The bridge's atomic-audit is in-transaction (architectural) — add a dedicated audit-rollback fault-injection test for the persist/complete paths.

---

## What is now genuinely execution-first (closed since PASS 18)
- **Process corrections** → persisted governed tasks (owner/approval/evidence/completion/reassessment). DB/CI-proven.
- **Cash/profit** → owner-approval / missing-data tasks; **no more false-precision** day/percent figures (H4).
- **Complaint vs accepted proof** → governed reassessment (H6).
- **Effectiveness** → honest INSUFFICIENT_DATA, no fabricated "appears to be working" (C1).
- **Dead verification-engine** → wired live as the bridge fake-completion guard (H7).
- **Cross-tenant read isolation** → proven with two populated tenants (H8).
- **Owner cockpit** → shows one top bridged action, no overload, no re-key to see it.

## Net
The advisory-only cockpit gap that dominated PASS 18 is **closed for the core families**; the residue is a bounded set of restrictions (interactive UI, a few standalone engines, adherence re-checks) — safe, and each with a clear next-increment conversion.
