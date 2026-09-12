# Cross-Event Anti-Gaming Analytics — Report

**Classification:** `ANTI_GAMING_ANALYTICS_REAL_AND_OWNER_VISIBLE`
**Code:** `src/domain/owner-mode/anti-gaming-analytics.ts` (pure), `src/services/owner-mode/gaming-analytics.service.ts`
(owner-callable), integrated in `src/services/owner-guidance/owner-now-view.service.ts`
(`payload.topGamingSignal` via `GET /api/owner/now-view`).
**Tests:** `src/__tests__/owner-mode/anti-gaming-analytics.test.ts` (12),
`src/__tests__/owner-mode/anti-gaming-analytics-simulation.db.test.ts` (4 DB).

## What it answers
"Is staff / manager / operator behaviour making the business unreliable, fake, delayed, or
unprofitable?" — the single highest-risk pattern across MANY events, not one proof.

## Signal types (detected from real Proof/review data)
`REPEATED_WEAK_PROOF, REPEATED_REJECTED_PROOF, REUSED_PROOF_PATTERN, LATE_COMPLETION_PATTERN,
SELF_REVIEW_ATTEMPT, MANAGER_RUBBER_STAMP, OWNER_REVIEW_BURDEN_CREATED_BY_STAFF,
PROOF_FLOOD_LOW_QUALITY, DATA_INSUFFICIENT`. Domain-supported but pending persisted source:
`MISSING_PROOF_PATTERN, SUSPICIOUS_FAST_COMPLETION, COMPLAINT_AFTER_ACCEPTED_PROOF,
REWORK_AFTER_ACCEPTED_PROOF, PAYLOAD_TAMPER_ATTEMPT, CROSS_WORKSPACE_TAMPER_ATTEMPT,
MANAGER_IGNORES_ESCALATION, STAFF_PATTERN_LINKED_TO_PROFIT_LEAK`.

## Finding shape (all 20 required fields)
workspaceId, actorId, actorRole, signalType, reasonCodes[], severity, confidence, evidence[],
patternCount, missingData[], ownerExplanation, businessImpact, relatedProfitLeak, relatedConstraint,
recommendedResponse, ownerActionRequired, managerActionSufficient, trainingOrProcessRecommendation,
reassessmentTrigger, evaluatedAt (+ internal signalScore).

## NOT a black-box punishment score
- Every signal exposes **reason codes** and the **events** that prove it — no hidden numeric staff score.
- Framing distinguishes person vs **training** vs **proof** vs **SOP** vs **workload** issue, and splits
  owner-action-required from manager-sufficient.
- **Thresholds require repetition** — a single weak event is never a "pattern".
- Empty/insufficient history -> `DATA_INSUFFICIENT` with exact missing data; unpersisted sources are
  reported as missing, never fabricated (no invented complaints/tamper events).

## Determinism
`aggregateProofEvents` (pure) turns real Proof rows into per-actor/reviewer counts; ranked by severity
+ type priority + pattern count. Same input -> same top signal + score (unit-tested; re-verified across
two live now-view reads in the DB simulation).

## Integration (no orphan analytics)
1. Owner Now View exposes one `topGamingSignal`.
2. Owner-callable `getGamingAnalysis(workspaceId)` returns the full per-actor analysis.
3. Signals link the current Constraint (STAFF/QUALITY/OWNER/MANAGER) and top Profit Leak
   (weak-proof/rework -> WEAK_PROOF_REWORK_RISK; review burden -> OWNER_BOTTLENECK_COST) — feeding the
   owner-workload / profit-leak picture rather than standing alone.
4. Reassessment: recomputed each now-view read; high-risk signals carry a reassessment trigger.
