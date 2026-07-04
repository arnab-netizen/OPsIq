/**
 * Real-World Wealth Phase proof (owner requirement §3).
 *
 * Ten realistic, messy owner scenarios driven through the ACTUAL composed loop
 * (composeWealthCommandCenter). Each is scored 0-100 on the owner rubric (§8):
 * business-state accuracy, missing-data honesty, financial/capital safety,
 * wealth-path quality, opportunity cost, workload transfer, work-package
 * actionability, proof/fake-work resistance, outcome/learning, better-than-baseline.
 *
 * Thresholds: ordinary >= 85, high-risk (finance/expansion/compliance) >= 90,
 * and ZERO critical safety failures (an unsafe action that is not blocked).
 */
import { describe, it, expect } from "vitest";
import { composeWealthCommandCenter } from "@/domain/owner-strategy/command-center";
import type { WealthCommandCenterInput, ProposedAction, WealthCommandCenter } from "@/domain/owner-strategy/command-center.types";
import type { WealthPathType } from "@/domain/owner-strategy/wealth-path.types";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

interface Expected {
  pathType?: WealthPathType;
  unsafe?: boolean; // scenario carries an unsafe action that MUST be blocked/downgraded
  sparse?: boolean; // missing data MUST be disclosed
  highRisk?: boolean; // threshold 90 instead of 85
}

interface Scored {
  score: number;
  breakdown: Record<string, number>;
  criticalFail: boolean;
}

function scoreWealth(cc: WealthCommandCenter, exp: Expected): Scored {
  const b: Record<string, number> = {};
  b.state = cc.wealthPath ? (!exp.pathType || cc.wealthPath.pathType === exp.pathType ? 10 : 4) : 0;
  b.missing = cc.wealthPath ? (exp.sparse ? (cc.wealthPath.missingInputs.length > 0 ? 10 : 0) : 10) : 0;
  const safe = exp.unsafe
    ? cc.nextBestMove.decision === "BLOCKED" || cc.cashSafety?.allowed === false || cc.wealthPath?.blocksHighRiskExecution === true
    : true;
  b.safety = safe ? 10 : 0;
  b.quality = cc.businessModelQuality && (cc.wealthPath?.quality.inputsUsed.length ?? 0) > 0 ? 10 : 0;
  b.oppcost = cc.opportunityCost ? 10 : 4;
  b.workload = cc.ownerWorkloadTransfer ? 10 : 0;
  b.actionable = cc.workPackage ? 10 : 0; // a safe BLOCK is a valid actionable output
  b.proof = cc.proofRequirement ? 10 : 0;
  b.learning = cc.workPackage?.learningUpdateRule ? 10 : 0;
  b.better = cc.wealthPath && cc.businessModelQuality && cc.workPackage ? 10 : 0; // elements old OpsIQ lacked
  const score = Object.values(b).reduce((a, c) => a + c, 0);
  return { score, breakdown: b, criticalFail: !!exp.unsafe && !safe };
}

function act(over: Partial<ProposedAction> & Pick<ProposedAction, "label" | "kind" | "workPackageKind">): ProposedAction {
  return { downsideRisk: "low", evidenceStrength: "medium", financialDecision: "APPROVED", assigneeRole: "staff", ...over };
}

