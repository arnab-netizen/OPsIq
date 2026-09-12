# Proof ↔ Outcome Linkage + Reassessment Event Creation — PLAN

**Branch:** `claude/proof-outcome-reassessment-linkage-depth-pass`
**Base:** `origin/main` @ `26a52182` (Runtime Control Correlation, PR #113, merged).

## Objective
Persist and wire the minimum safe proof/outcome/reassessment linkages needed for future Process
Intelligence and stronger Evidence Credibility — using ONLY real persisted records. Do not build
full Process Intelligence, complaint/rework event models, or a process-mining system.

## What is feasible from EXISTING persisted records (the key realization)
Every proof transition is written to the audit log as a `proof.reviewed` event with
`payload.{fromStatus,toStatus}`, keyed by `entityId = proofId` and stamped with a server
`occurredAt`. The proof FSM only allows `ACCEPTED → {DISPUTED, OVERRIDDEN_NOT_VERIFIED}`. So a
single `proof.reviewed` row with `fromStatus=ACCEPTED` and a contradiction `toStatus` is
**authoritative proof that an accepted proof was later reversed** — a real, keyed, timestamped
"accepted proof → bad result" link, no fabrication and no new schema.

| Linkage | Source (persisted) | Target (persisted) | Feasible? |
|---|---|---|---|
| `PROOF_TO_BAD_RESULT_LINK` | proof ACCEPTED (`proof.reviewed`) | later `proof.reviewed` fromStatus=ACCEPTED → DISPUTED/OVERRIDDEN | **YES — measured** |
| `PROOF_TO_REWORK_LINK` | `Proof.resubmissionOfId` predecessor | the resubmission proof | **YES — measured** |
| `PROOF_TO_COMPLAINT_LINK` | accepted proof | per-event complaint | **NO** — complaints are period aggregates only (`ownerMetricSnapshot.complaintCount`) |
| `PROOF_TO_OUTCOME_LINK` (recommendation) | accepted proof | `OwnerActionOutcome` | **NO** — disjoint entity trees, no join key |
| `OUTCOME_TO_REASSESSMENT_LINK` | contradiction / bad outcome | `OwnerReassessmentEvent` (via `sourceProofId` / `outcomeId`) | **YES — creation service** |

## Reassessment Event Creation Service (was missing)
`OwnerReassessmentEvent` had no app creation service. This pass adds `createReassessmentEvent`
(atomic row + `OWNER_REASSESSMENT_CREATED` audit, idempotent by open source key, server timestamp).
It gives OpsIQ's correction loop a real governed entry point and makes `REASSESSMENT_LATENCY`
measurable (there are now events to time). It keys the reassessment to its cause via the existing
`outcomeId` and a new `sourceProofId`.

## Schema (minimal, additive, backfill-safe)
One nullable column: `owner_reassessment_events.sourceProofId UUID` + `(workspaceId, sourceProofId)`
index — makes proof→reassessment queryable. Existing rows stay NULL (no fabricated linkage).
Plus one additive audit-event constant `owner.reassessment_created`.

## Integration
- **Evidence Credibility Graph**: per-submitter contradictions → `ACCEPTED_PROOF_WITH_BAD_OUTCOME`;
  a contradicted submitter is never `RELIABLE_SUBMITTER_PATTERN`; a checked-clean submitter becomes
  HIGH-confidence reliable (contradiction now tracked; per-proof complaints still disclosed missing).
- **Business-Control SLO**: new `PROOF_OUTCOME_INTEGRITY` (PASS/WARN/FAIL/NOT_MEASURABLE) from the
  measured contradiction rate.
- **Owner Now View**: `proofOutcomeLinkage` on the payload; the contradiction surfaces as
  `topCredibilityConcern` and the integrity SLO inside `businessControlHealth`.

## Honesty rules
No fabricated timestamps (both come from audit `occurredAt`). No fake green (no accepted proof →
NOT_MEASURABLE; accepted-but-never-reversed → PASS, not a fake failure). Complaint/recommendation
links stay NOT_MEASURABLE with the exact missing model. Workspace-scoped; isolation DB-tested.
