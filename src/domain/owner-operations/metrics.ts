/**
 * Owner Operations (Module 4) — deterministic operations calculation engine.
 *
 * Pure functions only (no DB/I/O/LLM). Ratio/per-unit metrics return `null` when
 * not computable from the provided inputs; nothing is invented. Composite scores
 * are bounded 0..100. Operations is the EXECUTION lens (throughput, delay,
 * rework, capacity, delivery, SOP compliance), distinct from survival/growth.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type {
  OperationsSnapshotInput,
  OperationsDerivedMetrics,
  OperationsState,
  OperationsTier,
} from "./types";
import { resolveOperationsThresholds, type OperationsThresholds } from "./thresholds";
import { calculateDataConfidence, isValidCurrency } from "./data-confidence";

// --- safe numeric helpers ----------------------------------------------------

/** Present finite number, else null (fail closed on NaN/Infinity/missing). */
export function num(x: number | undefined | null): number | null {
  if (x === undefined || x === null || !Number.isFinite(x)) return null;
  return x;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// --- throughput --------------------------------------------------------------

export function completionRatePct(input: OperationsSnapshotInput): number | null {
  const received = num(input.ordersReceived);
  const completed = num(input.ordersCompleted);
  if (received === null || completed === null || received <= 0) return null;
  return round1((completed / received) * 100);
}

export function delayRatePct(input: OperationsSnapshotInput): number | null {
  const received = num(input.ordersReceived);
  const delayed = num(input.ordersDelayed);
  if (received === null || delayed === null || received <= 0) return null;
  return round1((delayed / received) * 100);
}

// --- quality -----------------------------------------------------------------

export function reworkRatePct(input: OperationsSnapshotInput): number | null {
  const completed = num(input.ordersCompleted);
  const rework = num(input.reworkCount);
  if (completed === null || rework === null || completed <= 0) return null;
  return round1((rework / completed) * 100);
}

export function complaintRatePct(input: OperationsSnapshotInput): number | null {
  const completed = num(input.ordersCompleted);
  const complaints = num(input.complaints);
  if (completed === null || complaints === null || completed <= 0) return null;
  return round1((complaints / completed) * 100);
}

// --- capacity / labour -------------------------------------------------------

export function capacityUtilizationPct(input: OperationsSnapshotInput): number | null {
  const received = num(input.ordersReceived);
  const capacity = num(input.machineCapacityUnits);
  if (received === null || capacity === null || capacity <= 0) return null;
  return round1((received / capacity) * 100);
}

export function ordersPerStaffHour(input: OperationsSnapshotInput): number | null {
  const completed = num(input.ordersCompleted);
  const hours = num(input.staffHours);
  if (completed === null || hours === null || hours <= 0) return null;
  return round1(completed / hours);
}

export function idleRatePct(input: OperationsSnapshotInput): number | null {
  const idle = num(input.idleHours);
  const hours = num(input.staffHours);
  if (idle === null || hours === null || hours <= 0) return null;
  return round1((idle / hours) * 100);
}

// --- delivery / process ------------------------------------------------------

export function deliverySuccessRatePct(input: OperationsSnapshotInput): number | null {
  const failures = num(input.deliveryFailures);
  const base = num(input.deliveryAttempts) ?? num(input.ordersCompleted);
  if (failures === null || base === null || base <= 0) return null;
  return clampScore(round1(((base - failures) / base) * 100));
}

export function sopCompliancePct(input: OperationsSnapshotInput): number | null {
  const checks = num(input.sopChecks);
  const misses = num(input.sopMisses);
  if (checks === null || misses === null || checks <= 0) return null;
  return clampScore(round1(((checks - misses) / checks) * 100));
}

export function inventoryShortageCount(input: OperationsSnapshotInput): number | null {
  return num(input.inventoryShortages);
}

// --- risk signals ------------------------------------------------------------

interface OperationsRiskSignals {
  lowCompletion: boolean;
  criticalCompletion: boolean;
  highDelay: boolean;
  criticalDelay: boolean;
  highRework: boolean;
  criticalRework: boolean;
  highComplaint: boolean;
  capacityStrained: boolean;
  overCapacity: boolean;
  lowDelivery: boolean;
  criticalDelivery: boolean;
  lowSop: boolean;
  criticalSop: boolean;
  highIdle: boolean;
  inventoryShortage: boolean;
}

function deriveRiskSignals(
  input: OperationsSnapshotInput,
  t: OperationsThresholds
): OperationsRiskSignals {
  const completion = completionRatePct(input);
  const delay = delayRatePct(input);
  const rework = reworkRatePct(input);
  const complaint = complaintRatePct(input);
  const cap = capacityUtilizationPct(input);
  const delivery = deliverySuccessRatePct(input);
  const sop = sopCompliancePct(input);
  const idle = idleRatePct(input);
  const shortages = inventoryShortageCount(input);
  return {
    lowCompletion: completion !== null && completion < t.lowCompletionRatePct,
    criticalCompletion: completion !== null && completion < t.criticalCompletionRatePct,
    highDelay: delay !== null && delay > t.highDelayRatePct,
    criticalDelay: delay !== null && delay > t.criticalDelayRatePct,
    highRework: rework !== null && rework > t.highReworkRatePct,
    criticalRework: rework !== null && rework > t.criticalReworkRatePct,
    highComplaint: complaint !== null && complaint > t.highComplaintRatePct,
    capacityStrained: cap !== null && cap > t.highCapacityUtilizationPct,
    overCapacity: cap !== null && cap > t.criticalCapacityUtilizationPct,
    lowDelivery: delivery !== null && delivery < t.lowDeliverySuccessRatePct,
    criticalDelivery: delivery !== null && delivery < t.criticalDeliverySuccessRatePct,
    lowSop: sop !== null && sop < t.lowSopCompliancePct,
    criticalSop: sop !== null && sop < t.criticalSopCompliancePct,
    highIdle: idle !== null && idle > t.highIdleRatePct,
    inventoryShortage: shortages !== null && shortages > 0,
  };
}

// --- composite scores --------------------------------------------------------

export function operationsRiskScore(input: OperationsSnapshotInput, t: OperationsThresholds): number {
  const s = deriveRiskSignals(input, t);
  let score = 0;
  if (s.criticalCompletion) score += 25;
  else if (s.lowCompletion) score += 12;
  if (s.criticalDelay) score += 18;
  else if (s.highDelay) score += 9;
  if (s.criticalRework) score += 18;
  else if (s.highRework) score += 9;
  if (s.overCapacity) score += 20;
  else if (s.capacityStrained) score += 10;
  if (s.criticalDelivery) score += 15;
  else if (s.lowDelivery) score += 8;
  if (s.criticalSop) score += 15;
  else if (s.lowSop) score += 8;
  if (s.highComplaint) score += 10;
  if (s.highIdle) score += 8;
  if (s.inventoryShortage) score += 6;
  return clampScore(score);
}

export function operationsHealthScore(
  input: OperationsSnapshotInput,
  t: OperationsThresholds
): number {
  const risk = operationsRiskScore(input, t);
  const completion = completionRatePct(input);
  // Completion health maps the completion rate (0..100%) directly onto 0..100.
  let throughput = 50;
  if (completion !== null) throughput = clampScore(completion);
  return clampScore(Math.round(0.6 * (100 - risk) + 0.4 * throughput));
}

export function operationsOpportunityScore(
  input: OperationsSnapshotInput,
  t: OperationsThresholds
): number {
  let score = 0;
  const delay = delayRatePct(input);
  if (delay !== null) score += Math.min(delay, 25); // recoverable delayed throughput
  const rework = reworkRatePct(input);
  if (rework !== null) score += Math.min(rework * 2, 25); // recoverable rework
  const idle = idleRatePct(input);
  if (idle !== null) score += Math.min(idle, 20); // reclaimable idle capacity
  const sop = sopCompliancePct(input);
  if (sop !== null && sop < 100) score += Math.min((100 - sop) / 2, 15); // SOP gap to close
  const cap = capacityUtilizationPct(input);
  if (cap !== null && cap < t.highCapacityUtilizationPct) {
    score += Math.min((t.highCapacityUtilizationPct - cap) / 4, 10); // spare capacity headroom
  }
  return clampScore(score);
}

// --- operations state --------------------------------------------------------

export function operationsState(
  input: OperationsSnapshotInput,
  t: OperationsThresholds,
  dataConfidenceScore: number
): OperationsState {
  const s = deriveRiskSignals(input, t);

  if (s.overCapacity && (s.criticalCompletion || s.criticalDelay)) return "OVERLOADED";
  if (s.overCapacity || s.criticalCompletion || s.criticalDelay || s.criticalRework || s.criticalDelivery) {
    return "BOTTLENECKED";
  }
  // Not enough trustworthy data to assert smooth running → caution.
  if (dataConfidenceScore < 50) return "STRAINED";
  if (
    s.lowCompletion ||
    s.highDelay ||
    s.highRework ||
    s.capacityStrained ||
    s.lowDelivery ||
    s.lowSop ||
    s.highComplaint ||
    s.highIdle ||
    s.inventoryShortage
  ) {
    return "STRAINED";
  }
  const completion = completionRatePct(input);
  return completion === null || completion >= t.healthyCompletionRatePct ? "SMOOTH" : "STEADY";
}

export function operationsTier(state: OperationsState): OperationsTier {
  switch (state) {
    case "OVERLOADED":
      return "rescue";
    case "BOTTLENECKED":
      return "recovery";
    case "STRAINED":
    case "STEADY":
      return "growth";
    case "SMOOTH":
      return "optimization";
  }
}

// --- orchestrator ------------------------------------------------------------

/**
 * Compute the full deterministic operations metric set for one snapshot. Does not
 * mutate `input`. Missing/invalid inputs yield `null` metrics + a missing-input
 * list; composite scores stay 0..100 with confidence reflecting completeness.
 */
export function computeOperationsMetrics(
  input: OperationsSnapshotInput,
  opts: { now?: Date } = {}
): OperationsDerivedMetrics {
  const t = resolveOperationsThresholds(input.industryTemplate);
  const confidence = calculateDataConfidence(input, {
    now: opts.now,
    staleDays: t.staleSnapshotDays,
  });
  const state = operationsState(input, t, confidence.dataConfidenceScore);

  return {
    currency: input.currency,
    currencyValid: isValidCurrency(input.currency),

    completionRatePct: completionRatePct(input),
    delayRatePct: delayRatePct(input),
    reworkRatePct: reworkRatePct(input),
    complaintRatePct: complaintRatePct(input),
    capacityUtilizationPct: capacityUtilizationPct(input),
    ordersPerStaffHour: ordersPerStaffHour(input),
    deliverySuccessRatePct: deliverySuccessRatePct(input),
    sopCompliancePct: sopCompliancePct(input),
    idleRatePct: idleRatePct(input),
    inventoryShortageCount: inventoryShortageCount(input),

    operationsHealthScore: operationsHealthScore(input, t),
    operationsRiskScore: operationsRiskScore(input, t),
    operationsOpportunityScore: operationsOpportunityScore(input, t),
    dataConfidenceScore: confidence.dataConfidenceScore,

    operationsState: state,
    operationsTier: operationsTier(state),

    missingRequiredInputs: confidence.missingCritical,
  };
}
