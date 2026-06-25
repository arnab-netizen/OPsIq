/**
 * Module 1 — RecommendationBusinessImpact persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the recommendation_business_impacts migration applied. Proves real persistence
 * round-trip, workspace isolation, and fail-closed promotion enforcement through
 * the actual service + Prisma client. No FK to recommendations, so arbitrary UUIDs
 * are used (the gate is about the assessment, not a live recommendation row).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/business-impact/recommendation-business-impact.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  saveBusinessImpact,
  getBusinessImpact,
  enforceBusinessImpactForPromotion,
} from "@/services/business-impact/recommendation-business-impact.service";
import { composeBusinessImpact } from "@/domain/business-impact/business-impact-composer";
import {
  BusinessImpactGateError,
  LeanClassification,
  EvidenceConfidenceLevel,
  type ImpactDimension,
} from "@/domain/business-impact/recommendation-business-impact";

const dim = (over: Partial<ImpactDimension> = {}): ImpactDimension => ({ direction: "positive", magnitude: "medium", rationale: "modeled", ...over });
const horizon = (e: string) => ({ expectedEffect: e, magnitude: "medium" as const, confidence: EvidenceConfidenceLevel.MODERATE });
const wsA = randomUUID();
const wsB = randomUUID();

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

afterAll(async () => {
  await db.recommendationBusinessImpact.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module1] recommendation-business-impact persistence", () => {
  it("persists and reads back the assessment (round-trip)", async () => {
    const rec = randomUUID();
    await saveBusinessImpact(assessment(rec, wsA), { createdByUserId: randomUUID() });
    const got = await getBusinessImpact(rec, wsA);
    expect(got?.recommendationId).toBe(rec);
    expect(got?.leanClassification).toBe(LeanClassification.LEAN_APPROVED);
    expect(got?.evidenceConfidence).toBe(EvidenceConfidenceLevel.VERIFIED);
    expect(got?.financialImpact.roi.roiPercent).toBeGreaterThan(0);
  });

  it("enforces workspace isolation (another workspace cannot read it)", async () => {
    const rec = randomUUID();
    await saveBusinessImpact(assessment(rec, wsA), {});
    expect(await getBusinessImpact(rec, wsB)).toBeNull();
  });

  it("promotion enforcement passes with a persisted complete assessment", async () => {
    const rec = randomUUID();
    await saveBusinessImpact(assessment(rec, wsA), {});
    await expect(enforceBusinessImpactForPromotion(rec, wsA)).resolves.toBeUndefined();
  });

  it("promotion enforcement throws when no assessment is persisted", async () => {
    await expect(enforceBusinessImpactForPromotion(randomUUID(), wsA)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });

  it("upsert keeps one row per (workspace, recommendation) and reflects the latest", async () => {
    const rec = randomUUID();
    await saveBusinessImpact(assessment(rec, wsA), {});
    const unsafe = composeBusinessImpact({
      recommendationId: rec, workspaceId: wsA, evidenceBasis: ["x"], hasVerifiedSource: false,
      financial: { initialInvestment: 100, expectedBenefit: 50, timeToValue: 1, riskAdjustmentFactor: 1, discountRate: 0.1 },
      cashImpact: dim({ direction: "negative", magnitude: "critical" }), unitEconomicsImpact: dim(), staffWorkloadImpact: dim(),
      ownerWorkloadImpact: dim(), capacityImpact: dim(), qualityImpact: dim(), customerImpact: dim(), riskComplianceImpact: dim(),
      executionComplexity: "high", timeHorizon7d: horizon("a"), timeHorizon30d: horizon("b"), timeHorizon90d: horizon("c"), timeHorizon6m: horizon("d"),
      rejectedAlternatives: [], requiredProof: ["p"], rollbackTrigger: "t", proposedLeanClassification: LeanClassification.LEAN_APPROVED,
    });
    await saveBusinessImpact(unsafe, {});
    const got = await getBusinessImpact(rec, wsA);
    expect(got?.leanClassification).toBe(LeanClassification.CASH_UNSAFE_REJECTED);
    await expect(enforceBusinessImpactForPromotion(rec, wsA)).rejects.toBeInstanceOf(BusinessImpactGateError);
  });
});
