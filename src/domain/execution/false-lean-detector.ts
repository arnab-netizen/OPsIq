/**
 * Module 11 — False Lean Detector (pure domain core).
 *
 * Explicitly detects actions that LOOK efficient but damage profit, people,
 * quality, or scalability. Hard rule: false lean must be rejected or redesigned,
 * NEVER approved. Complements Module 7's classifyLean by naming the concrete
 * anti-patterns the spec enumerates, each from deterministic signals.
 */

export enum FalseLeanPattern {
  STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION = "STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION",
  GROWTH_WITHOUT_CAPACITY = "GROWTH_WITHOUT_CAPACITY",
  DISCOUNT_WITHOUT_MARGIN_PROOF = "DISCOUNT_WITHOUT_MARGIN_PROOF",
  QUALITY_CHECK_REMOVAL_UNSTABLE = "QUALITY_CHECK_REMOVAL_UNSTABLE",
  OWNER_LABOUR_SUBSTITUTION = "OWNER_LABOUR_SUBSTITUTION",
  INVENTORY_BELOW_SAFE_MINIMUM = "INVENTORY_BELOW_SAFE_MINIMUM",
  DELAYED_SUPPLIER_PAYMENT_SERVICE_RISK = "DELAYED_SUPPLIER_PAYMENT_SERVICE_RISK",
  LOW_MARGIN_BLOCKING_HIGH_MARGIN = "LOW_MARGIN_BLOCKING_HIGH_MARGIN",
  AUTOMATION_OF_BROKEN_PROCESS = "AUTOMATION_OF_BROKEN_PROCESS",
  FULL_UTILIZATION_PLANNING = "FULL_UTILIZATION_PLANNING",
}

/** Patterns that must be outright rejected vs. those that may be redesigned. */
const REJECT_PATTERNS: ReadonlySet<FalseLeanPattern> = new Set([
  FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION,
  FalseLeanPattern.GROWTH_WITHOUT_CAPACITY,
  FalseLeanPattern.DISCOUNT_WITHOUT_MARGIN_PROOF,
  FalseLeanPattern.QUALITY_CHECK_REMOVAL_UNSTABLE,
  FalseLeanPattern.OWNER_LABOUR_SUBSTITUTION,
  FalseLeanPattern.INVENTORY_BELOW_SAFE_MINIMUM,
  FalseLeanPattern.DELAYED_SUPPLIER_PAYMENT_SERVICE_RISK,
  FalseLeanPattern.FULL_UTILIZATION_PLANNING,
]);
// LOW_MARGIN_BLOCKING_HIGH_MARGIN and AUTOMATION_OF_BROKEN_PROCESS are redesignable.

export interface FalseLeanSignals {
  staffReduced?: boolean;
  workloadReduced?: boolean;
  orderGrowthPlanned?: boolean;
  capacityHeadroom?: boolean;
  discountProposed?: boolean;
  marginProofProvided?: boolean;
  qualityChecksRemoved?: boolean;
  defectRateStable?: boolean;
  ownerAbsorbingWork?: boolean;
  inventoryBelowSafeMin?: boolean;
  supplierPaymentDelayed?: boolean;
  supplierServiceAtRisk?: boolean;
  lowMarginConsumingBottleneck?: boolean;
  higherMarginDisplaced?: boolean;
  automationProposed?: boolean;
  processStable?: boolean;
  /** Planned steady-state utilization as a fraction; >= 1.0 is 100% planning. */
  plannedUtilizationPct?: number;
}

export type FalseLeanVerdict = "REJECT" | "REDESIGN" | "CLEAN";

export interface FalseLeanResult {
  patterns: FalseLeanPattern[];
  verdict: FalseLeanVerdict;
  /** Never true when any pattern is detected (false lean is never approved). */
  approvable: boolean;
}

/** Detect false-lean patterns from explicit signals. */
export function detectFalseLean(s: FalseLeanSignals): FalseLeanResult {
  const patterns: FalseLeanPattern[] = [];

  if (s.staffReduced && !s.workloadReduced) patterns.push(FalseLeanPattern.STAFF_CUT_WITHOUT_WORKLOAD_REDUCTION);
  if (s.orderGrowthPlanned && !s.capacityHeadroom) patterns.push(FalseLeanPattern.GROWTH_WITHOUT_CAPACITY);
  if (s.discountProposed && !s.marginProofProvided) patterns.push(FalseLeanPattern.DISCOUNT_WITHOUT_MARGIN_PROOF);
  if (s.qualityChecksRemoved && !s.defectRateStable) patterns.push(FalseLeanPattern.QUALITY_CHECK_REMOVAL_UNSTABLE);
  if (s.ownerAbsorbingWork) patterns.push(FalseLeanPattern.OWNER_LABOUR_SUBSTITUTION);
  if (s.inventoryBelowSafeMin) patterns.push(FalseLeanPattern.INVENTORY_BELOW_SAFE_MINIMUM);
  if (s.supplierPaymentDelayed && s.supplierServiceAtRisk) patterns.push(FalseLeanPattern.DELAYED_SUPPLIER_PAYMENT_SERVICE_RISK);
  if (s.lowMarginConsumingBottleneck && s.higherMarginDisplaced) patterns.push(FalseLeanPattern.LOW_MARGIN_BLOCKING_HIGH_MARGIN);
  if (s.automationProposed && !s.processStable) patterns.push(FalseLeanPattern.AUTOMATION_OF_BROKEN_PROCESS);
  if (typeof s.plannedUtilizationPct === "number" && s.plannedUtilizationPct >= 1.0) patterns.push(FalseLeanPattern.FULL_UTILIZATION_PLANNING);

  let verdict: FalseLeanVerdict = "CLEAN";
  if (patterns.some((p) => REJECT_PATTERNS.has(p))) verdict = "REJECT";
  else if (patterns.length > 0) verdict = "REDESIGN";

  return { patterns, verdict, approvable: patterns.length === 0 };
}
