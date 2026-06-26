/**
 * Operational capacity & burden control (Slice 19, pure logic).
 *
 * Prevents unrealistic assignments. AI/automation must not suggest
 * same-day/express/customer-promise tasks unless capacity is GREEN or an
 * owner/manager exception is granted. Proof burden scales with risk: routine
 * low-risk work uses minimal proof; high-risk work (complaint / lost-or-damaged /
 * payment) requires stronger proof.
 */

import { ProofRiskLevel } from "@/domain/execution/proof";

export enum CapacityStatus {
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  RED = "RED",
  UNKNOWN = "UNKNOWN",
}

export enum BurdenLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum ProofBurden {
  MINIMAL = "MINIMAL",
  STANDARD = "STANDARD",
  STRONG = "STRONG",
}

/** Documented factor sets (used by callers to build `utilizations`). */
export const LAUNDRY_CAPACITY_FACTORS = [
  "machine", "dryer", "pressing", "runner", "delivery_slots",
  "staff_coverage", "chemical_stock", "pending_backlog", "express_orders",
] as const;

export const HOUSEKEEPING_CAPACITY_FACTORS = [
  "cleaner_availability", "team_size", "travel_time", "job_duration",
  "materials", "supervisor_availability", "recurring_commitments", "customer_deadline",
] as const;

export interface CapacityInput {
  /** Per-factor utilization 0..1+ (1 = fully utilized). */
  utilizations: number[];
  /** Any required factor's value is unknown. */
  anyUnknown?: boolean;
}

export function computeCapacityStatus(input: CapacityInput): CapacityStatus {
  if (input.anyUnknown || input.utilizations.length === 0) {
    return CapacityStatus.UNKNOWN;
  }
  const max = Math.max(...input.utilizations);
  if (max >= 1) return CapacityStatus.RED;
  if (max >= 0.8) return CapacityStatus.YELLOW;
  return CapacityStatus.GREEN;
}

export function computeBurdenLevel(input: CapacityInput): BurdenLevel {
  if (input.anyUnknown || input.utilizations.length === 0) return BurdenLevel.HIGH;
  const max = Math.max(...input.utilizations);
  if (max >= 1) return BurdenLevel.CRITICAL;
  if (max >= 0.8) return BurdenLevel.HIGH;
  if (max >= 0.5) return BurdenLevel.MEDIUM;
  return BurdenLevel.LOW;
}

export interface ExpressDecision {
  allowed: boolean;
  needsOwnerApproval: boolean;
  reason: string;
}

/**
 * Whether a same-day/express/customer-promise task may proceed. Allowed only on
 * GREEN capacity or with an explicit owner/manager exception; UNKNOWN/YELLOW/RED
 * require approval (fail-closed).
 */
export function evaluateExpressRequest(
  status: CapacityStatus,
  ownerOrManagerException = false
): ExpressDecision {
  if (status === CapacityStatus.GREEN) {
    return { allowed: true, needsOwnerApproval: false, reason: "Capacity is GREEN." };
  }
  if (ownerOrManagerException) {
    return { allowed: true, needsOwnerApproval: false, reason: "Owner/manager exception granted." };
  }
  if (status === CapacityStatus.UNKNOWN) {
    return {
      allowed: false,
      needsOwnerApproval: true,
      reason: "Capacity is UNKNOWN — owner/manager approval required for express work.",
    };
  }
  return {
    allowed: false,
    needsOwnerApproval: true,
    reason: `Capacity is ${status} — express work requires owner/manager approval.`,
  };
}

/** High-risk task categories that always require stronger proof. */
export const HIGH_RISK_TASK_KINDS: ReadonlySet<string> = new Set([
  "customer_complaint",
  "lost_or_damaged_item",
  "payment_issue",
  "refund_request",
]);

export function proofBurdenForRisk(risk: ProofRiskLevel): ProofBurden {
  switch (risk) {
    case ProofRiskLevel.HIGH:
      return ProofBurden.STRONG;
    case ProofRiskLevel.MEDIUM:
      return ProofBurden.STANDARD;
    case ProofRiskLevel.LOW:
    default:
      return ProofBurden.MINIMAL;
  }
}

/** Proof burden for a task by its kind + risk: high-risk kinds force STRONG. */
export function proofBurdenForTask(kind: string, risk: ProofRiskLevel): ProofBurden {
  if (HIGH_RISK_TASK_KINDS.has(kind)) return ProofBurden.STRONG;
  return proofBurdenForRisk(risk);
}
