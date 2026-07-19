/**
 * Phase 4 — Objective-level goal arbitration.
 *
 * Extends the existing `arbitrate()` primitive (which operates on generic
 * ArbitrationCandidate[]) with objective-specific scoring: alignment with
 * the business objective hierarchy, resource feasibility, dependency blocking,
 * strategic time-horizon, and the existing constraint-gate logic.
 *
 * Pure — no DB, no I/O.
 */

import { arbitrate, type ArbitrationCandidate, type ArbitrationResult } from "./decision-arbitration";

export type ObjectiveType =
  | "REVENUE"
  | "COST_REDUCTION"
  | "QUALITY"
  | "COMPLIANCE"
  | "GROWTH"
  | "RESILIENCE"
  | "STRATEGIC";

export type ObjectiveStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
export type TimeHorizon = "IMMEDIATE" | "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM";

/** Scoring weights for objective arbitration */
const OBJECTIVE_TYPE_WEIGHT: Record<ObjectiveType, number> = {
  REVENUE: 0.9,
  COST_REDUCTION: 0.85,
  QUALITY: 0.75,
  COMPLIANCE: 1.0,
  GROWTH: 0.7,
  RESILIENCE: 0.8,
  STRATEGIC: 0.65,
};

const TIME_HORIZON_URGENCY: Record<TimeHorizon, number> = {
  IMMEDIATE: 1.0,
  SHORT_TERM: 0.75,
  MEDIUM_TERM: 0.5,
  LONG_TERM: 0.25,
};

export interface ObjectiveCandidate {
  objectiveId: string;
  objectiveType: ObjectiveType;
  status: ObjectiveStatus;
  priorityScore: number; // 0..100 — owner-set
  progressPct: number; // 0..100 — how far along
  resourceBudgetUsedPct: number; // 0..100 — how much of budget is consumed
  hasBlockingDependencies: boolean;
  linkedGoalAligned: boolean; // links to an active OwnerGoal
  timeHorizon: TimeHorizon;
  deadlineDaysRemaining: number | null; // null = no deadline
  confidence: number; // 0..1 — based on data completeness
  reversible: boolean; // can we abandon this without high cost
}

export interface ObjectiveArbitrationItem extends ArbitrationCandidate {
  objectiveId: string;
  objectiveType: ObjectiveType;
  timeHorizon: TimeHorizon;
  progressPct: number;
  typeWeight: number;
  urgencyScore: number;
}

export interface ObjectiveArbitrationResult {
  winnerObjectiveId: string | null;
  arbitrationResult: ArbitrationResult;
  candidates: ObjectiveArbitrationItem[];
  dominantConstraint: string | null;
  resourceConflict: { objectiveId: string; reason: string }[] | null;
}

/** Convert an ObjectiveCandidate to ArbitrationCandidate for the base arbitrate(). */
function toArbitrationCandidate(obj: ObjectiveCandidate): ObjectiveArbitrationItem {
  const typeWeight = OBJECTIVE_TYPE_WEIGHT[obj.objectiveType];
  const timeUrgency = TIME_HORIZON_URGENCY[obj.timeHorizon];

  // Deadline-driven urgency escalation
  let urgencyMultiplier = 1.0;
  if (obj.deadlineDaysRemaining !== null) {
    if (obj.deadlineDaysRemaining <= 7) urgencyMultiplier = 1.5;
    else if (obj.deadlineDaysRemaining <= 30) urgencyMultiplier = 1.25;
    else if (obj.deadlineDaysRemaining <= 90) urgencyMultiplier = 1.1;
  }

  const urgencyScore = Math.min(1.0, timeUrgency * urgencyMultiplier);
  const resourceBudgetOverrun = obj.resourceBudgetUsedPct >= 95;

  // riskOfAction: high if budget nearly exhausted or late-stage irreversible
  const riskOfAction = !obj.reversible
    ? Math.max(0.4, 1 - obj.confidence)
    : resourceBudgetOverrun
    ? Math.max(0.3, (obj.resourceBudgetUsedPct / 100) * 0.5 * (1 - obj.confidence))
    : Math.max(0, (obj.resourceBudgetUsedPct / 100) * 0.5 * (1 - obj.confidence));

  // riskOfInaction: driven by urgency and type weight
  const riskOfInaction = Math.min(1.0, urgencyScore * typeWeight);

  return {
    id: obj.objectiveId,
    objectiveId: obj.objectiveId,
    objectiveType: obj.objectiveType,
    timeHorizon: obj.timeHorizon,
    progressPct: obj.progressPct,
    typeWeight,
    urgencyScore,
    blockedBy: obj.hasBlockingDependencies ? ["capacity"] : [],
    riskOfAction: parseFloat(riskOfAction.toFixed(3)),
    riskOfInaction: parseFloat(riskOfInaction.toFixed(3)),
    confidence: obj.confidence,
    ownerGoalAligned: obj.linkedGoalAligned,
    reversible: obj.reversible,
    // Compliance is always owner-approval required (treated as a proxy for legal_security weight)
  };
}

/** Detect resource conflicts across competing objectives. */
function detectResourceConflicts(
  candidates: ObjectiveCandidate[],
): { objectiveId: string; reason: string }[] | null {
  const overBudget = candidates.filter((c) => c.resourceBudgetUsedPct >= 95);
  if (overBudget.length === 0) return null;
  return overBudget.map((c) => ({
    objectiveId: c.objectiveId,
    reason: `Resource budget ${Math.round(c.resourceBudgetUsedPct)}% consumed`,
  }));
}

/**
 * Arbitrate business objectives to surface the highest-value, feasible, unblocked
 * objective that deserves the owner's attention next.
 *
 * Skips PAUSED, COMPLETED, and ABANDONED objectives automatically.
 */
export function arbitrateObjectives(
  candidates: ObjectiveCandidate[],
): ObjectiveArbitrationResult {
  const active = candidates.filter((c) => c.status === "ACTIVE");

  const mapped = active.map(toArbitrationCandidate);
  const baseResult = arbitrate(mapped);

  const winner = baseResult.recommended;
  const resourceConflict = detectResourceConflicts(active);

  const dominantConstraint = baseResult.decisions
    .filter((d) => d.dominantConstraint !== null)
    .map((d) => d.dominantConstraint)
    .find(Boolean) ?? null;

  return {
    winnerObjectiveId: winner?.id ?? null,
    arbitrationResult: baseResult,
    candidates: mapped,
    dominantConstraint: dominantConstraint ?? null,
    resourceConflict: resourceConflict,
  };
}
