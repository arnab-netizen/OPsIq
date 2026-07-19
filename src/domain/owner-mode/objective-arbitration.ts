/**
 * Phase 4 — Objective-level goal arbitration.
 *
 * Extends the existing `arbitrate()` primitive (which operates on generic
 * ArbitrationCandidate[]) with objective-specific scoring across 13 named dimensions:
 *   1.  urgency           — deadline-driven time pressure
 *   2.  impact            — objective type strategic weight
 *   3.  ROI               — expected return relative to resource cost
 *   4.  owner priority    — explicit owner-set priority score
 *   5.  dependencies      — blocking dependency presence
 *   6.  resource avail.   — remaining capacity vs demand
 *   7.  execution cost    — resource budget consumed vs remaining
 *   8.  cash impact       — REVENUE/COST_REDUCTION types carry cash weight modifier
 *   9.  operational risk  — objective-level risk score
 *   10. customer impact   — QUALITY objectives get customer-facing modifier
 *   11. regulatory impact — COMPLIANCE objectives carry mandatory execution weight
 *   12. reversibility     — whether abandoning carries high cost
 *   13. evidence conf.    — data quality and completeness confidence
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

export type PortfolioDecision = "EXECUTE_NOW" | "DELAY" | "CANCEL" | "MERGE" | "SPLIT" | "ESCALATE";

/** Dim 2: Strategic impact weight by objective type */
const OBJECTIVE_TYPE_WEIGHT: Record<ObjectiveType, number> = {
  REVENUE: 0.9,
  COST_REDUCTION: 0.85,
  QUALITY: 0.75,
  COMPLIANCE: 1.0,
  GROWTH: 0.7,
  RESILIENCE: 0.8,
  STRATEGIC: 0.65,
};

/** Dim 1: Urgency weight by time horizon */
const TIME_HORIZON_URGENCY: Record<TimeHorizon, number> = {
  IMMEDIATE: 1.0,
  SHORT_TERM: 0.75,
  MEDIUM_TERM: 0.5,
  LONG_TERM: 0.25,
};

/** Dim 8: Cash impact modifier — how strongly does this objective type affect cash? */
const CASH_IMPACT_MODIFIER: Record<ObjectiveType, number> = {
  REVENUE: 0.25,         // directly increases cash
  COST_REDUCTION: 0.20,  // directly reduces outflow
  QUALITY: 0.05,
  COMPLIANCE: 0.10,      // non-compliance has cash penalty risk
  GROWTH: 0.15,
  RESILIENCE: 0.05,
  STRATEGIC: 0.05,
};

/** Dim 10: Customer impact modifier */
const CUSTOMER_IMPACT_MODIFIER: Record<ObjectiveType, number> = {
  QUALITY: 0.20,
  REVENUE: 0.10,
  GROWTH: 0.15,
  COMPLIANCE: 0.05,
  COST_REDUCTION: 0.05,
  RESILIENCE: 0.10,
  STRATEGIC: 0.05,
};

/** Dim 11: Regulatory/compliance weight — COMPLIANCE is mandatory */
const REGULATORY_WEIGHT: Record<ObjectiveType, number> = {
  COMPLIANCE: 0.30,
  QUALITY: 0.05,
  REVENUE: 0,
  COST_REDUCTION: 0,
  GROWTH: 0,
  RESILIENCE: 0.05,
  STRATEGIC: 0,
};

export interface ObjectiveCandidate {
  objectiveId: string;
  objectiveType: ObjectiveType;
  status: ObjectiveStatus;
  priorityScore: number;        // Dim 4: owner priority, 0..100
  progressPct: number;          // 0..100
  resourceBudgetUsedPct: number;// Dim 7: execution cost proxy, 0..100
  hasBlockingDependencies: boolean; // Dim 5: dependency blocking
  linkedGoalAligned: boolean;
  timeHorizon: TimeHorizon;
  deadlineDaysRemaining: number | null;
  confidence: number;           // Dim 13: evidence confidence, 0..1
  reversible: boolean;          // Dim 12
  // Dim 3: ROI inputs (optional — missing data handled explicitly)
  estimatedROI?: number | null; // 0..inf — expected return / cost ratio; null = unknown
  // Dim 6: resource availability (0..1; 1 = fully available, 0 = none left)
  resourceAvailabilityRatio?: number | null; // null = unknown → treated as 0.5 (moderate)
  // Dim 9: operational risk score (0..1; 0 = no risk; null = unknown → 0.3)
  operationalRisk?: number | null;
  // Child count — used for SPLIT decision detection
  childCount?: number;
}

