/**
 * Stage 3 composition — Operational Safety (pure domain core).
 *
 * Ties the Module 7–11 cores into one verdict + LeanClassification that the Module 1
 * business-impact composer can consume, closing the loop: workload/capacity/false-
 * lean logic → lean classification → promotion gate. Derives lean scoring risk from
 * the M8 employee-workload and M9 owner-workload bands and the M10 capacity headroom,
 * then runs M7 classifyLean and M11 detectFalseLean. Pure + deterministic.
 */

import { classifyLean, LeanClassification, type LeanScoringInput } from "@/domain/execution/lean-guardrail";
import { detectFalseLean, type FalseLeanSignals } from "@/domain/execution/false-lean-detector";
import { WorkloadBand, type EmployeeWorkloadAssessment } from "@/domain/execution/employee-workload";
import { OwnerLoadBand, type OwnerWorkloadAssessment } from "@/domain/execution/owner-workload";
import type { CapacityAssessment } from "@/domain/execution/capacity-ceiling";

const EMPLOYEE_BAND_RISK: Record<WorkloadBand, number> = {
  [WorkloadBand.UNDERUTILIZED]: 0.1,
  [WorkloadBand.HEALTHY_UTILIZATION]: 0.2,
  [WorkloadBand.HIGH_UTILIZATION]: 0.5,
  [WorkloadBand.OVERBURDEN_RISK]: 0.8,
  [WorkloadBand.UNSUSTAINABLE]: 1.0,
};

const OWNER_BAND_RISK: Record<OwnerLoadBand, number> = {
  [OwnerLoadBand.UNDERUSED]: 0.1,
  [OwnerLoadBand.SUSTAINABLE]: 0.2,
  [OwnerLoadBand.HIGH]: 0.5,
  [OwnerLoadBand.BOTTLENECK_RISK]: 0.8,
  [OwnerLoadBand.UNSUSTAINABLE]: 1.0,
};

export interface OperationalSafetyInput {
  /** Benefit + base-risk scores not derivable from the band assessments. */
  benefits: Pick<LeanScoringInput, "profitImpact" | "cashImpact" | "wasteReduction" | "capacityImpact" | "qualityImpact" | "customerValue">;
  baseRisks: Pick<LeanScoringInput, "reworkRisk" | "complaintRisk" | "executionComplexityRisk">;
  employee?: EmployeeWorkloadAssessment;
  owner?: OwnerWorkloadAssessment;
  capacity?: CapacityAssessment;
  /** Is this action a growth/expansion move? (capacity headroom then matters) */
  isGrowthMove?: boolean;
  cashUnsafe?: boolean;
  dataSufficient: boolean;
  falseLean?: FalseLeanSignals;
  // Quality-removal signals passed through to classifyLean.
  qualityChecksRemoved?: boolean;
  defectRateStable?: boolean;
}

export interface OperationalSafetyResult {
  leanClassification: LeanClassification;
  falseLeanVerdict: "REJECT" | "REDESIGN" | "CLEAN";
  falseLeanPatterns: string[];
  blockedReasons: string[];
  monitoring: string[];
  safeToProceed: boolean;
}

/** Compose the Stage 3 cores into a single operational-safety verdict. */
export function evaluateOperationalSafety(input: OperationalSafetyInput): OperationalSafetyResult {
  const employeeWorkloadRisk = input.employee ? EMPLOYEE_BAND_RISK[input.employee.band] : 0;
  const ownerWorkloadRisk = input.owner ? OWNER_BAND_RISK[input.owner.band] : 0;
  const growthWithoutCapacity = input.isGrowthMove === true && input.capacity ? input.capacity.growthSafe === false : false;

  const leanInput: LeanScoringInput = {
    ...input.benefits,
    ...input.baseRisks,
    employeeWorkloadRisk,
    ownerWorkloadRisk,
    dataSufficient: input.dataSufficient,
    cashUnsafe: input.cashUnsafe,
    growthWithoutCapacity,
    qualityChecksRemoved: input.qualityChecksRemoved,
    defectRateStable: input.defectRateStable,
  };

  const lean = classifyLean(leanInput);
  const fl = input.falseLean ? detectFalseLean(input.falseLean) : { patterns: [], verdict: "CLEAN" as const, approvable: true };

  // A detected false-lean pattern can only tighten the classification.
  let leanClassification = lean.classification;
  const blockedReasons = [...lean.blockedReasons];
  if (fl.verdict === "REJECT") {
    leanClassification = LeanClassification.FALSE_LEAN_REJECTED;
    blockedReasons.push(`False-lean patterns: ${fl.patterns.join(", ")}.`);
  } else if (fl.verdict === "REDESIGN" && leanClassification !== LeanClassification.FALSE_LEAN_REJECTED) {
    if (leanClassification === LeanClassification.LEAN_APPROVED || leanClassification === LeanClassification.LEAN_APPROVED_WITH_MONITORING) {
      leanClassification = LeanClassification.LEAN_REDESIGN_REQUIRED;
    }
    blockedReasons.push(`False-lean patterns (redesign): ${fl.patterns.join(", ")}.`);
  }

  const approvedClasses = [LeanClassification.LEAN_APPROVED, LeanClassification.LEAN_APPROVED_WITH_MONITORING];
  const safeToProceed = approvedClasses.includes(leanClassification) && fl.approvable;

  return {
    leanClassification,
    falseLeanVerdict: fl.verdict,
    falseLeanPatterns: fl.patterns,
    blockedReasons,
    monitoring: lean.monitoring,
    safeToProceed,
  };
}
