import { describe, it, expect } from "vitest";
import {
  composeBusinessImpact,
  deriveEvidenceConfidence,
  reconcileLeanClassification,
  type BusinessImpactInputs,
} from "@/domain/business-impact/business-impact-composer";
import {
  evaluateBusinessImpactGate,
  LeanClassification,
  EvidenceConfidenceLevel,
  type ImpactDimension,
} from "@/domain/business-impact/recommendation-business-impact";

const dim = (over: Partial<ImpactDimension> = {}): ImpactDimension => ({ direction: "positive", magnitude: "medium", rationale: "modeled", ...over });
const horizon = (e: string) => ({ expectedEffect: e, magnitude: "medium" as const, confidence: EvidenceConfidenceLevel.MODERATE });

function inputs(over: Partial<BusinessImpactInputs> = {}): BusinessImpactInputs {
  return {
    recommendationId: "rec-1",
    workspaceId: "ws-1",
    evidenceBasis: ["owner-finance snapshot", "bank export"],
    hasVerifiedSource: true,
    financial: { initialInvestment: 1000, expectedBenefit: 3000, timeToValue: 3, riskAdjustmentFactor: 0.9, discountRate: 0.1 },
    cashImpact: dim(),
    unitEconomicsImpact: dim(),
    staffWorkloadImpact: dim({ direction: "neutral" }),
    ownerWorkloadImpact: dim({ direction: "negative", magnitude: "low" }),
    capacityImpact: dim(),
    qualityImpact: dim(),
    customerImpact: dim(),
    riskComplianceImpact: dim({ direction: "neutral", magnitude: "low" }),
    executionComplexity: "medium",
    timeHorizon7d: horizon("setup"),
    timeHorizon30d: horizon("first lift"),
    timeHorizon90d: horizon("sustained"),
    timeHorizon6m: horizon("compounding"),
    rejectedAlternatives: [{ option: "discount", whyRejected: "below margin floor" }],
    requiredProof: ["before/after revenue"],
    rollbackTrigger: "revert if 30d margin < baseline",
    proposedLeanClassification: LeanClassification.LEAN_APPROVED,
    ...over,
  };
}

describe("[module1] composeBusinessImpact", () => {
  it("composes a complete assessment that PASSES the promotion gate", () => {
    const a = composeBusinessImpact(inputs());
    const gate = evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" });
    expect(gate.ok).toBe(true);
    expect(a.financialImpact.roi.roiPercent).toBeGreaterThan(0);
  });

  it("derives evidence confidence from source strength + breadth", () => {
    expect(deriveEvidenceConfidence([], false)).toBe(EvidenceConfidenceLevel.INSUFFICIENT);
    expect(deriveEvidenceConfidence(["a"], false)).toBe(EvidenceConfidenceLevel.WEAK);
    expect(deriveEvidenceConfidence(["a", "b"], false)).toBe(EvidenceConfidenceLevel.MODERATE);
    expect(deriveEvidenceConfidence(["a"], true)).toBe(EvidenceConfidenceLevel.STRONG);
    expect(deriveEvidenceConfidence(["a", "b"], true)).toBe(EvidenceConfidenceLevel.VERIFIED);
  });
});

describe("[module1] fail-closed lean reconciliation (safety can only tighten)", () => {
  it("no evidence forces DATA_INSUFFICIENT (and the gate then blocks)", () => {
    const a = composeBusinessImpact(inputs({ evidenceBasis: [] }));
    expect(a.leanClassification).toBe(LeanClassification.DATA_INSUFFICIENT);
    expect(evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" }).ok).toBe(false);
  });

  it("severe negative cash impact forces CASH_UNSAFE_REJECTED despite a healthy proposal", () => {
    const a = composeBusinessImpact(inputs({ cashImpact: dim({ direction: "negative", magnitude: "critical" }), proposedLeanClassification: LeanClassification.LEAN_APPROVED }));
    expect(a.leanClassification).toBe(LeanClassification.CASH_UNSAFE_REJECTED);
    expect(evaluateBusinessImpactGate(a, { recommendationId: "rec-1", workspaceId: "ws-1" }).ok).toBe(false);
  });

  it("critical negative capacity forces GROWTH_UNSAFE", () => {
    expect(reconcileLeanClassification(LeanClassification.LEAN_APPROVED, {
      evidenceBasis: ["x"], cashImpact: dim(), capacityImpact: dim({ direction: "negative", magnitude: "critical" }),
      staffWorkloadImpact: dim(), ownerWorkloadImpact: dim(),
    })).toBe(LeanClassification.GROWTH_UNSAFE);
  });

  it("severe negative staff or owner workload forces FALSE_LEAN_REJECTED", () => {
    expect(reconcileLeanClassification(LeanClassification.LEAN_APPROVED, {
      evidenceBasis: ["x"], cashImpact: dim(), capacityImpact: dim(),
      staffWorkloadImpact: dim({ direction: "negative", magnitude: "high" }), ownerWorkloadImpact: dim(),
    })).toBe(LeanClassification.FALSE_LEAN_REJECTED);
    expect(reconcileLeanClassification(LeanClassification.LEAN_APPROVED, {
      evidenceBasis: ["x"], cashImpact: dim(), capacityImpact: dim(),
      staffWorkloadImpact: dim(), ownerWorkloadImpact: dim({ direction: "negative", magnitude: "critical" }),
    })).toBe(LeanClassification.FALSE_LEAN_REJECTED);
  });

  it("a healthy proposal is preserved when no safety override applies", () => {
    expect(reconcileLeanClassification(LeanClassification.LEAN_APPROVED_WITH_MONITORING, {
      evidenceBasis: ["x"], cashImpact: dim(), capacityImpact: dim(),
      staffWorkloadImpact: dim(), ownerWorkloadImpact: dim(),
    })).toBe(LeanClassification.LEAN_APPROVED_WITH_MONITORING);
  });
});