/**
 * Per-dimension metadata distinguishing measured values from defaults/unknowns.
 * "null rawValue" means the dimension was not supplied by the caller — the score
 * is an explicit default, NOT a measured neutral.
 */
export interface DimensionMeta {
  score: number;
  rawValue: number | null;
  isKnown: boolean;
  source: "measured" | "derived" | "default";
  confidence: number;
  missingReason?: string;
}

export interface ObjectiveArbitrationItem extends ArbitrationCandidate {
  objectiveId: string;
  objectiveType: ObjectiveType;
  timeHorizon: TimeHorizon;
  progressPct: number;
  typeWeight: number;
  urgencyScore: number;
  // Named dimension scores (0..1 each, for explainability)
  dim_roi: number;
  dim_cashImpact: number;
  dim_customerImpact: number;
  dim_regulatoryWeight: number;
  dim_operationalRisk: number;
  dim_resourceAvailability: number;
  /** Per-dimension metadata — distinguishes measured 0.5 from "unknown defaulted to 0.5". */
  dimensionScores: Record<string, DimensionMeta>;
  portfolioDecision: PortfolioDecision;
  portfolioRationale: string;
}

export interface ObjectiveArbitrationResult {
  winnerObjectiveId: string | null;
  arbitrationResult: ArbitrationResult;
  candidates: ObjectiveArbitrationItem[];
  dominantConstraint: string | null;
  resourceConflict: { objectiveId: string; reason: string }[] | null;
}

/** Compute ROI dimension metadata. Unknown ROI is tracked as a default — not measured neutral. */
function scoreROI(estimatedROI: number | null | undefined): DimensionMeta {
  if (estimatedROI == null) {
    return { score: 0.5, rawValue: null, isKnown: false, source: "default", confidence: 0.3,
      missingReason: "estimatedROI not supplied — defaulted to neutral 0.5" };
  }
  const score = estimatedROI <= 0 ? 0.1 : estimatedROI >= 5 ? 1.0 : Math.min(1.0, estimatedROI / 5);
  return { score, rawValue: estimatedROI, isKnown: true, source: "measured", confidence: 0.8 };
}

/** Resource availability dimension metadata. Unknown ratio tracked as default. */
function scoreResourceAvailability(ratio: number | null | undefined): DimensionMeta {
  if (ratio == null) {
    return { score: 0.5, rawValue: null, isKnown: false, source: "default", confidence: 0.3,
      missingReason: "resourceAvailabilityRatio not supplied — defaulted to moderate 0.5" };
  }
  const score = Math.max(0, Math.min(1.0, ratio));
  return { score, rawValue: ratio, isKnown: true, source: "measured", confidence: 0.9 };
}

/** Operational risk dimension metadata. Unknown risk tracked as default. */
function resolveOperationalRisk(risk: number | null | undefined): DimensionMeta {
  if (risk == null) {
    return { score: 0.3, rawValue: null, isKnown: false, source: "default", confidence: 0.3,
      missingReason: "operationalRisk not supplied — defaulted to moderate 0.3" };
  }
  const score = Math.max(0, Math.min(1.0, risk));
  return { score, rawValue: risk, isKnown: true, source: "measured", confidence: 0.8 };
}

