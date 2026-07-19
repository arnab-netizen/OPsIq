/**
 * Phase 4 — Objective Portfolio Optimizer.
 *
 * Single-business view of all business objectives: health scores,
 * completion trajectory, dependency blockers, top-priority surfacing.
 *
 * Distinct from `src/domain/owner-portfolio/engine.ts` (which aggregates
 * ACROSS multiple businesses). This module operates within a single workspace
 * and ranks objectives for owner attention.
 *
 * Pure — no DB, no I/O.
 */

import type { ObjectiveType, ObjectiveStatus, TimeHorizon, PortfolioDecision } from "./objective-arbitration";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

// Re-export for consumers that import from this module
export type { ObjectiveType, ObjectiveStatus, TimeHorizon, PortfolioDecision };

export interface ObjectivePortfolioInput {
  objectiveId: string;
  parentId: string | null;
  title: string;
  objectiveType: ObjectiveType;
  status: ObjectiveStatus;
  priorityScore: number; // 0..100
  targetValue: number | null;
  currentValue: number | null;
  progressPct: number; // 0..100 — computed from currentValue/targetValue or explicit
  deadlineDaysRemaining: number | null;
  linkedGoalAligned: boolean;
  hasBlockingDependencies: boolean;
  resourceBudgetUsedPct: number; // 0..100
  childCount: number;
  completedChildCount: number;
}

export type ObjectiveHealthStatus = "ON_TRACK" | "AT_RISK" | "BLOCKED" | "CRITICAL" | "COMPLETED" | "INACTIVE";

export interface ObjectivePortfolioItem {
  objectiveId: string;
  parentId: string | null;
  title: string;
  objectiveType: ObjectiveType;
  status: ObjectiveStatus;
  healthStatus: ObjectiveHealthStatus;
  healthScore: number; // 0..100
  priorityScore: number;
  progressPct: number;
  deadlineDaysRemaining: number | null;
  atRiskReasons: string[];
  recommendedAction: string | null;
  canStart: boolean; // false when has blocking dependencies
  isLeaf: boolean; // no children
  portfolioDecision: PortfolioDecision;
  portfolioRationale: string;
}

export interface ObjectivePortfolioView {
  items: ObjectivePortfolioItem[];
  totalActive: number;
  totalCompleted: number;
  totalBlocked: number;
  criticalCount: number;
  atRiskCount: number;
  onTrackCount: number;
  topPriorityObjectiveId: string | null;
  portfolioHealthScore: number; // 0..100 — aggregate
}

