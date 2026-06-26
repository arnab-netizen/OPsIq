import { describe, it, expect } from "vitest";
import {
  evaluateBusinessImpactGate,
  assertBusinessImpactForPromotion,
  BusinessImpactGateError,
  LeanClassification,
  EvidenceConfidenceLevel,
  type RecommendationBusinessImpact,
  type ImpactDimension,
} from "@/domain/business-impact/recommendation-business-impact";

const REC = "rec-1";
const WS = "ws-1";
const dim = (over: Partial<ImpactDimension> = {}): ImpactDimension => ({
  direction: "positive",
  magnitude: "medium",
  rationale: "modeled from owner-finance + capacity inputs",
  ...over,
});
const horizon = (effect: string) => ({ expectedEffect: effect, magnitude: "medium" as const, confidence: EvidenceConfidenceLevel.MODERATE });

function complete(over: Partial<RecommendationBusinessImpact> = {}): RecommendationBusinessImpact {
  return {
    recommendationId: REC,
    workspaceId: WS,
    evidenceBasis: ["owner-finance snapshot", "cashflow snapshot"],
    evidenceConfidence: EvidenceConfidenceLevel.STRONG,
    financialImpact: {
      input: { revenue: 1000, costs: 600, timeframe: "monthly" } as never,
      roi: { roiPercentage: 40, paybackMonths: 3, netValue: 400, isPositive: true } as never,
    },
    cashImpact: dim(),
    unitEconomicsImpact: dim(),
    staffWorkloadImpact: dim({ direction: "neutral" }),
    ownerWorkloadImpact: dim({ direction: "negative", magnitude: "low" }),
    capacityImpact: dim(),
    qualityImpact: dim(),
    customerImpact: dim(),
    riskComplianceImpact: dim({ direction: "neutral", magnitude: "low" }),
    executionComplexity: "medium",
    timeHorizon7d: horizon("setup only"),
    timeHorizon30d: horizon("first measurable lift"),
    timeHorizon90d: horizon("sustained margin gain"),
    timeHorizon6m: horizon("retention compounding"),
    rejectedAlternatives: [{ option: "blanket discount", whyRejected: "below margin floor" }],
    requiredProof: ["before/after revenue", "owner verification"],
    rollbackTrigger: "if 30d margin falls >5% vs baseline, revert",
    leanClassification: LeanClassification.LEAN_APPROVED,
    ...over,
  };
}

describe("[module1] business-impact promotion gate — fail closed", () => {
  it("a complete, lean-approved assessment passes", () => {
    const r = evaluateBusinessImpactGate(complete(), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(true);
    expect(r.blockedReasons).toHaveLength(0);
  });

  it("a missing assessment blocks promotion", () => {
    const r = evaluateBusinessImpactGate(null, { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons[0]).toMatch(/No BusinessImpactAssessment/i);
  });

  it("a cross-workspace assessment is blocked (isolation)", () => {
    const r = evaluateBusinessImpactGate(complete({ workspaceId: "ws-other" }), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/different workspace/i);
  });

  it("a mismatched recommendationId is blocked", () => {
    const r = evaluateBusinessImpactGate(complete({ recommendationId: "rec-x" }), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/does not match/i);
  });

  it("empty evidence basis is blocked", () => {
    const r = evaluateBusinessImpactGate(complete({ evidenceBasis: ["", "  "] }), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/evidence basis/i);
  });

  it.each([
    "cashImpact", "unitEconomicsImpact", "staffWorkloadImpact", "ownerWorkloadImpact",
    "capacityImpact", "qualityImpact", "customerImpact", "riskComplianceImpact",
  ] as const)("a missing %s dimension blocks promotion", (field) => {
    const r = evaluateBusinessImpactGate(complete({ [field]: { direction: "positive", magnitude: "low", rationale: "" } } as never), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toContain(field);
  });

  it("missing required proof or rollback trigger blocks promotion", () => {
    expect(evaluateBusinessImpactGate(complete({ requiredProof: [] }), { recommendationId: REC, workspaceId: WS }).ok).toBe(false);
    expect(evaluateBusinessImpactGate(complete({ rollbackTrigger: "" }), { recommendationId: REC, workspaceId: WS }).ok).toBe(false);
  });

  it("incomplete time-horizon set blocks promotion", () => {
    const r = evaluateBusinessImpactGate(complete({ timeHorizon6m: { expectedEffect: "", magnitude: "low", confidence: EvidenceConfidenceLevel.WEAK } }), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/time-horizon/i);
  });

  it.each([
    LeanClassification.FALSE_LEAN_REJECTED,
    LeanClassification.GROWTH_UNSAFE,
    LeanClassification.CASH_UNSAFE_REJECTED,
    LeanClassification.DATA_INSUFFICIENT,
  ])("lean classification %s blocks promotion even if otherwise complete", (lean) => {
    const r = evaluateBusinessImpactGate(complete({ leanClassification: lean }), { recommendationId: REC, workspaceId: WS });
    expect(r.ok).toBe(false);
    expect(r.blockedReasons.join(" ")).toMatch(/blocks promotion/i);
  });
});

describe("[module1] assertBusinessImpactForPromotion — wired into a promotion flow", () => {
  // A minimal promotion flow that enforces the gate, proving the wiring contract
  // the live recommendation service will use.
  async function promote(recommendationId: string, workspaceId: string, assessment: RecommendationBusinessImpact | null) {
    assertBusinessImpactForPromotion(assessment, { recommendationId, workspaceId });
    return { recommendationId, status: "approved" as const };
  }

  it("promotion succeeds with a complete assessment", async () => {
    await expect(promote(REC, WS, complete())).resolves.toMatchObject({ status: "approved" });
  });

  it("promotion throws BusinessImpactGateError without an assessment", async () => {
    await expect(promote(REC, WS, null)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });

  it("the thrown error carries structured blocked reasons", async () => {
    try {
      await promote(REC, WS, complete({ rollbackTrigger: "", requiredProof: [] }));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessImpactGateError);
      const err = e as BusinessImpactGateError;
      expect(err.code).toBe("BUSINESS_IMPACT_GATE_BLOCKED");
      expect(err.blockedReasons.length).toBeGreaterThanOrEqual(2);
    }
  });
});