/** Convert an ObjectiveCandidate to ArbitrationCandidate for the base arbitrate(). */
function toArbitrationCandidate(obj: ObjectiveCandidate): ObjectiveArbitrationItem {
  // Dim 2: impact via type weight
  const typeWeight = OBJECTIVE_TYPE_WEIGHT[obj.objectiveType];

  // Dim 1: urgency via time horizon + deadline escalation
  const timeUrgency = TIME_HORIZON_URGENCY[obj.timeHorizon];
  let urgencyMultiplier = 1.0;
  if (obj.deadlineDaysRemaining !== null) {
    if (obj.deadlineDaysRemaining < 0) urgencyMultiplier = 1.75;     // past deadline
    else if (obj.deadlineDaysRemaining <= 7) urgencyMultiplier = 1.5;
    else if (obj.deadlineDaysRemaining <= 30) urgencyMultiplier = 1.25;
    else if (obj.deadlineDaysRemaining <= 90) urgencyMultiplier = 1.1;
  }
  const urgencyScore = Math.min(1.0, timeUrgency * urgencyMultiplier);

  // Dim 3: ROI — returns DimensionMeta to distinguish measured vs default
  const roiMeta = scoreROI(obj.estimatedROI);

  // Dim 4: owner priority (normalised 0..1)
  const priorityNorm = Math.max(0, Math.min(100, obj.priorityScore)) / 100;

  // Dim 6: resource availability — returns DimensionMeta
  const resourceAvailMeta = scoreResourceAvailability(obj.resourceAvailabilityRatio);

  // Dim 7: execution cost (high usage = high cost risk)
  const resourceBudgetOverrun = obj.resourceBudgetUsedPct >= 95;

  // Dim 8: cash impact modifier (type-derived, always known)
  const dim_cashImpact = CASH_IMPACT_MODIFIER[obj.objectiveType];

  // Dim 9: operational risk — returns DimensionMeta
  const operationalRiskMeta = resolveOperationalRisk(obj.operationalRisk);

  // Dim 10: customer impact (type-derived, always known)
  const dim_customerImpact = CUSTOMER_IMPACT_MODIFIER[obj.objectiveType];

  // Dim 11: regulatory weight (type-derived, always known)
  const dim_regulatoryWeight = REGULATORY_WEIGHT[obj.objectiveType];

  // Dim 12: reversibility (already in ArbitrationCandidate)
  // Dim 13: evidence confidence (already in ArbitrationCandidate)

  // Count unknown dimensions — confidence penalty when multiple dimensions are estimated
  const unknownCount = [roiMeta, resourceAvailMeta, operationalRiskMeta].filter((m) => !m.isKnown).length;
  const adjustedConfidence = Math.max(0.1, obj.confidence - unknownCount * 0.1);

  // Compose riskOfAction: operational risk + resource overrun + irreversibility + low confidence
  const baseActionRisk = operationalRiskMeta.score * 0.4
    + (resourceBudgetOverrun ? 0.25 : (obj.resourceBudgetUsedPct / 100) * 0.15)
    + (!obj.reversible ? 0.20 : 0)
    + (1 - adjustedConfidence) * 0.25;
  const riskOfAction = Math.max(0, Math.min(1.0, parseFloat(baseActionRisk.toFixed(3))));

  // Compose riskOfInaction: urgency + type weight + cash/regulatory impact + priority
  const baseInactionRisk = urgencyScore * 0.35
    + typeWeight * 0.25
    + dim_cashImpact * 0.15
    + dim_regulatoryWeight * 0.10
    + dim_customerImpact * 0.05
    + priorityNorm * 0.10;
  const riskOfInaction = Math.max(0, Math.min(1.0, parseFloat(baseInactionRisk.toFixed(3))));

  // Build dimensionScores map for explainability
  const dimensionScores: Record<string, DimensionMeta> = {
    roi: roiMeta,
    resourceAvailability: resourceAvailMeta,
    operationalRisk: operationalRiskMeta,
    urgency: { score: urgencyScore, rawValue: obj.deadlineDaysRemaining, isKnown: true, source: "derived", confidence: 0.9 },
    typeWeight: { score: typeWeight, rawValue: typeWeight, isKnown: true, source: "derived", confidence: 1.0 },
    cashImpact: { score: dim_cashImpact, rawValue: dim_cashImpact, isKnown: true, source: "derived", confidence: 1.0 },
    customerImpact: { score: dim_customerImpact, rawValue: dim_customerImpact, isKnown: true, source: "derived", confidence: 1.0 },
    regulatoryWeight: { score: dim_regulatoryWeight, rawValue: dim_regulatoryWeight, isKnown: true, source: "derived", confidence: 1.0 },
    ownerPriority: { score: priorityNorm, rawValue: obj.priorityScore, isKnown: true, source: "measured", confidence: 0.9 },
    confidence: { score: adjustedConfidence, rawValue: obj.confidence, isKnown: true, source: "measured", confidence: 1.0 },
  };

  // Portfolio decision (see computePortfolioDecision below — placeholder for now, set after all candidates computed)
  const portfolioDecision: PortfolioDecision = "EXECUTE_NOW"; // overridden in computePortfolioDecisions
  const portfolioRationale = "";

  return {
    id: obj.objectiveId,
    objectiveId: obj.objectiveId,
    objectiveType: obj.objectiveType,
    timeHorizon: obj.timeHorizon,
    progressPct: obj.progressPct,
    typeWeight,
    urgencyScore,
    dim_roi: roiMeta.score,
    dim_cashImpact,
    dim_customerImpact,
    dim_regulatoryWeight,
    dim_operationalRisk: operationalRiskMeta.score,
    dim_resourceAvailability: resourceAvailMeta.score,
    dimensionScores,
    portfolioDecision,
    portfolioRationale,
    blockedBy: obj.hasBlockingDependencies ? ["capacity"] : [],
    riskOfAction,
    riskOfInaction,
    confidence: adjustedConfidence,
    ownerGoalAligned: obj.linkedGoalAligned,
    reversible: obj.reversible,
  };
}

