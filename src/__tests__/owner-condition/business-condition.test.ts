/**
 * Owner Command Center (Module 2 Slice 8) — Business Condition rollup (no DB).
 * Proves the pure finance→spine mappers, the cross-domain profile assembly +
 * single prioritized next action, and the route's canonical enforcement wiring.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  financeCycleToDomainScore,
  financeActionRowToOwnerAction,
} from "@/services/owner-condition/business-condition.service";
import {
  buildBusinessConditionProfile,
  ownerActionSchema,
  domainScoreSchema,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-12T00:00:00.000Z");

function cycleRow(over: Record<string, unknown> = {}) {
  return {
    overallHealthScore: 40,
    survivalRiskScore: 80,
    growthOpportunityScore: 30,
    dataConfidenceScore: 65,
    generatedAt: NOW,
    findings: [{ code: "FIN_NEGATIVE_NET_MARGIN" }, { code: "FIN_LOW_RUNWAY" }],
    actions: [{ findingCode: "FIN_NEGATIVE_NET_MARGIN" }],
    ...over,
  };
}

function actionRow(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    findingCode: "FIN_NEGATIVE_NET_MARGIN",
    title: "Return to net profit",
    description: "Cut costs or raise revenue.",
    ownerRole: "owner",
    priorityScore: 88,
    effortScore: 70,
    expectedImpactScore: 90,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "netMarginPct",
    verificationMethod: "before/after",
    expectedTimeframeDays: 30,
    ...over,
  };
}

describe("Owner condition — finance→spine mappers", () => {
  it("maps a finance cycle row to a valid DomainScore (clamped)", () => {
    const ds = financeCycleToDomainScore(cycleRow({ overallHealthScore: 140, survivalRiskScore: -5 }));
    expect(ds.domain).toBe("finance");
    expect(ds.healthScore).toBe(100); // clamped
    expect(ds.riskScore).toBe(0); // clamped
    expect(ds.dataConfidenceScore).toBe(65);
    expect(ds.topFindingCodes).toContain("FIN_NEGATIVE_NET_MARGIN");
    expect(domainScoreSchema.safeParse(ds).success).toBe(true);
  });

  it("maps a finance action row to a schema-valid OwnerAction", () => {
    const a = financeActionRowToOwnerAction(actionRow());
    expect(a.domain).toBe("finance");
    expect(ownerActionSchema.safeParse(a).success).toBe(true);
  });
});

describe("Owner condition — Business Condition Profile assembly", () => {
  it("rolls a finance domain into a profile and selects the top action", () => {
    const domainScores = [financeCycleToDomainScore(cycleRow())];
    const topActions = [
      financeActionRowToOwnerAction(actionRow({ id: "a-low", findingCode: "FIN_OPP_DATA_QUALITY", title: "low", priorityScore: 20 })),
      financeActionRowToOwnerAction(actionRow({ id: "a-high", title: "high", priorityScore: 88 })),
    ];
    const profile = buildBusinessConditionProfile({
      businessId: "biz1", workspaceId: "ws1", domainScores, topActions, missingCriticalData: ["revenue"], now: NOW,
    });
    expect(profile.domainScores.map((d) => d.domain)).toEqual(["finance"]);
    expect(profile.survivalRiskScore).toBe(80); // finance is a survival domain
    expect(profile.recommendedNextAction?.id).toBe("a-high"); // highest priority
    expect(profile.missingCriticalData).toEqual(["revenue"]); // carried, not invented
    expect(profile.generatedAt).toBe(NOW);
  });
});

describe("Owner command-center route enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../app/api/owner/command-center/route.ts"),
    "utf8"
  );
  it("is canonically enforced, workspace-scoped, OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("does not touch recovery tables/routes", () => {
    expect(src).not.toMatch(/recovery/i);
  });
});
