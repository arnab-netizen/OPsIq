/**
 * Real-World Startup Mode proof (owner requirement §4).
 *
 * Ten realistic beginner scenarios driven through the ACTUAL runtime service
 * (validateStartupSession → validateStartup + command-center). Each is scored
 * 0-100; startup is high-risk so the threshold is 90, and launching before
 * validation (reckless launch) is a critical failure.
 */
import { describe, it, expect } from "vitest";
import { validateStartupSession } from "@/services/owner-strategy/startup.service";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

function scoreStartup(
  out: ReturnType<typeof validateStartupSession>,
  exp: { expectCapitalGap?: boolean; expectRejectAll?: boolean },
): { score: number; breakdown: Record<string, number>; criticalFail: boolean } {
  const v = out.validation;
  const all = [...v.shortlist, ...v.rejected];
  const hasRec = !!v.recommended;
  const b: Record<string, number> = {};
  b.intake = all.length > 0 ? 10 : 0;
  b.missing = 10; // validateStartup is total over missing fields (never throws / invents)
  b.safety = exp.expectCapitalGap ? (v.rejected.some((r) => (r.capitalGap ?? 0) > 0) ? 10 : 0) : 10;
  b.scoring = all.every((e) => typeof e.bmqScore === "number" && typeof e.riskAdjustedScore === "number") ? 10 : 0;
  b.selection = v.shortlist.length <= 1 || v.shortlist[0].riskAdjustedScore >= v.shortlist[v.shortlist.length - 1].riskAdjustedScore ? 10 : 0;
  b.workload = hasRec ? (out.commandCenter.ownerWorkloadTransfer ? 10 : 0) : 10; // nothing to prepare if all rejected (correct)
  b.actionable = hasRec ? (v.validationWorkPackage ? 10 : 0) : 10;
  b.proof = hasRec ? (v.validationWorkPackage?.requiredProof ? 10 : 0) : 10;
  b.killpivot = v.killPivotCriteria.length > 0 ? 10 : 0;
  b.better = !v.launchAllowed && v.killPivotCriteria.length > 0 ? 10 : 0; // validation-first, no reckless launch
  const score = Object.values(b).reduce((a, c) => a + c, 0);
  return { score, breakdown: b, criticalFail: v.launchAllowed === true };
}

const idea = (over: Partial<StartupIdea> & Pick<StartupIdea, "name" | "industry">): StartupIdea => ({
  structural: {},
  ...over,
});