/**
 * Compute portfolio decision for each candidate.
 * Rules applied in priority order (first match wins).
 */
function computePortfolioDecisions(
  candidates: ObjectiveArbitrationItem[],
  original: ObjectiveCandidate[],
): void {
  // MERGE detection: pairs of same-type objectives both AT_RISK with overlapping resources
  const sameTypeGroups = new Map<string, ObjectiveArbitrationItem[]>();
  for (const c of candidates) {
    const group = sameTypeGroups.get(c.objectiveType) ?? [];
    group.push(c);
    sameTypeGroups.set(c.objectiveType, group);
  }
  const mergeTargets = new Set<string>();
  for (const group of sameTypeGroups.values()) {
    if (group.length >= 2) {
      const atRisk = group.filter((c) => c.riskOfAction > 0.5 && c.riskOfInaction > 0.5);
      if (atRisk.length >= 2) {
        atRisk.slice(0, 2).forEach((c) => mergeTargets.add(c.objectiveId));
      }
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const orig = original.find((o) => o.objectiveId === c.objectiveId)!;

    let decision: PortfolioDecision;
    let rationale: string;

    if (orig.hasBlockingDependencies && orig.deadlineDaysRemaining !== null && orig.deadlineDaysRemaining <= 14) {
      // ESCALATE: blocked AND imminent deadline
      decision = "ESCALATE";
      rationale = `Blocked by dependencies with ${orig.deadlineDaysRemaining}d until deadline — owner escalation required`;
    } else if (orig.status !== "ACTIVE" || (
      orig.progressPct < 10 &&
      orig.deadlineDaysRemaining !== null &&
      orig.deadlineDaysRemaining < -30 &&
      orig.resourceBudgetUsedPct >= 80
    )) {
      // CANCEL: negligible progress, far past deadline, resources exhausted
      decision = "CANCEL";
      rationale = "Negligible progress past deadline with exhausted budget — recommend cancellation";
    } else if (mergeTargets.has(c.objectiveId)) {
      // MERGE: same-type objectives both struggling — combine for efficiency
      decision = "MERGE";
      rationale = `Same objective type as another struggling objective — merge to consolidate resources`;
    } else if (
      orig.childCount === 0 &&
      orig.priorityScore >= 80 &&
      orig.resourceBudgetUsedPct >= 70 &&
      orig.progressPct < 30
    ) {
      // SPLIT: high-priority broad objective consuming resources with low progress
      decision = "SPLIT";
      rationale = "High-priority objective consuming significant resources with low progress — split into sub-objectives";
    } else if (
      orig.resourceAvailabilityRatio != null && orig.resourceAvailabilityRatio < 0.1 ||
      (orig.deadlineDaysRemaining !== null && orig.deadlineDaysRemaining > 90 && c.riskOfInaction < 0.4)
    ) {
      // DELAY: resources unavailable or plenty of time and low urgency
      decision = "DELAY";
      rationale = orig.resourceAvailabilityRatio != null && orig.resourceAvailabilityRatio < 0.1
        ? "Insufficient resources available — delay until capacity freed"
        : "Deadline is distant and urgency is low — delay to prioritise more pressing objectives";
    } else {
      // EXECUTE_NOW: default for viable, non-blocked, non-degenerate objectives
      decision = "EXECUTE_NOW";
      rationale = "Feasible, unblocked objective with sufficient urgency and resources";
    }

    candidates[i] = { ...c, portfolioDecision: decision, portfolioRationale: rationale };
  }
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
 * All 13 scoring dimensions are computed explicitly. Missing-data values use
 * defined neutral defaults (not 0, not fabricated).
 */
export function arbitrateObjectives(
  candidates: ObjectiveCandidate[],
): ObjectiveArbitrationResult {
  const active = candidates.filter((c) => c.status === "ACTIVE");

  const mapped = active.map(toArbitrationCandidate);
  computePortfolioDecisions(mapped, active);

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
    resourceConflict,
  };
}
