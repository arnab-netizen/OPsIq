/**
 * F14 — Unsafe recommendation taxonomy (pure).
 *
 * The 15 unsafe classes a recommendation must be screened against. Extends the M34
 * negative-recommendation / false-lean-detector coverage. Detection is signal-driven
 * and cannot be overridden by owner preference (no such input). Pure + deterministic.
 */

export enum UnsafeClass {
  CASH_DESTRUCTIVE = "CASH_DESTRUCTIVE",
  PROFIT_BLIND_REVENUE = "PROFIT_BLIND_REVENUE",
  COMPLIANCE_RISK = "COMPLIANCE_RISK",
  STAFF_OVERLOAD = "STAFF_OVERLOAD",
  OWNER_OVERLOAD = "OWNER_OVERLOAD",
  QUALITY_DAMAGING = "QUALITY_DAMAGING",
  CAPACITY_BLIND_GROWTH = "CAPACITY_BLIND_GROWTH",
  FALSE_COMPLETION_ACCEPTANCE = "FALSE_COMPLETION_ACCEPTANCE",
  UNVERIFIED_LEARNING_ADMISSION = "UNVERIFIED_LEARNING_ADMISSION",
  GENERIC_NON_EXECUTABLE = "GENERIC_NON_EXECUTABLE",
  VANITY_METRIC_OPTIMIZATION = "VANITY_METRIC_OPTIMIZATION",
  OVERCONFIDENT_LOW_DATA = "OVERCONFIDENT_LOW_DATA",
  EXPANSION_BEFORE_PROOF = "EXPANSION_BEFORE_PROOF",
  DISCOUNT_BELOW_MARGIN = "DISCOUNT_BELOW_MARGIN",
  HIRING_BEFORE_WORKLOAD_PROOF = "HIRING_BEFORE_WORKLOAD_PROOF",
}

/** One boolean signal per unsafe class. */
export interface UnsafeSignals {
  cashDestructive: boolean;
  profitBlindRevenue: boolean;
  complianceRisk: boolean;
  staffOverload: boolean;
  ownerOverload: boolean;
  qualityDamaging: boolean;
  capacityBlindGrowth: boolean;
  falseCompletionAcceptance: boolean;
  unverifiedLearningAdmission: boolean;
  genericNonExecutable: boolean;
  vanityMetricOptimization: boolean;
  overconfidentLowData: boolean;
  expansionBeforeProof: boolean;
  discountBelowMargin: boolean;
  hiringBeforeWorkloadProof: boolean;
}

const SIGNAL_TO_CLASS: ReadonlyArray<[keyof UnsafeSignals, UnsafeClass]> = [
  ["cashDestructive", UnsafeClass.CASH_DESTRUCTIVE],
  ["profitBlindRevenue", UnsafeClass.PROFIT_BLIND_REVENUE],
  ["complianceRisk", UnsafeClass.COMPLIANCE_RISK],
  ["staffOverload", UnsafeClass.STAFF_OVERLOAD],
  ["ownerOverload", UnsafeClass.OWNER_OVERLOAD],
  ["qualityDamaging", UnsafeClass.QUALITY_DAMAGING],
  ["capacityBlindGrowth", UnsafeClass.CAPACITY_BLIND_GROWTH],
  ["falseCompletionAcceptance", UnsafeClass.FALSE_COMPLETION_ACCEPTANCE],
  ["unverifiedLearningAdmission", UnsafeClass.UNVERIFIED_LEARNING_ADMISSION],
  ["genericNonExecutable", UnsafeClass.GENERIC_NON_EXECUTABLE],
  ["vanityMetricOptimization", UnsafeClass.VANITY_METRIC_OPTIMIZATION],
  ["overconfidentLowData", UnsafeClass.OVERCONFIDENT_LOW_DATA],
  ["expansionBeforeProof", UnsafeClass.EXPANSION_BEFORE_PROOF],
  ["discountBelowMargin", UnsafeClass.DISCOUNT_BELOW_MARGIN],
  ["hiringBeforeWorkloadProof", UnsafeClass.HIRING_BEFORE_WORKLOAD_PROOF],
];

/** Detect all unsafe classes triggered by the signals. */
export function detectUnsafe(signals: UnsafeSignals): UnsafeClass[] {
  return SIGNAL_TO_CLASS.filter(([k]) => signals[k] === true).map(([, c]) => c);
}

export function isUnsafe(signals: UnsafeSignals): boolean {
  return detectUnsafe(signals).length > 0;
}

export const NO_UNSAFE_SIGNALS: UnsafeSignals = {
  cashDestructive: false, profitBlindRevenue: false, complianceRisk: false, staffOverload: false,
  ownerOverload: false, qualityDamaging: false, capacityBlindGrowth: false, falseCompletionAcceptance: false,
  unverifiedLearningAdmission: false, genericNonExecutable: false, vanityMetricOptimization: false,
  overconfidentLowData: false, expansionBeforeProof: false, discountBelowMargin: false, hiringBeforeWorkloadProof: false,
};
