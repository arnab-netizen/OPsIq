/**
 * Stage 3 → Module 1 integration (pure).
 *
 * Maps the operational-safety verdict (M7–M11 composition) into Module 1
 * business-impact inputs: derives the staff-workload, owner-workload, and capacity
 * ImpactDimensions from the M8/M9/M10 assessments and feeds the operational-safety
 * LeanClassification as the proposed classification, then delegates to the proven
 * composeBusinessImpact (which safety-reconciles again). Additive — does not modify
 * composeBusinessImpact.
 */

import {
  composeBusinessImpact,
  type BusinessImpactInputs,
} from "@/domain/business-impact/business-impact-composer";
import type { RecommendationBusinessImpact, ImpactDimension, ImpactMagnitude } from "@/domain/business-impact/recommendation-business-impact";
import { evaluateOperationalSafety, type OperationalSafetyInput, type OperationalSafetyResult } from "@/domain/execution/operational-safety";
import { WorkloadBand, type EmployeeWorkloadAssessment } from "@/domain/execution/employee-workload";
import { OwnerLoadBand, type OwnerWorkloadAssessment } from "@/domain/execution/owner-workload";
import type { CapacityAssessment } from "@/domain/execution/capacity-ceiling";

function employeeDimension(a: EmployeeWorkloadAssessment | undefined): ImpactDimension {
  if (!a) return { direction: "unknown", magnitude: "none", rationale: "no employee workload data" };
  const magnitude: ImpactMagnitude =
    a.band === WorkloadBand.UNSUSTAINABLE ? "critical" :
    a.band === WorkloadBand.OVERBURDEN_RISK ? "high" :
    a.band === WorkloadBand.HIGH_UTILIZATION ? "medium" : "low";
  return {
    direction: a.overburdened ? "negative" : "neutral",
    magnitude,
    rationale: `employee utilization ${a.utilizationPct}% (${a.band})`,
  };
}

function ownerDimension(a: OwnerWorkloadAssessment | undefined): ImpactDimension {
  if (!a) return { direction: "unknown", magnitude: "none", rationale: "no owner workload data" };
  const magnitude: ImpactMagnitude =
    a.band === OwnerLoadBand.UNSUSTAINABLE ? "critical" :
    a.band === OwnerLoadBand.BOTTLENECK_RISK ? "high" :
    a.band === OwnerLoadBand.HIGH ? "medium" : "low";
  return {
    direction: a.overloaded || a.bottleneckRisk ? "negative" : "neutral",
    magnitude,
    rationale: `owner load ${a.dailyLoadPct}% (${a.band}); relief: ${a.recommendedPath}`,
  };
}

function capacityDimension(a: CapacityAssessment | undefined, isGrowthMove: boolean): ImpactDimension {
  if (!a) return { direction: "unknown", magnitude: "none", rationale: "no capacity data" };
  const unsafe = isGrowthMove && !a.growthSafe;
  return {
    direction: unsafe ? "negative" : a.growthSafe ? "positive" : "neutral",
    magnitude: a.expansionTriggered ? "high" : a.growthSafe ? "low" : "medium",
    rationale: `bottleneck ${a.bottleneckResource ?? "n/a"} at ${Math.round(a.bottleneckUtilization * 100)}%; buffer ${Math.round(a.availableBuffer * 100)}%`,
  };
}

/** Build the workload/capacity dimensions + lean classification from ops assessments. */
export function deriveOpsImpact(
  ops: OperationalSafetyInput
): { result: OperationalSafetyResult; staffWorkloadImpact: ImpactDimension; ownerWorkloadImpact: ImpactDimension; capacityImpact: ImpactDimension } {
  const result = evaluateOperationalSafety(ops);
  return {
    result,
    staffWorkloadImpact: employeeDimension(ops.employee),
    ownerWorkloadImpact: ownerDimension(ops.owner),
    capacityImpact: capacityDimension(ops.capacity, ops.isGrowthMove === true),
  };
}

/** Inputs for composeBusinessImpact, minus the fields derived from ops. */
export type OpsDrivenInputs = Omit<
  BusinessImpactInputs,
  "staffWorkloadImpact" | "ownerWorkloadImpact" | "capacityImpact" | "proposedLeanClassification"
> & { ops: OperationalSafetyInput };

/**
 * Produce a complete RecommendationBusinessImpact where the workload/capacity
 * dimensions and the lean classification are driven by the Stage 3 cores.
 */
export function composeBusinessImpactFromOps(input: OpsDrivenInputs): RecommendationBusinessImpact {
  const { ops, ...rest } = input;
  const { result, staffWorkloadImpact, ownerWorkloadImpact, capacityImpact } = deriveOpsImpact(ops);
  return composeBusinessImpact({
    ...rest,
    staffWorkloadImpact,
    ownerWorkloadImpact,
    capacityImpact,
    proposedLeanClassification: result.leanClassification,
  });
}
