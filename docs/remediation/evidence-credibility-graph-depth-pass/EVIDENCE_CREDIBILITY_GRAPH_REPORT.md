# Evidence Credibility Graph — Report

**Classification:** `EVIDENCE_CREDIBILITY_GRAPH_REAL_AND_OWNER_VISIBLE`
**Code:** `src/domain/owner-mode/evidence-credibility-graph.ts` (pure),
`src/services/owner-mode/evidence-credibility.service.ts` (owner-callable), integrated in
`src/services/owner-guidance/owner-now-view.service.ts` (`payload.topCredibilityConcern` via
`GET /api/owner/now-view`).
**Tests:** `src/__tests__/owner-mode/evidence-credibility-graph.test.ts` (12),
`src/__tests__/owner-mode/evidence-credibility-graph-simulation.db.test.ts` (4 DB).

## What it answers
"Which proof, staff, manager/reviewer, or proof type can the owner trust — and why?" — the single
highest credibility concern, with reason codes and the events that prove it.

## Credibility entities & signals (from real Proof/review data)
Entities: submitter, reviewer, proof type, workspace item level (+ domain-supported: task/category,
process, client, reviewer↔submitter pair). Signals:
`SELF_REVIEW_BLOCKED_OR_ATTEMPTED, REVIEW_QUALITY_CONCERN, UNRELIABLE_SUBMITTER_PATTERN,
RELIABLE_SUBMITTER_PATTERN, REPEATED_OWNER_REVIEW_BURDEN, WEAK_PROOF_NEEDS_REVIEW, REUSED_PROOF,
STALE_PROOF, TAMPER_SUSPECTED_PROOF, DATA_INSUFFICIENT`. Missing-source (linkage not persisted):
`ACCEPTED_PROOF_WITH_BAD_OUTCOME / COMPLAINT / REWORK`.

## Finding shape (all 22 required fields)
workspaceId, entityType, entityId, entityLabel, signalType, severity, confidence, reasonCodes[],
evidence[], patternCount, missingData[], ownerExplanation, businessImpact, relatedGamingSignal,
relatedProfitLeak, relatedConstraint, recommendedResponse, ownerActionRequired, managerActionSufficient,
reassessmentTrigger, evaluatedAt (+ secondary, explained credibilityScore).

## Not a hidden punitive score
- Reason codes + evidence references are primary; `credibilityScore` is secondary and explained.
- Thresholds require **repetition** — one weak proof is not an "unreliable submitter".
- `RELIABLE_SUBMITTER_PATTERN` is asserted **only** with no weak/rejected/reused history AND explicitly
  discloses the missing outcome/complaint/rework↔proof linkage — it never claims verified reliability it
  cannot prove.
- Empty/insufficient history → `DATA_INSUFFICIENT` with exact missing data; unpersisted linkages are
  reported as missing-source, never fabricated.

## Determinism
`aggregateCredibility` (pure) turns real Proof rows (incl. `reviewedAt` for staleness, `proofType`)
into per-entity aggregates; ranked by severity + type priority + pattern count. Same input → same top
concern + score (unit-tested; re-verified across two live now-view reads in the DB simulation).

## Integration (no orphan graph)
1. Owner Now View exposes one `topCredibilityConcern` (one shared proof query feeds both anti-gaming
   and credibility).
2. Owner-callable `getCredibilityGraph(workspaceId)` returns the full per-entity graph.
3. Findings link the **anti-gaming** signal (self-review/rubber-stamp/reuse/review-burden), the top
   **Profit Leak** (rework/weak-proof → WEAK_PROOF_REWORK_RISK; review-burden → OWNER_BOTTLENECK_COST),
   and the current **Constraint** (STAFF/QUALITY/OWNER/MANAGER).
4. Reassessment: recomputed each now-view read; high-risk concerns carry a reassessment trigger.