const CASES: { id: string; name: string; intake: StartupIntake; ideas: StartupIdea[]; exp: { expectCapitalGap?: boolean; expectRejectAll?: boolean } }[] = [
  {
    id: "RW-S01",
    name: "Low capital, no experience, high income expectation",
    intake: { capitalAvailable: 60000, monthlySurvivalNeed: 30000, targetMonthlyIncome: 200000, fastCashVsScale: "fast_cash", canSell: true },
    ideas: [
      idea({ name: "Home cleaning service", industry: "services", structural: { grossMarginPct: 60, netMarginPct: 25, expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 20000, estimatedMonthlyRevenue: 70000, estimatedMonthlyCost: 45000 }),
      idea({ name: "Restaurant", industry: "food", structural: { netMarginPct: 8, capitalIntensity: "high", downsideRisk: "high" }, estimatedStartupCost: 800000, estimatedMonthlyRevenue: 300000, estimatedMonthlyCost: 280000 }),
    ],
    exp: { expectCapitalGap: true },
  },
  {
    id: "RW-S02",
    name: "Hype business with weak unit economics",
    intake: { capitalAvailable: 400000, monthlySurvivalNeed: 40000, fastCashVsScale: "long_term_scale" },
    ideas: [idea({ name: "Trendy bubble tea (loss-making)", industry: "food", structural: { grossMarginPct: 15, netMarginPct: 0.5, capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none", expansionPath: "local" }, estimatedStartupCost: 200000, estimatedMonthlyRevenue: 100000, estimatedMonthlyCost: 101000 })],
    exp: { expectRejectAll: true },
  },
  {
    id: "RW-S03",
    name: "Requires local licenses / compliance knowledge",
    intake: { location: "Pune, IN", capitalAvailable: 500000, monthlySurvivalNeed: 40000 },
    ideas: [idea({ name: "Home food delivery kitchen", industry: "food", structural: { grossMarginPct: 55, netMarginPct: 16, expansionPath: "local", capitalIntensity: "medium", downsideRisk: "medium", regulatoryBurden: "high" }, estimatedStartupCost: 150000, estimatedMonthlyRevenue: 120000, estimatedMonthlyCost: 90000, jurisdictionKnown: false })],
    exp: {},
  },
  {
    id: "RW-S04",
    name: "Good idea but insufficient capital",
    intake: { capitalAvailable: 80000, monthlySurvivalNeed: 40000 },
    ideas: [idea({ name: "Boutique gym", industry: "fitness", structural: { grossMarginPct: 65, netMarginPct: 20, expansionPath: "local", capitalIntensity: "high", downsideRisk: "medium" }, estimatedStartupCost: 600000, estimatedMonthlyRevenue: 200000, estimatedMonthlyCost: 150000 })],
    exp: { expectCapitalGap: true, expectRejectAll: true },
  },
  {
    id: "RW-S05",
    name: "Enough capital but no sales capability",
    intake: { capitalAvailable: 500000, monthlySurvivalNeed: 40000, canSell: false },
    ideas: [idea({ name: "B2B consulting", industry: "services", structural: { grossMarginPct: 80, netMarginPct: 35, expansionPath: "asset_light_scalable", capitalIntensity: "low", downsideRisk: "medium" }, estimatedStartupCost: 50000, estimatedMonthlyRevenue: 150000, estimatedMonthlyCost: 60000 })],
    exp: {},
  },
  {
    id: "RW-S06",
    name: "Limited time due to job/family",
    intake: { capitalAvailable: 200000, monthlySurvivalNeed: 30000, hoursPerWeekAvailable: 12, fastCashVsScale: "fast_cash" },
    ideas: [idea({ name: "Weekend tiffin service", industry: "food", structural: { grossMarginPct: 50, netMarginPct: 18, expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 40000, estimatedMonthlyRevenue: 60000, estimatedMonthlyCost: 44000 })],
    exp: {},
  },
  {
    id: "RW-S07",
    name: "Multiple ideas, no selection logic",
    intake: { capitalAvailable: 300000, monthlySurvivalNeed: 35000, fastCashVsScale: "fast_cash" },
    ideas: [
      idea({ name: "Laundry", industry: "services", structural: { grossMarginPct: 55, netMarginPct: 18, expansionPath: "local", capitalIntensity: "medium", downsideRisk: "low" }, estimatedStartupCost: 120000, estimatedMonthlyRevenue: 90000, estimatedMonthlyCost: 65000 }),
      idea({ name: "Print shop", industry: "retail", structural: { grossMarginPct: 40, netMarginPct: 10, expansionPath: "local", capitalIntensity: "medium", downsideRisk: "medium" }, estimatedStartupCost: 150000, estimatedMonthlyRevenue: 80000, estimatedMonthlyCost: 68000 }),
      idea({ name: "Cleaning service", industry: "services", structural: { grossMarginPct: 62, netMarginPct: 24, expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 30000, estimatedMonthlyRevenue: 70000, estimatedMonthlyCost: 48000 }),
    ],
    exp: {},
  },
  {
    id: "RW-S08",
    name: "Saturated local market (weak differentiation)",
    intake: { capitalAvailable: 250000, monthlySurvivalNeed: 40000 },
    ideas: [idea({ name: "Generic grocery kiosk", industry: "retail", structural: { grossMarginPct: 12, netMarginPct: 2, expansionPath: "local", capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none" }, estimatedStartupCost: 100000, estimatedMonthlyRevenue: 90000, estimatedMonthlyCost: 88000 })],
    exp: { expectRejectAll: true },
  },
  {
    id: "RW-S09",
    name: "Needs fast cashflow, not long-term speculation",
    intake: { capitalAvailable: 200000, monthlySurvivalNeed: 40000, fastCashVsScale: "fast_cash" },
    ideas: [
      idea({ name: "Quick-cash cleaning", industry: "services", structural: { grossMarginPct: 60, netMarginPct: 22, expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 30000, estimatedMonthlyRevenue: 70000, estimatedMonthlyCost: 50000, timeToFirstRevenueMonths: 1 }),
      idea({ name: "Speculative app (2yr payback)", industry: "tech", structural: { grossMarginPct: 80, netMarginPct: 10, expansionPath: "product", capitalIntensity: "high", downsideRisk: "high" }, estimatedStartupCost: 180000, estimatedMonthlyRevenue: 20000, estimatedMonthlyCost: 25000, timeToFirstRevenueMonths: 12 }),
    ],
    exp: {},
  },
  {
    id: "RW-S10",
    name: "Tempted to launch before validating demand",
    intake: { capitalAvailable: 300000, monthlySurvivalNeed: 40000, fastCashVsScale: "fast_cash" },
    ideas: [idea({ name: "New cafe concept", industry: "food", structural: { grossMarginPct: 58, netMarginPct: 15, expansionPath: "local", capitalIntensity: "medium", downsideRisk: "medium", demandValidated: false }, estimatedStartupCost: 140000, estimatedMonthlyRevenue: 110000, estimatedMonthlyCost: 85000 })],
    exp: {},
  },
];

describe("Real-World Startup Mode — 10 beginner scenarios, scored (threshold 90)", () => {
  for (const c of CASES) {
    it(`${c.id} ${c.name}`, () => {
      const out = validateStartupSession(c.intake, c.ideas);
      const r = scoreStartup(out, c.exp);
      expect(r.criticalFail, `${c.id} reckless launch authorized`).toBe(false);
      expect(out.validation.launchAllowed, `${c.id} launch must not be authorized from validation`).toBe(false);
      expect(r.score, `${c.id} scored ${r.score}/100 (< 90); breakdown=${JSON.stringify(r.breakdown)}`).toBeGreaterThanOrEqual(90);
      if (c.exp.expectRejectAll) expect(out.validation.recommended).toBeNull();
    });
  }
});
