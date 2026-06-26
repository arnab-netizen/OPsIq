/**
 * Module 7 — Lean Profitability & Workload Guardrail (pure domain core).
 *
 * Forces every "lean"/efficiency recommendation to balance profit, waste, capacity,
 * quality, customer value, and — critically — employee AND owner workload. Encodes
 * the hard rules so false lean cannot be approved:
 *   - Cost cutting is not lean unless workload + quality are protected.
 *   - Growth is not lean unless capacity + cash are safe.
 *   - Owner labour is not free; staff overload is not efficiency.
 *   - Removing quality checks is not allowed unless the defect rate is stable.
 *
 * Reuses LeanClassification (Module 1) — no duplicate enum. Pure + deterministic;
 * scoring inputs are 0..1 (benefits higher-better, risks higher-worse).
 */

import { LeanClassification } from "@/domain/business-impact/recommendation-business-impact";

export { LeanClassification };

export interface LeanScoringInput {
  // Benefit scores (0..1, higher is better)
  profitImpact: number;
  cashImpact: number;
  wasteReduction: number;
  capacityImpact: number;
  qualityImpact: number;
  customerValue: number;
  // Risk scores (0..1, higher is worse)
  employeeWorkloadRisk: number;
  ownerWorkloadRisk: number;
  reworkRisk: number;
  complaintRisk: number;
  executionComplexityRisk: number;
  // Hard-stop signals
  dataSufficient: boolean;
  cashUnsafe?: boolean;
  growthWithoutCapacity?: boolean;
  qualityChecksRemoved?: boolean;
  defectRateStable?: boolean;
}

/** Risk at or above this is "high" (overburden / unacceptable). */
export const HIGH_RISK = 0.7;
/** Risk at or above this is "elevated" (monitoring / redesign territory). */
export const ELEVATED_RISK = 0.4;

export interface LeanClassificationResult {
  classification: LeanClassification;
  blockedReasons: string[];
  /** Concerns to monitor if approved-with-monitoring. */
  monitoring: string[];
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 1);
}

/**
 * Classify a lean/efficiency action. Fail-closed precedence: insufficient data >
 * cash-unsafe > growth-without-capacity > workload overburden / quality removal
 * (false lean) > rework/complaint redesign > monitoring > approved.
 */
export function classifyLean(input: LeanScoringInput): LeanClassificationResult {
  const blockedReasons: string[] = [];
  const monitoring: string[] = [];

  if (!input.dataSufficient) {
    return { classification: LeanClassification.DATA_INSUFFICIENT, blockedReasons: ["Insufficient data to assess lean safety."], monitoring };
  }
  if (input.cashUnsafe) {
    return { classification: LeanClassification.CASH_UNSAFE_REJECTED, blockedReasons: ["Cash survival is unsafe; cannot pursue."], monitoring };
  }
  if (input.growthWithoutCapacity) {
    return { classification: LeanClassification.GROWTH_UNSAFE, blockedReasons: ["Growth without sufficient capacity."], monitoring };
  }

  const empRisk = clamp01(input.employeeWorkloadRisk);
  const ownRisk = clamp01(input.ownerWorkloadRisk);
  const waste = clamp01(input.wasteReduction);
  const capacity = clamp01(input.capacityImpact);

  // False lean: staff/owner overburden not offset by real waste reduction or freed capacity.
  const overburden = empRisk >= HIGH_RISK || ownRisk >= HIGH_RISK;
  const offset = waste >= 0.5 || capacity >= 0.5;
  if (overburden && !offset) {
    if (empRisk >= HIGH_RISK) blockedReasons.push("Employee workload overburden not offset by waste/capacity gains.");
    if (ownRisk >= HIGH_RISK) blockedReasons.push("Owner workload overburden (owner labour is not free).");
    return { classification: LeanClassification.FALSE_LEAN_REJECTED, blockedReasons, monitoring };
  }

  // Quality-check removal is only allowed when the defect rate is stable.
  if (input.qualityChecksRemoved && !input.defectRateStable) {
    blockedReasons.push("Quality checks removed while defect rate is not stable.");
    return { classification: LeanClassification.FALSE_LEAN_REJECTED, blockedReasons, monitoring };
  }

  // Rework / complaint risk high → redesign before pursuing.
  if (clamp01(input.reworkRisk) >= HIGH_RISK || clamp01(input.complaintRisk) >= HIGH_RISK) {
    blockedReasons.push("Rework/complaint risk too high; redesign required.");
    return { classification: LeanClassification.LEAN_REDESIGN_REQUIRED, blockedReasons, monitoring };
  }

  // Elevated (but not high) risks → approve with monitoring.
  if (empRisk >= ELEVATED_RISK) monitoring.push("employee workload");
  if (ownRisk >= ELEVATED_RISK) monitoring.push("owner workload");
  if (clamp01(input.reworkRisk) >= ELEVATED_RISK) monitoring.push("rework risk");
  if (clamp01(input.complaintRisk) >= ELEVATED_RISK) monitoring.push("complaint risk");
  if (clamp01(input.executionComplexityRisk) >= HIGH_RISK) monitoring.push("execution complexity");

  if (monitoring.length > 0) {
    return { classification: LeanClassification.LEAN_APPROVED_WITH_MONITORING, blockedReasons, monitoring };
  }
  return { classification: LeanClassification.LEAN_APPROVED, blockedReasons, monitoring };
}

/** A lean classification that permits proceeding (with or without monitoring). */
export function isLeanApproved(c: LeanClassification): boolean {
  return c === LeanClassification.LEAN_APPROVED || c === LeanClassification.LEAN_APPROVED_WITH_MONITORING;
}
