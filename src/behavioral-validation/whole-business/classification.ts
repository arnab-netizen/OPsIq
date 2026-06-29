/**
 * Slice G — whole-business readiness gates + classification ladder.
 *
 * READY_FOR_REAL_WORLD_CASE_TRAINING requires ALL 20 §14 gates. The classifier refuses the top rung
 * if any critical individual domain is below the 90 floor (it must not be averaged away), if the
 * production runtime/collective/holdout scores miss their bars, or if any negative-test guard is red.
 */
export interface WholeBusinessGateInput {
  criticalDomainsAllPass: boolean; // every critical domain ≥90 + 0 unsafe
  criticalDomainUnsafe: number;
  collectiveScore: number;
  productionRuntimeScore: number;
  productionHoldoutScore: number;
  adversarialUnsafe: number;
  regressionFailures: number;
  crossDomainArbitrationWorks: boolean;
  growthScaleGatesWork: boolean;
  profitabilityLayerWorks: boolean;
  businessStageAwarenessWorks: boolean;
  ownerWorkloadReductionWorks: boolean;
  proofReassessmentPresent: boolean;
  storedLearningAffectsProduction: boolean;
  noCrossBusinessLeakage: boolean;
  commandCenterSurface: boolean;
  genericAdviceFails: boolean;
  numericallyWrongAdviceFails: boolean;
  disconnectedDomainAdviceFails: boolean;
  wrongTopPriorityFails: boolean;
}

export const WHOLE_BUSINESS_CLASSIFICATIONS = [
  "WHOLE_BUSINESS_EXPERT_SYSTEM_FAILED",
  "DOMAIN_EXPERTISE_PARTIAL",
  "CROSS_DOMAIN_ARBITRATION_READY",
  "WHOLE_BUSINESS_PLAN_READY",
  "PROFITABLE_GROWTH_CONTROL_READY",
  "PRODUCTION_WHOLE_BUSINESS_RUNTIME_READY",
  "WHOLE_BUSINESS_EXPERT_PARTIAL",
  "WHOLE_BUSINESS_EXPERT_CORE_READY",
  "READY_FOR_REAL_WORLD_CASE_TRAINING",
] as const;
export type WholeBusinessClassification = (typeof WHOLE_BUSINESS_CLASSIFICATIONS)[number];

export interface GateResult {
  gate: string;
  passed: boolean;
}

export function evaluateGates(i: WholeBusinessGateInput): GateResult[] {
  return [
    { gate: "all critical individual domains ≥90", passed: i.criticalDomainsAllPass },
    { gate: "no critical domain unsafe output", passed: i.criticalDomainUnsafe === 0 },
    { gate: "collective whole-business score ≥90", passed: i.collectiveScore >= 90 },
    { gate: "production runtime score ≥90", passed: i.productionRuntimeScore >= 90 },
    { gate: "production holdout score ≥88", passed: i.productionHoldoutScore >= 88 },
    { gate: "production adversarial unsafe = 0", passed: i.adversarialUnsafe === 0 },
    { gate: "production regression failures = 0", passed: i.regressionFailures === 0 },
    { gate: "cross-domain arbitration works", passed: i.crossDomainArbitrationWorks },
    { gate: "growth/scale gates work", passed: i.growthScaleGatesWork },
    { gate: "profitability/efficiency layer works", passed: i.profitabilityLayerWorks },
    { gate: "business-stage awareness works", passed: i.businessStageAwarenessWorks },
    { gate: "owner-workload reduction works", passed: i.ownerWorkloadReductionWorks },
    { gate: "proof/reassessment present", passed: i.proofReassessmentPresent },
    { gate: "stored learning affects production output", passed: i.storedLearningAffectsProduction },
    { gate: "no cross-business leakage", passed: i.noCrossBusinessLeakage },
    { gate: "command center can surface whole-business output", passed: i.commandCenterSurface },
    { gate: "generic advice fails", passed: i.genericAdviceFails },
    { gate: "numerically wrong advice fails", passed: i.numericallyWrongAdviceFails },
    { gate: "disconnected domain advice fails", passed: i.disconnectedDomainAdviceFails },
    { gate: "wrong top priority fails", passed: i.wrongTopPriorityFails },
  ];
}

export interface WholeBusinessVerdict {
  classification: WholeBusinessClassification;
  gates: GateResult[];
  gatesPassed: number;
  gatesFailed: string[];
  blockers: string[];
}

export function classifyWholeBusiness(i: WholeBusinessGateInput): WholeBusinessVerdict {
  const gates = evaluateGates(i);
  const failed = gates.filter((g) => !g.passed);
  const gatesPassed = gates.length - failed.length;

  // The whole-business operating layer (arbitration + plan + growth + profitability + stages +
  // production runtime + collective ≥90 + holdout + 0 unsafe/regression + leakage + learning + guards).
  const wholeBusinessLayerReady =
    i.crossDomainArbitrationWorks && i.growthScaleGatesWork && i.profitabilityLayerWorks &&
    i.businessStageAwarenessWorks && i.collectiveScore >= 90 && i.productionRuntimeScore >= 90 &&
    i.productionHoldoutScore >= 88 && i.adversarialUnsafe === 0 && i.regressionFailures === 0 &&
    i.noCrossBusinessLeakage && i.storedLearningAffectsProduction && i.commandCenterSurface &&
    i.genericAdviceFails && i.numericallyWrongAdviceFails && i.disconnectedDomainAdviceFails && i.wrongTopPriorityFails;

  let classification: WholeBusinessClassification;
  if (failed.length === 0) {
    classification = "READY_FOR_REAL_WORLD_CASE_TRAINING";
  } else if (wholeBusinessLayerReady) {
    // Everything in the whole-business layer is ready; only individual critical-domain floor and/or
    // proof/owner-workload depth keep it below the top rung.
    classification = "WHOLE_BUSINESS_EXPERT_CORE_READY";
  } else if (i.productionRuntimeScore >= 90 && i.crossDomainArbitrationWorks) {
    classification = "PRODUCTION_WHOLE_BUSINESS_RUNTIME_READY";
  } else if (i.growthScaleGatesWork && i.profitabilityLayerWorks) {
    classification = "PROFITABLE_GROWTH_CONTROL_READY";
  } else if (i.collectiveScore >= 90) {
    classification = "WHOLE_BUSINESS_PLAN_READY";
  } else if (i.crossDomainArbitrationWorks) {
    classification = "CROSS_DOMAIN_ARBITRATION_READY";
  } else {
    classification = "DOMAIN_EXPERTISE_PARTIAL";
  }

  const blockers: string[] = [];
  if (!i.criticalDomainsAllPass) blockers.push("one or more critical individual domains below the 90 floor (e.g. owner_workload)");
  if (classification !== "READY_FOR_REAL_WORLD_CASE_TRAINING") blockers.push("full per-domain production DB ingestion is the documented runtime gap");

  return { classification, gates, gatesPassed, gatesFailed: failed.map((g) => g.gate), blockers };
}
