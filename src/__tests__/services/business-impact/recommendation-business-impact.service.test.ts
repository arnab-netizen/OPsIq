/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  saveBusinessImpact,
  getBusinessImpact,
  enforceBusinessImpactForPromotion,
  isBusinessImpactRequired,
  enforceBusinessImpactIfRequired,
  type RBIDeps,
} from "@/services/business-impact/recommendation-business-impact.service";
import { composeBusinessImpact } from "@/domain/business-impact/business-impact-composer";
import { BusinessImpactGateError, LeanClassification, EvidenceConfidenceLevel, type ImpactDimension } from "@/domain/business-impact/recommendation-business-impact";

const dim = (over: Partial<ImpactDimension> = {}): ImpactDimension => ({ direction: "positive", magnitude: "medium", rationale: "modeled", ...over });
const horizon = (e: string) => ({ expectedEffect: e, magnitude: "medium" as const, confidence: EvidenceConfidenceLevel.MODERATE });

function assessment(recommendationId: string, workspaceId: string) {
  return composeBusinessImpact({
    recommendationId, workspaceId,
    evidenceBasis: ["owner-finance snapshot", "bank export"], hasVerifiedSource: true,
    financial: { initialInvestment: 1000, expectedBenefit: 3000, timeToValue: 3, riskAdjustmentFactor: 0.9, discountRate: 0.1 },
    cashImpact: dim(), unitEconomicsImpact: dim(), staffWorkloadImpact: dim({ direction: "neutral" }),
    ownerWorkloadImpact: dim({ direction: "negative", magnitude: "low" }), capacityImpact: dim(),
    qualityImpact: dim(), customerImpact: dim(), riskComplianceImpact: dim({ direction: "neutral", magnitude: "low" }),
    executionComplexity: "medium",
    timeHorizon7d: horizon("setup"), timeHorizon30d: horizon("lift"), timeHorizon90d: horizon("sustained"), timeHorizon6m: horizon("compounding"),
    rejectedAlternatives: [{ option: "discount", whyRejected: "below margin floor" }],
    requiredProof: ["before/after revenue"], rollbackTrigger: "revert if margin drops",
    proposedLeanClassification: LeanClassification.LEAN_APPROVED,
  });
}

/** In-memory store keyed by workspace+recommendation, enforcing the unique constraint. */
function fakeDeps(requireFlagByWorkspace: Record<string, boolean> = {}): RBIDeps {
  const store = new Map<string, any>();
  const key = (w: string, r: string) => `${w}:${r}`;
  let n = 0;
  return {
    uuid: () => `uuid-${++n}`,
    db: {
      clientAccount: {
        findUnique: async (args: any) => {
          const id = args.where.id;
          return id in requireFlagByWorkspace ? { requireBusinessImpactAssessment: requireFlagByWorkspace[id] } : null;
        },
      },
      recommendationBusinessImpact: {
        upsert: async (args: any) => {
          const { workspaceId, recommendationId } = args.where.workspaceId_recommendationId;
          const k = key(workspaceId, recommendationId);
          const existing = store.get(k);
          store.set(k, existing ? { ...existing, ...args.update } : { ...args.create });
          return store.get(k);
        },
        findUnique: async (args: any) => {
          const { workspaceId, recommendationId } = args.where.workspaceId_recommendationId;
          return store.get(key(workspaceId, recommendationId)) ?? null;
        },
      },
    } as any,
  };
}

