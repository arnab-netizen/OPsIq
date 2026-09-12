# Process Intelligence v1 — PLAN

## Objective
Detect WHERE the business process is actually breaking, over the trusted event/proof/risk/timing/
adjudication chain OpsIQ already computes — using existing data only, no process-mining platform, no
schema change. Surface the single highest-value process breakdown with its evidence, a specific
correction, and the required approval level. Conservative: a small set of high-value failure types;
DATA_INSUFFICIENT (with exact missing data) when the evidence is absent.

## Approach (pure read model — nothing re-queried)
`buildProcessIntelligence(input)` consumes the Owner Now View's already-derived, already-adjudication-
suppressed signals: the top gaming signal, the top credibility concern, the timing-evidence signals,
reused-hash findings, complaint/rework + operational-event health, proof-review counts, owner workload,
the top profit leak, and the top constraint. It maps them to process findings and returns the top one.

Because it consumes the POST-suppression top signals, a **cleared/dismissed** proof-risk finding
(suppressed → null) cannot drive an active process failure; a **confirm / require-fresh** finding stays
active and may contribute (its adjudication id is attached).

## Failure types (v1)
`REWORK_LOOP` · `QUALITY_FAILURE_LOOP` · `DELIVERY_HANDOFF_DELAY` · `REVIEW_BOTTLENECK` ·
`OWNER_APPROVAL_BOTTLENECK` · `PROOF_QUALITY_BREAKDOWN` · `ESCALATION_RESPONSE_BREAKDOWN` ·
`STAFF_TRAINING_GAP` · `MANAGER_REVIEW_GAP` · `DATA_INSUFFICIENT`. Do not overclassify — each requires
real linked evidence above a threshold.

## Finding shape (20 fields)
workspaceId · findingType · severity · confidence · affectedStage · affectedActorId · affectedManagerId ·
supportingProofIds · supportingOperationalEventIds · supportingEscalationIds · supportingAdjudicationIds ·
relatedProfitLeak · relatedConstraint · relatedSLO · ownerExplanation · recommendedCorrectiveAction ·
expectedImpactType · requiredApprovalLevel · missingData · evaluatedAt.

## Evidence → type mapping
- REWORK_LOOP ← active rework linked to accepted proof (complaint/rework aggregates + REWORK event ids).
- QUALITY_FAILURE_LOOP ← repeated quality complaints on accepted work.
- DELIVERY_HANDOFF_DELAY ← active + overdue delivery operational events.
- REVIEW_BOTTLENECK ← weak / overdue proof-review queue.
- OWNER_APPROVAL_BOTTLENECK ← owner workload items / OWNER_REVIEW_BURDEN gaming signal.
- PROOF_QUALITY_BREAKDOWN ← weak/reused/fast-completion proof signals (proof ids).
- ESCALATION_RESPONSE_BREAKDOWN ← ignores-escalation timing signal (escalation ids, manager).
- STAFF_TRAINING_GAP ← repeated rejected / wrong-insufficient proof.
- MANAGER_REVIEW_GAP ← rubber-stamp / review-quality / accepted-suspicious signals.

## Owner Now View integration
A concise `processIntelligence` block ({ topFinding, findings, evaluatedAt }) on the now-view payload —
live path only (null on the fake-DI path). Findings link to profit leak / constraint / SLO / workload
where relevant. The owner sees the top breakdown, not a flood.

## Safety
No fabricated financial impact (impact is a TYPE, never an amount); no fraud/negligence label; no hidden
staff score; cross-workspace isolation (inputs are per-workspace).

## Out of scope
Full process-mining; SOP/training engine (findings recommend a correction only); UI beyond the payload
block; public SaaS / billing.