const SCENARIOS: { id: string; name: string; input: WealthCommandCenterInput; expected: Expected }[] = [
  {
    id: "RW-W01",
    name: "Local service: cash pressure + complaints + low repeat + growth ambition",
    input: {
      businessName: "CleanCo Laundry",
      wealthPathInput: { netMarginPct: 4, grossMarginPct: 42, cashRunwayMonths: 2, repeatCustomerPct: 15, expansionPath: "local" },
      proposedAction: act({ label: "Launch paid ads to grow now", kind: "marketing", workPackageKind: "marketing_campaign", downsideRisk: "high", evidenceStrength: "low", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE }),
      alternatives: [{ label: "Stabilize + reactivate repeat customers", kind: "customer_retention", downsideRisk: "low", evidenceStrength: "high", grossMarginPotentialPct: 42, repeatPurchasePotential: "high", cashConversion: "high" }],
      cash: { cashflowState: "AT_RISK", survivalState: "AT_RISK" },
    },
    expected: { unsafe: true, sparse: true, highRisk: true },
  },
  {
    id: "RW-W02",
    name: "Attractive revenue, weak margins (revenue vanity)",
    input: {
      businessName: "BulkResell",
      wealthPathInput: { monthlyRevenue: 4000000, netMarginPct: 1, grossMarginPct: 9, capitalIntensity: "high", workingCapitalPressure: "high", downsideRisk: "high", differentiation: "none", competitiveMoat: "none", expansionPath: "local" },
      proposedAction: act({ label: "Chase more revenue", kind: "marketing", workPackageKind: "marketing_campaign", downsideRisk: "high", evidenceStrength: "low" }),
      alternatives: [{ label: "Preserve cash", kind: "preserve_cash", downsideRisk: "low", evidenceStrength: "high" }],
    },
    expected: { pathType: "trap_business" },
  },
  {
    id: "RW-W03",
    name: "Strong cashflow, low scalability (good local profit)",
    input: {
      wealthPathInput: { netMarginPct: 20, grossMarginPct: 58, expansionPath: "local", differentiation: "moderate", competitiveMoat: "weak", ownerIsPrimaryOperator: false, staffCanRunWithoutOwner: true },
      proposedAction: act({ label: "Improve retention + reviews", kind: "customer_retention", workPackageKind: "review_request" }),
    },
    expected: { pathType: "local_profit_business" },
  },
  {
    id: "RW-W04",
    name: "Exciting but a trap (capital sink, negative net)",
    input: {
      wealthPathInput: { netMarginPct: -8, grossMarginPct: 20, capitalIntensity: "high", downsideRisk: "high", expansionPath: "local" },
      proposedAction: act({ label: "Buy more inventory", kind: "equipment_purchase", workPackageKind: "generic", downsideRisk: "high", evidenceStrength: "low" }),
      alternatives: [{ label: "Preserve cash", kind: "preserve_cash", downsideRisk: "low", evidenceStrength: "high" }],
    },
    expected: { pathType: "trap_business" },
  },
  {
    id: "RW-W05",
    name: "Owner wants to expand before the unit is stable",
    input: {
      wealthPathInput: { netMarginPct: 9, grossMarginPct: 48, expansionPath: "multi_unit", repeatCustomerPct: 25 },
      proposedAction: act({ label: "Open a second branch", kind: "expansion", workPackageKind: "generic", downsideRisk: "high", capitalRequirement: "high", evidenceStrength: "low", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE }),
      cash: { cashflowState: "AT_RISK", survivalState: "SAFE" },
    },
    expected: { unsafe: true, highRisk: true },
  },
  {
    id: "RW-W06",
    name: "Owner wants paid marketing without tracking or margin safety",
    input: {
      wealthPathInput: { netMarginPct: 7, grossMarginPct: 40, expansionPath: "local" },
      proposedAction: act({ label: "Big paid ads blast", kind: "marketing", workPackageKind: "marketing_campaign", downsideRisk: "high", evidenceStrength: "low", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE }),
      cash: { cashflowState: "AT_RISK", survivalState: "AT_RISK" },
    },
    expected: { unsafe: true, highRisk: true },
  },
  {
    id: "RW-W07",
    name: "Owner wants to invest capital while runway is weak",
    input: {
      wealthPathInput: { netMarginPct: 8, cashRunwayMonths: 1 },
      proposedAction: act({ label: "Invest in new equipment", kind: "equipment_purchase", workPackageKind: "generic", downsideRisk: "high", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE, evidenceStrength: "medium" }),
      cash: { cashflowState: "CRITICAL", survivalState: "CRITICAL" },
      capital: { approvedBudget: 100000, reserveRequired: 90000, mode: "EMERGENCY", confidence: "LOW", candidates: [{ id: "c1", label: "Reserve", category: "survival_reserve", amount: 90000, reversible: false }, { id: "c2", label: "Equipment", category: "growth_roi", amount: 60000, reversible: true, expectedReturnPct: 25 }] },
    },
    expected: { unsafe: true, highRisk: true },
  },
  {
    id: "RW-W08",
    name: "Multiple opportunities, limited capital (opportunity cost)",
    input: {
      wealthPathInput: { netMarginPct: 15, grossMarginPct: 55, expansionPath: "local", ownerIsPrimaryOperator: false, staffCanRunWithoutOwner: true },
      proposedAction: act({ label: "Referral program", kind: "referral_request", workPackageKind: "referral_request", evidenceStrength: "high", grossMarginPotentialPct: 55, cashConversion: "high", repeatPurchasePotential: "high" }),
      alternatives: [
        { label: "Buy a delivery van", kind: "equipment_purchase", downsideRisk: "high", capitalRequirement: "high", evidenceStrength: "low" },
        { label: "Hire another cleaner", kind: "hiring", downsideRisk: "medium", evidenceStrength: "low" },
      ],
    },
    expected: {},
  },
  {
    id: "RW-W09",
    name: "Owner-dependent job disguised as a business",
    input: {
      wealthPathInput: { netMarginPct: 22, grossMarginPct: 60, expansionPath: "local", ownerIsPrimaryOperator: true, staffCanRunWithoutOwner: false, ownerHoursPerWeek: 72 },
      proposedAction: act({ label: "Take on more clients personally", kind: "expansion", workPackageKind: "generic", downsideRisk: "high", evidenceStrength: "low" }),
      alternatives: [{ label: "Train staff to reduce owner dependency", kind: "staff_training", downsideRisk: "low", evidenceStrength: "high" }],
    },
    expected: { pathType: "owner_dependent_job", unsafe: true, highRisk: true },
  },
  {
    id: "RW-W10",
    name: "Good business, bad timing (strong model, cash crisis)",
    input: {
      wealthPathInput: { netMarginPct: 26, grossMarginPct: 68, expansionPath: "product", differentiation: "strong", competitiveMoat: "strong" },
      proposedAction: act({ label: "Expand the product line", kind: "expansion", workPackageKind: "generic", marketDemand: "high", grossMarginPotentialPct: 68, netMarginPotentialPct: 26, scalability: "high", differentiationPossibility: "strong", downsideRisk: "medium", evidenceStrength: "high", riskSensitivity: RecommendationSensitivity.GROWTH_SENSITIVE }),
      cash: { cashflowState: "CRITICAL", survivalState: "AT_RISK" },
    },
    expected: { unsafe: true, highRisk: true },
  },
];

describe("Real-World Wealth Phase — 10 messy scenarios, scored", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id} ${sc.name}`, () => {
      const cc = composeWealthCommandCenter(sc.input);
      const r = scoreWealth(cc, sc.expected);
      const threshold = sc.expected.highRisk ? 90 : 85;
      // Surface the breakdown on failure.
      expect(r.criticalFail, `${sc.id} critical safety failure: unsafe action not blocked`).toBe(false);
      expect(r.score, `${sc.id} scored ${r.score}/100 (< ${threshold}); breakdown=${JSON.stringify(r.breakdown)}`).toBeGreaterThanOrEqual(threshold);
      if (sc.expected.pathType) expect(cc.wealthPath!.pathType).toBe(sc.expected.pathType);
    });
  }
});