describe("[module1] recommendation-business-impact service (DI, no DB)", () => {
  it("saves and reads back a workspace-scoped assessment", async () => {
    const deps = fakeDeps();
    await saveBusinessImpact(assessment("rec-1", "ws-1"), { createdByUserId: "owner-1" }, deps);
    const got = await getBusinessImpact("rec-1", "ws-1", deps);
    expect(got?.recommendationId).toBe("rec-1");
    expect(got?.leanClassification).toBe(LeanClassification.LEAN_APPROVED);
  });

  it("does not return another workspace's assessment (isolation)", async () => {
    const deps = fakeDeps();
    await saveBusinessImpact(assessment("rec-1", "ws-1"), {}, deps);
    expect(await getBusinessImpact("rec-1", "ws-other", deps)).toBeNull();
  });

  it("enforcement passes once a complete assessment is persisted", async () => {
    const deps = fakeDeps();
    await saveBusinessImpact(assessment("rec-1", "ws-1"), {}, deps);
    await expect(enforceBusinessImpactForPromotion("rec-1", "ws-1", deps)).resolves.toBeUndefined();
  });

  it("enforcement throws when no assessment is persisted", async () => {
    const deps = fakeDeps();
    await expect(enforceBusinessImpactForPromotion("rec-missing", "ws-1", deps)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });

  it("isBusinessImpactRequired reflects the per-workspace flag (default off)", async () => {
    expect(await isBusinessImpactRequired("ws-unset", fakeDeps())).toBe(false);
    expect(await isBusinessImpactRequired("ws-off", fakeDeps({ "ws-off": false }))).toBe(false);
    expect(await isBusinessImpactRequired("ws-on", fakeDeps({ "ws-on": true }))).toBe(true);
  });

  it("enforceBusinessImpactIfRequired is a NO-OP when the workspace has not opted in", async () => {
    const deps = fakeDeps({ "ws-1": false });
    // No assessment persisted, but flag off → promotion is not blocked.
    await expect(enforceBusinessImpactIfRequired("rec-1", "ws-1", deps)).resolves.toBeUndefined();
  });

  it("enforceBusinessImpactIfRequired BLOCKS when opted in and no complete assessment exists", async () => {
    const deps = fakeDeps({ "ws-1": true });
    await expect(enforceBusinessImpactIfRequired("rec-missing", "ws-1", deps)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });

  it("enforceBusinessImpactIfRequired PASSES when opted in and a complete assessment exists", async () => {
    const deps = fakeDeps({ "ws-1": true });
    await saveBusinessImpact(assessment("rec-1", "ws-1"), {}, deps);
    await expect(enforceBusinessImpactIfRequired("rec-1", "ws-1", deps)).resolves.toBeUndefined();
  });

  it("upsert replaces the prior assessment (one per workspace+recommendation)", async () => {
    const deps = fakeDeps();
    await saveBusinessImpact(assessment("rec-1", "ws-1"), {}, deps);
    const unsafe = composeBusinessImpact({
      recommendationId: "rec-1", workspaceId: "ws-1", evidenceBasis: ["x"], hasVerifiedSource: false,
      financial: { initialInvestment: 100, expectedBenefit: 50, timeToValue: 1, riskAdjustmentFactor: 1, discountRate: 0.1 },
      cashImpact: dim({ direction: "negative", magnitude: "critical" }), unitEconomicsImpact: dim(), staffWorkloadImpact: dim(),
      ownerWorkloadImpact: dim(), capacityImpact: dim(), qualityImpact: dim(), customerImpact: dim(), riskComplianceImpact: dim(),
      executionComplexity: "high", timeHorizon7d: horizon("a"), timeHorizon30d: horizon("b"), timeHorizon90d: horizon("c"), timeHorizon6m: horizon("d"),
      rejectedAlternatives: [], requiredProof: ["p"], rollbackTrigger: "t", proposedLeanClassification: LeanClassification.LEAN_APPROVED,
    });
    await saveBusinessImpact(unsafe, {}, deps);
    const got = await getBusinessImpact("rec-1", "ws-1", deps);
    expect(got?.leanClassification).toBe(LeanClassification.CASH_UNSAFE_REJECTED);
    // and enforcement now blocks (unsafe lean classification)
    await expect(enforceBusinessImpactForPromotion("rec-1", "ws-1", deps)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });
});
