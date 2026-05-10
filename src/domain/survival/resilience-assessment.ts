/**
 * Resilience Assessment Domain Contract (Phase 4)
 *
 * Defines resilience scoring framework and assessment structure.
 * Resilience = org's capacity to withstand and recover from survival shocks.
 */

import type { SurvivalFactor } from "@/domain/reality/survival-factors";

export enum ResilienceLevel {
  HIGHLY_RESILIENT = "HIGHLY_RESILIENT",
  RESILIENT = "RESILIENT",
  FRAGILE = "FRAGILE",
  AT_RISK = "AT_RISK",
}

export interface ResilienceAssessment {
  id: string;
  workspaceId: string;
  overallScore: number; // 0-100
  level: ResilienceLevel;
  scoreByCategory: Record<string, number>; // financial, operational, market, strategic
  criticalGaps: string[]; // Areas of weakness
  strengthAreas: string[]; // Areas of strength
  shockAbsorptionCapacity: number; // How many critical factors can be absorbed
  recoveryTimelineDays: number; // Est. days to recover from shock
  assessedAt: Date;
  assessedBy: string; // User ID who triggered assessment
}

export interface ResilienceBreakdown {
  category: string;
  score: number;
  level: ResilienceLevel;
  healthyFactors: SurvivalFactor[];
  warningFactors: SurvivalFactor[];
  criticalFactors: SurvivalFactor[];
}

export interface ResilienceTrend {
  assessmentId: string;
  overallScore: number;
  timestamp: Date;
  changeFromPrevious: number; // Score delta
  direction: "improving" | "stable" | "declining";
}

/**
 * Resilience assessment rules (hard thresholds)
 */
export const RESILIENCE_THRESHOLDS = {
  HIGHLY_RESILIENT: { min: 80, max: 100 },
  RESILIENT: { min: 60, max: 79 },
  FRAGILE: { min: 40, max: 59 },
  AT_RISK: { min: 0, max: 39 },
};

/**
 * Shock absorption capacity by resilience level
 */
export const SHOCK_ABSORPTION_BY_LEVEL: Record<ResilienceLevel, number> = {
  [ResilienceLevel.HIGHLY_RESILIENT]: 3, // Can absorb 3+ critical factors
  [ResilienceLevel.RESILIENT]: 2,
  [ResilienceLevel.FRAGILE]: 1,
  [ResilienceLevel.AT_RISK]: 0, // Already at capacity
};

/**
 * Validate resilience level matches score
 */
export function validateResilienceLevel(
  score: number,
  level: ResilienceLevel
): boolean {
  const threshold = RESILIENCE_THRESHOLDS[level];
  return score >= threshold.min && score <= threshold.max;
}

/**
 * Get shock absorption capacity from score
 */
export function getShockCapacityFromScore(score: number): number {
  if (score >= 80) return SHOCK_ABSORPTION_BY_LEVEL[ResilienceLevel.HIGHLY_RESILIENT];
  if (score >= 60) return SHOCK_ABSORPTION_BY_LEVEL[ResilienceLevel.RESILIENT];
  if (score >= 40) return SHOCK_ABSORPTION_BY_LEVEL[ResilienceLevel.FRAGILE];
  return SHOCK_ABSORPTION_BY_LEVEL[ResilienceLevel.AT_RISK];
}

/**
 * Estimate recovery days based on resilience
 * Lower resilience = longer recovery
 */
export function estimateRecoveryDays(
  resilienceScore: number,
  criticalFactorCount: number = 0
): number {
  const baseRecovery = 90 + criticalFactorCount * 30;
  const recoveryFactor = (100 - resilienceScore) / 50; // 0.2x to 2x
  return Math.round(baseRecovery * recoveryFactor);
}
