/**
 * Owner Marketing & Growth (Module 6 Slice 3) — recommendation/action planner
 * tests. Pure/no DB. Verifies traceable recommendations, action conformance to the
 * Spine schema, bounded + deterministic pressure-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability, and
 * that the recommended next action targets the most urgent marketing problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseMarketingSnapshot,
  planMarketingActionsFromDiagnosis,
  buildMarketingRecommendations,
  MARKETING_REC_TEMPLATES,
  type MarketingSnapshotInput,
} from "@/domain/owner-marketing";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function healthy(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    marketingSpend: 50000,
    revenue: 200000,
    leads: 500,
    inquiries: 300,
    orders: 100,
    newCustomers: 90,
    paidLeads: 200,
    organicLeads: 300,
    campaignsRun: 5,
    campaignsWithFollowup: 5,
    contentPosted: 20,
    couponsRedeemed: 10,
    referrals: 18,
    walkIns: 40,
  };
}

function wasting(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    marketingSpend: 100000,
    revenue: 30000,
    leads: 200,
    inquiries: 150,
    orders: 4,
    newCustomers: 4,
    paidLeads: 180,
    organicLeads: 20,
    campaignsRun: 10,
    campaignsWithFollowup: 2,
    contentPosted: 2,
    couponsRedeemed: 1,
    referrals: 0,
    walkIns: 5,
  };
}

function plan(input: MarketingSnapshotInput) {
  return planMarketingActionsFromDiagnosis(diagnoseMarketingSnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) => p.actions.map((a) => a.findingCode);

describe("owner-marketing planner — recommendation/action creation", () => {
  it("wasted spend creates a stop-waste action", () => {
    const p = plan(wasting());
    expect(actionCodes(p)).toContain("MKT_WASTED_SPEND");
    const rec = p.recommendations.find((r) => r.findingCode === "MKT_WASTED_SPEND");
    expect(rec?.category).toBe("stop_waste");
    expect(rec?.recommendationCode).toBe("MKTREC_STOP_WASTE");
  });

  it("low referral creates an activate-referrals action", () => {
    const p = plan(wasting());
    expect(actionCodes(p)).toContain("MKT_LOW_REFERRAL");
    const rec = p.recommendations.find((r) => r.findingCode === "MKT_LOW_REFERRAL");
    expect(rec?.category).toBe("activate_referrals");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(wasting());
    const rec = p.recommendations.find((r) => r.findingCode === "MKT_WASTED_SPEND");
    expect(rec?.sourceMetric).toBe("campaignRoiPct");
    expect(typeof rec?.sourceValue).toBe("number");
    expect(rec?.verificationMetric).toBe("campaignRoiPct");
  });
});

describe("owner-marketing planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, marketing)", () => {
    const p = plan(wasting());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("marketing");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends a critical-severity top action", () => {
    const p = plan(wasting());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is pressure-weighted: marketing risk lifts the same action", () => {
    const p = plan(wasting());
    const risk = diagnoseMarketingSnapshot(wasting(), { now: NOW }).metrics.marketingRiskScore;
    const rec = p.recommendations.find((r) => r.findingCode === "MKT_WASTED_SPEND")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedGrowthImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: risk,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedGrowthImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "MKT_WASTED_SPEND");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-marketing planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [healthy(), wasting()]) {
      const diag = diagnoseMarketingSnapshot(input, { now: NOW });
      const p = planMarketingActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      const withTemplate = diag.findings.filter((f) => MARKETING_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseMarketingSnapshot(wasting(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planMarketingActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildMarketingRecommendations skips findings with no template", () => {
    const recs = buildMarketingRecommendations([
      {
        domain: "marketing",
        code: "MKT_UNKNOWN_NOT_A_TEMPLATE",
        title: "x",
        summary: "x",
        sourceMetric: "x",
        sourceValue: null,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 10,
        urgencyScore: 10,
        findingType: "risk",
        evidence: [],
        missingData: [],
      },
    ]);
    expect(recs).toEqual([]);
  });
});
