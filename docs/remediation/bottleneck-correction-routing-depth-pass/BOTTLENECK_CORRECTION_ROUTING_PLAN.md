# Bottleneck → Correction Routing — PLAN

## Objective
Turn Process Intelligence findings ("WHERE is the process breaking?") into concrete, trackable
CORRECTION ACTIONS ("what to do, who must approve") — without inventing a second signal engine, without
persisting a new lifecycle table, and without weakening any governance gate.

## Approach (smallest owner-usable, backfill-safe)
`processIntelligence` is already computed server-side inside `getOwnerNowView`. So:
1. **`buildProcessCorrections(analysis, workspaceId)`** — a pure, deterministic domain function that routes
   each `ProcessFinding` into one or more proposed corrections. No new query, no new table: it is a
   derivation over the already-derived (and already adjudication-suppressed) findings. This satisfies the
   pass's "prefer derived/proposed correction; add schema only if status tracking is needed" — status
   tracking is not needed for a proposal surface, so **no schema change** is introduced (backfill-safe).
2. **Now-view integration** — a `processCorrections` block on the Owner Now View payload, computed right
   after `processIntelligence` and null whenever that is null (fake-DI path).
3. **UI** — a `ProcessCorrectionsPanel` under the Pass-1 `/owner/process-intelligence` page ("What to do
   about it"), each correction showing type, instruction, PROPOSED status, priority, target, and the
   required approval — with an explicit owner-approval marker for owner-gated corrections.

## The 9 correction types
`REQUIRE_FRESH_PROOF`, `UPDATE_CHECKLIST`, `REVIEW_PROCESS_STEP`, `ASSIGN_TRAINING_REVIEW`,
`ESCALATE_TO_MANAGER`, `ESCALATE_TO_OWNER`, `RESOLVE_OPERATIONAL_EVENT`, `COLLECT_MISSING_DATA`,
`NO_ACTION_DATA_INSUFFICIENT`.

## The 22-field correction shape
workspaceId · correctionId · sourceFindingType · correctionType · title · instruction · rationale ·
affectedStage · targetActorId · targetManagerId · severity · confidence · priorityRank ·
requiredApprovalLevel · requiresOwnerApproval · autoExecutable · expectedImpactType · supportingProofIds ·
supportingOperationalEventIds · supportingEscalationIds · supportingAdjudicationIds · missingData
(+ `status`, always `PROPOSED`).

## Routing rules (finding type → correction types, primary first)
- REWORK_LOOP → REVIEW_PROCESS_STEP, REQUIRE_FRESH_PROOF, RESOLVE_OPERATIONAL_EVENT (events only)
- QUALITY_FAILURE_LOOP → UPDATE_CHECKLIST, ESCALATE_TO_OWNER, RESOLVE_OPERATIONAL_EVENT (events only)
- DELIVERY_HANDOFF_DELAY → RESOLVE_OPERATIONAL_EVENT (events only), REVIEW_PROCESS_STEP
- REVIEW_BOTTLENECK → REVIEW_PROCESS_STEP
- OWNER_APPROVAL_BOTTLENECK → ESCALATE_TO_OWNER, REVIEW_PROCESS_STEP (actor only)
- PROOF_QUALITY_BREAKDOWN → REQUIRE_FRESH_PROOF, ASSIGN_TRAINING_REVIEW (actor only)
- ESCALATION_RESPONSE_BREAKDOWN → ESCALATE_TO_OWNER, ESCALATE_TO_MANAGER (manager only)
- STAFF_TRAINING_GAP → ASSIGN_TRAINING_REVIEW
- MANAGER_REVIEW_GAP → REVIEW_PROCESS_STEP, ESCALATE_TO_OWNER
- DATA_INSUFFICIENT → COLLECT_MISSING_DATA (missing data present) else NO_ACTION_DATA_INSUFFICIENT

## Governance
- Every correction is **PROPOSED**; only the `NO_ACTION_DATA_INSUFFICIENT` no-op is `autoExecutable`.
- Approval level is the **stronger** of the finding's approval and the correction-type floor — it can
  only escalate the gate, never weaken it. `requiresOwnerApproval` is never hidden.
- **No fabricated assignments**: `targetActorId` / `targetManagerId` are copied from the finding or null.
- No fraud/negligence labels, no hidden staff score.

## Out of scope (per pass constraints)
Persisted correction lifecycle / approval workflow; SOP/training engine; external opportunity
intelligence; public SaaS; billing. STOP after this pass.