/** Compute health status and score for a single objective. */
export function scoreObjectiveHealth(obj: ObjectivePortfolioInput): {
  healthStatus: ObjectiveHealthStatus;
  healthScore: number;
  atRiskReasons: string[];
  recommendedAction: string | null;
} {
  if (obj.status === "COMPLETED") {
    return { healthStatus: "COMPLETED", healthScore: 100, atRiskReasons: [], recommendedAction: null };
  }
  if (obj.status === "ABANDONED") {
    return { healthStatus: "INACTIVE", healthScore: 0, atRiskReasons: ["Objective abandoned"], recommendedAction: null };
  }
  if (obj.status === "PAUSED") {
    return { healthStatus: "INACTIVE", healthScore: 20, atRiskReasons: ["Objective paused"], recommendedAction: "Resume when conditions allow" };
  }

  const reasons: string[] = [];
  let score = 100;

  if (obj.hasBlockingDependencies) {
    reasons.push("Has unresolved blocking dependencies");
    score -= 40;
  }

  if (obj.deadlineDaysRemaining !== null) {
    if (obj.deadlineDaysRemaining < 0) {
      reasons.push("Past deadline");
      score -= 30;
    } else if (obj.deadlineDaysRemaining <= 7 && obj.progressPct < 80) {
      reasons.push(`Deadline in ${obj.deadlineDaysRemaining}d, only ${obj.progressPct}% complete`);
      score -= 25;
    } else if (obj.deadlineDaysRemaining <= 30 && obj.progressPct < 50) {
      reasons.push(`Deadline in ${obj.deadlineDaysRemaining}d with low progress`);
      score -= 15;
    }
  }

  if (obj.resourceBudgetUsedPct >= 95 && obj.progressPct < 90) {
    reasons.push("Budget nearly exhausted before completion");
    score -= 20;
  }

  if (obj.progressPct < 20 && obj.deadlineDaysRemaining !== null && obj.deadlineDaysRemaining < 60) {
    reasons.push("Very low progress relative to timeline");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let healthStatus: ObjectiveHealthStatus;
  if (obj.hasBlockingDependencies) {
    healthStatus = "BLOCKED";
  } else if (score <= 30) {
    healthStatus = "CRITICAL";
  } else if (score <= 60) {
    healthStatus = "AT_RISK";
  } else {
    healthStatus = "ON_TRACK";
  }

  let recommendedAction: string | null = null;
  if (healthStatus === "BLOCKED") recommendedAction = "Resolve blocking dependencies before continuing";
  else if (healthStatus === "CRITICAL") recommendedAction = "Immediate attention required — escalate or re-scope";
  else if (healthStatus === "AT_RISK") recommendedAction = "Review timeline and resource allocation";

  return { healthStatus, healthScore: score, atRiskReasons: reasons, recommendedAction };
}

/** Derive portfolio decision from health score and objective attributes. */
function derivePortfolioDecision(obj: ObjectivePortfolioInput, healthScore: number): {
  decision: PortfolioDecision;
  rationale: string;
} {
  // ESCALATE: blocked AND imminent deadline
  if (obj.hasBlockingDependencies && obj.deadlineDaysRemaining !== null && obj.deadlineDaysRemaining <= 14) {
    return { decision: "ESCALATE", rationale: `Blocked with ${obj.deadlineDaysRemaining}d until deadline — escalate to resolve blocker` };
  }
  // CANCEL: negligible progress + far past deadline + resources exhausted
  if (
    obj.progressPct < 10 &&
    obj.deadlineDaysRemaining !== null &&
    obj.deadlineDaysRemaining < -30 &&
    obj.resourceBudgetUsedPct >= 80
  ) {
    return { decision: "CANCEL", rationale: "Negligible progress far past deadline with exhausted budget" };
  }
  // SPLIT: high-priority leaf consuming resources with low progress
  if (obj.childCount === 0 && obj.priorityScore >= 80 && obj.resourceBudgetUsedPct >= 70 && obj.progressPct < 30) {
    return { decision: "SPLIT", rationale: "High-priority objective consuming significant resources with low progress — split into sub-objectives" };
  }
  // DELAY: distant deadline and low urgency
  if (obj.deadlineDaysRemaining !== null && obj.deadlineDaysRemaining > 90 && healthScore > 50) {
    return { decision: "DELAY", rationale: "Deadline is distant — defer to focus on more pressing objectives" };
  }
  // EXECUTE_NOW: feasible, unblocked, moderate-to-high urgency
  return { decision: "EXECUTE_NOW", rationale: "Feasible and unblocked — proceed now" };
}

/** Build the full single-workspace objective portfolio view. */
export function buildObjectivePortfolio(
  objectives: ObjectivePortfolioInput[],
): ObjectivePortfolioView {
  // Pass 1: compute health scores
  const scoredObjectives = objectives.map((obj) => ({
    obj,
    ...scoreObjectiveHealth(obj),
  }));

  // Pass 2: MERGE detection — pairs of same-type objectives both struggling
  const typeGroups = new Map<string, typeof scoredObjectives>();
  for (const s of scoredObjectives) {
    const g = typeGroups.get(s.obj.objectiveType) ?? [];
    g.push(s);
    typeGroups.set(s.obj.objectiveType, g);
  }
  const mergeTargets = new Set<string>();
  for (const group of typeGroups.values()) {
    const struggling = group.filter((s) => s.healthScore <= 60 && !s.obj.hasBlockingDependencies);
    if (struggling.length >= 2) {
      struggling.slice(0, 2).forEach((s) => mergeTargets.add(s.obj.objectiveId));
    }
  }

  const items: ObjectivePortfolioItem[] = scoredObjectives.map(({ obj, healthStatus, healthScore, atRiskReasons, recommendedAction }) => {
    let portfolioDecision: PortfolioDecision;
    let portfolioRationale: string;

    if (mergeTargets.has(obj.objectiveId) && !obj.hasBlockingDependencies) {
      portfolioDecision = "MERGE";
      portfolioRationale = "Same-type objective struggling alongside another — merge to consolidate resources";
    } else {
      const derived = derivePortfolioDecision(obj, healthScore);
      portfolioDecision = derived.decision;
      portfolioRationale = derived.rationale;
    }

    return {
      objectiveId: obj.objectiveId,
      parentId: obj.parentId,
      title: obj.title,
      objectiveType: obj.objectiveType,
      status: obj.status,
      healthStatus,
      healthScore,
      priorityScore: obj.priorityScore,
      progressPct: obj.progressPct,
      deadlineDaysRemaining: obj.deadlineDaysRemaining,
      atRiskReasons,
      recommendedAction,
      canStart: !obj.hasBlockingDependencies,
      isLeaf: obj.childCount === 0,
      portfolioDecision,
      portfolioRationale,
    };
  });

  const active = items.filter((i) => i.status === "ACTIVE");
  const completed = items.filter((i) => i.status === "COMPLETED");
  const blocked = items.filter((i) => i.healthStatus === "BLOCKED");
  const critical = items.filter((i) => i.healthStatus === "CRITICAL");
  const atRisk = items.filter((i) => i.healthStatus === "AT_RISK");
  const onTrack = items.filter((i) => i.healthStatus === "ON_TRACK");

  const topPriority = active
    .filter((i) => i.canStart)
    .sort((a, b) => {
      if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore; // worst first = most urgent
      return b.priorityScore - a.priorityScore;
    })[0] ?? null;

  const portfolioHealthScore = active.length === 0
    ? 100
    : Math.round(active.reduce((s, i) => s + i.healthScore, 0) / active.length);

  return {
    items,
    totalActive: active.length,
    totalCompleted: completed.length,
    totalBlocked: blocked.length,
    criticalCount: critical.length,
    atRiskCount: atRisk.length,
    onTrackCount: onTrack.length,
    topPriorityObjectiveId: topPriority?.objectiveId ?? null,
    portfolioHealthScore,
  };
}

// Re-export the audit event key for this module's consumer
export const OBJECTIVE_AUDIT_EVENTS = {
  CREATED: AUDIT_EVENTS.OWNER_OBJECTIVE_CREATED,
  UPDATED: AUDIT_EVENTS.OWNER_OBJECTIVE_UPDATED,
  ACHIEVED: AUDIT_EVENTS.OWNER_OBJECTIVE_ACHIEVED,
  ABANDONED: AUDIT_EVENTS.OWNER_OBJECTIVE_ABANDONED,
} as const;
