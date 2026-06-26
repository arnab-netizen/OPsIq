import { describe, it, expect } from "vitest";
import { composeBusinessImpactFromOps, deriveOpsImpact, type OpsDrivenInputs } from "@/domain/business-impact/business-impact-from-ops";
import { evaluateBusinessImpactGate, LeanClassification, EvidenceConfidenceLevel, type ImpactDimension } from "@/domain/business-impact/recommendation-business-impact";
import { assessEmployeeWorkload } from "@/domain/execution/employee-workload";
import { assessOwnerWorkload } from "@/domain/execution/owner-workload";
import { assessCapacity } from "@/domain/execution/capacity-ceiling";
import type { OperationalSafetyInput } from "@/domain/execution/operational-safety";

const dim = (over: Partial<ImpactDimension> = {}): ImpactDimension => ({ direction: "positive", magnitude: "medium", rationale: "modeled", ...over });
const horizon = (e: string) => ({ expectedEffect: e, magnitude: "medium" as const, confidence: EvidenceConfidenceLevel.MODERATE });

const healthyOps = (over: Partial<OperationalSafetyInput> = {}): OperationalSafetyInput => ({
  benefits: { profitImpact: 0.7, cashImpact: 0.6, wasteReduction: 0.6, capacityImpact: 0.5, qualityImpact: 0.6, customerValue: 0.6 },
  baseRisks: { reworkRisk: 0.1, complaintRisk: 0.1, executionComplexityRisk: 0.1 },
  employee: assessEmployeeWorkload({ shiftHours: 8, taskHours: 4 }),
  owner: assessOwnerWorkload({ ownerMinutesPerDay: 120, sustainableMinutesPerDay: 480 }),
  dataSufficient: true,
  ...over,
});

function opsDriven(over: Partial<OpsDrivenInputs> = {}): OpsDrivenInputs {
  return {
    recommendationId: "rec-1", workspaceId: "ws-1",
    evidenceBasis: ["owner-finance snapshot", "bank export"], hasVerifiedSource: true,
    financial: { initialInvestment: 1000, expectedBenefit: 3000, timeToValue: 3, riskAdjustmentFactor: 0.9, discountRate: 0.1 },
    cashImpact: dim(), unitEconomicsImpact: dim(), qualityImpact: dim(), customerImpact: dim(), riskComplianceImpact: dim({ direction: "neutral", magnitude: "low" }),
    executionComplexity: "medium",
    timeHorizon7d: horizon("setup"), timeHorizon30d: horizon("lift"), timeHorizon90d: horizon("sustained"), timeHorizon6m: horizon("compounding"),
    rejectedAlternatives: [{ option: "discount", whyRejected: "below margin floor" }],
    requiredProof: ["before/after revenue"], rollbackTrigger: "revert if margin drops",
    ops: healthyOps(),
    ...over,
  };
}

describe("[stage3->m1] business impact from ops", () => {
  it("derives workload/capacity dimensions + lean classification from ops cores", () => {
    const d = deriveOpsImpact(healthyOps());
    expect(d.staffWorkloadImpact.rationale).toMatch(/utilization/i);
    expect(d.ownerWorkloadImpact.rationale).toMatch(/owner load/i);
    expect([LeanClassification.LEAN_APPROVED, LeanClassification.LEAN_APPROVED_WITH_MONITORING]).toContain(d.result.leanClassification);
  });

  it("a healthy ops profile composes an assessment that PASSES the M1 gate", () => {
    const a = composeBusinessImpactFromOps(opsDriven());
    expect(evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" }).ok).toBe(true);
  });

  it("an overburdened-employee ops profile yields a blocking lean classification", () => {
    const overburdened = healthyOps({
      employee: assessEmployeeWorkload({ shiftHours: 8, taskHours: 8, overtimeHours: 1 }),
      benefits: { profitImpact: 0.7, cashImpact: 0.6, wasteReduction: 0.2, capacityImpact: 0.2, qualityImpact: 0.6, customerValue: 0.6 },
    });
    const a = composeBusinessImpactFromOps(opsDriven({ ops: overburdened }));
    expect(a.leanClassification).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(a.staffWorkloadImpact.direction).toBe("negative");
    // the M1 gate then blocks this recommendation
    expect(evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" }).ok).toBe(false);
  });

  it("a growth move with capped capacity yields GROWTH_UNSAFE and blocks the gate", () => {
    const ops = healthyOps({ isGrowthMove: true, capacity: assessCapacity({ resources: [{ type: "machine", utilization: 0.95 }], currentRevenue: 700000 }) });
    const a = composeBusinessImpactFromOps(opsDriven({ ops }));
    expect(a.leanClassification).toBe(LeanClassification.GROWTH_UNSAFE);
    expect(evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" }).ok).toBe(false);
  });
});
