/**
 * F5 — Severity scoring (pure).
 *
 * Maps a domain risk signal's severity to its governance effects: priority, owner
 * involvement, proof requirement, escalation, and which downstream actions it blocks
 * (growth/marketing/scale). Reuses the shared TrainingSeverity scale. The blocking
 * rules align with the existing cash-safety / growth-readiness / operational-safety
 * vetoes (F6 aggregates the live gates). Pure + deterministic.
 */

import { type TrainingSeverity, TRAINING_SEVERITY_ORDER } from "@/domain/domain-training/training-types";

export type RiskCategory =
  | "cash" | "compliance" | "safety" | "quality" | "capacity" | "workload" | "retention" | "general";

export interface SeveritySignal {
  severity: TrainingSeverity;
  category: RiskCategory;
}

export function severityRank(s: TrainingSeverity): number {
  return TRAINING_SEVERITY_ORDER.indexOf(s);
}

export function maxSeverity(a: TrainingSeverity, b: TrainingSeverity): TrainingSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export interface SeverityEffects {
  priorityRank: number; // 0 = lowest, 4 = highest
  ownerInvolvementRequired: boolean;
  proofRequired: boolean;
  escalate: boolean;
  blocksGrowth: boolean;
  blocksMarketing: boolean;
  blocksScale: boolean;
}

/** Derive the governance effects of a severity signal. */
export function severityEffects(signal: SeveritySignal): SeverityEffects {
  const rank = severityRank(signal.severity);
  const isCritical = signal.severity === "CRITICAL";
  const isHigh = signal.severity === "HIGH";

  const complianceOrSafety = signal.category === "compliance" || signal.category === "safety";

  return {
    priorityRank: rank,
    ownerInvolvementRequired: rank >= severityRank("HIGH"),
    proofRequired: rank >= severityRank("MEDIUM"),
    // Compliance/safety escalate from HIGH; everything escalates at CRITICAL compliance/safety.
    escalate: complianceOrSafety && rank >= severityRank("HIGH"),
    // Critical cash blocks growth + marketing; critical-anything blocks growth.
    blocksGrowth: isCritical || (isHigh && (signal.category === "capacity" || signal.category === "quality")),
    blocksMarketing:
      (isCritical && (signal.category === "cash" || signal.category === "capacity" || signal.category === "quality"))
      || (isHigh && signal.category === "quality"),
    blocksScale: isHigh || isCritical
      ? signal.category === "quality" || signal.category === "capacity" || signal.category === "workload" || isCritical
      : false,
  };
}

/** Info/low must never over-escalate. */
export function overEscalates(signal: SeveritySignal): boolean {
  const e = severityEffects(signal);
  const low = signal.severity === "INFO" || signal.severity === "LOW";
  return low && (e.escalate || e.ownerInvolvementRequired || e.blocksGrowth || e.blocksMarketing);
}
