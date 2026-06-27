/**
 * Deterministic hostile budget scenario fixture pack (Section 41).
 *
 * Each scenario pins an input business state and the exact expected mode + key
 * decision the engine must produce. These are adversarial (not happy-path): cash
 * that looks safe but is committed away, revenue up while profit collapses, owner
 * wanting to scale early, control violations, low-data caution, and blind
 * cost-cutting that must instead surface a pricing/profit fix.
 */

import type { BudgetAssessmentInput, BudgetMode } from "@/domain/owner-budget/types";

export interface HostileBudgetScenario {
  id: string;
  description: string;
  input: BudgetAssessmentInput;
  expectedMode: BudgetMode;
  /** A substring that MUST appear in the plan's nextBestAction (case-insensitive). */
  expectedNextActionIncludes: string;
  /** Recommendation classes that MUST be blocked (growth/scale should not be approved). */
  expectMode?: BudgetMode[];
}

const base = (over: Partial<BudgetAssessmentInput["finance"]>): BudgetAssessmentInput["finance"] => ({
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  currency: "INR",
  ...over,
});

export const HOSTILE_BUDGET_SCENARIOS: HostileBudgetScenario[] = [
  {
    id: "revenue_up_profit_down",
    description: "Revenue up, profit down — must not celebrate revenue; fix margin.",
    input: {
      finance: base({ revenue: 500000, costOfGoodsOrServices: 380000, fixedCosts: 110000, cashOnHand: 200000 }),
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "PROFIT_INCREASE",
    expectedNextActionIncludes: "leakage",
  },
  {
    id: "cash_safe_but_committed_shortfall",
    description: "Cash looks safe but committed payroll/tax creates a near-term shortfall.",
    input: {
      finance: base({ revenue: 300000, costOfGoodsOrServices: 150000, fixedCosts: 100000, cashOnHand: 120000 }),
      statutoryReserveRequired: 60000,
      obligations: [
        { label: "Payroll", amount: 90000, dueInDays: 5, kind: "payroll" },
        { label: "GST", amount: 30000, dueInDays: 6, kind: "tax" },
      ],
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "EMERGENCY",
    expectedNextActionIncludes: "freeze",
  },
  {
    id: "owner_wants_scale_early",
    description: "Owner wants to scale but cash weak (burning) / owner-dependency high — must not scale.",
    input: {
      // Net loss → short runway → cash not safe → scale/grow blocked.
      finance: base({ revenue: 200000, costOfGoodsOrServices: 150000, fixedCosts: 80000, cashOnHand: 30000 }),
      ownerGoal: "scale",
      ownerDependencyHigh: true,
      demandRepeatable: false,
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "STABILIZE",
    expectedNextActionIncludes: "Tighten spend",
  },
  {
    id: "discount_kills_margin",
    description: "Sales rose via discounts but margin collapsed — profit increase, not more spend.",
    input: {
      finance: base({ revenue: 400000, costOfGoodsOrServices: 300000, fixedCosts: 80000, discountAmount: 60000, cashOnHand: 150000 }),
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "PROFIT_INCREASE",
    expectedNextActionIncludes: "pricing",
  },
  {
    id: "low_data_quality",
    description: "Low data quality → cautious DATA_INSUFFICIENT, block high-risk recommendations.",
    input: {
      finance: base({ revenue: undefined, cashOnHand: undefined }),
      criticalMissingInputs: ["revenue", "cashOnHand", "fixedCosts"],
      dataConfidence: "UNVERIFIED",
    },
    expectedMode: "DATA_INSUFFICIENT",
    expectedNextActionIncludes: "enter",
  },
  {
    id: "healthy_growth_ready",
    description: "Cash safe, margins healthy, capacity available → controlled GROW.",
    input: {
      finance: base({ revenue: 500000, costOfGoodsOrServices: 250000, fixedCosts: 150000, cashOnHand: 400000 }),
      unitEconomicsPositive: true,
      capacityUtilizationPct: 60,
      demandRepeatable: false,
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "GROW",
    expectedNextActionIncludes: "capped test",
  },
  {
    id: "scale_ready_verified",
    description: "Verified data, repeatable demand, low owner-dependency, strong margin → SCALE.",
    input: {
      finance: base({ revenue: 900000, costOfGoodsOrServices: 400000, fixedCosts: 300000, cashOnHand: 800000 }),
      unitEconomicsPositive: true,
      capacityUtilizationPct: 92,
      demandRepeatable: true,
      ownerDependencyHigh: false,
      dataConfidence: "VERIFIED",
    },
    expectedMode: "SCALE",
    expectedNextActionIncludes: "bottleneck",
  },
  {
    id: "control_breach_forces_emergency",
    description: "Active control breach forces EMERGENCY regardless of healthy cash.",
    input: {
      finance: base({ revenue: 600000, costOfGoodsOrServices: 300000, fixedCosts: 150000, cashOnHand: 500000 }),
      controlBreach: true,
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "EMERGENCY",
    expectedNextActionIncludes: "freeze",
  },
  {
    id: "growth_blocked_when_overloaded",
    description: "Workload overloaded / quality slipping → stabilize, do not push growth.",
    input: {
      finance: base({ revenue: 450000, costOfGoodsOrServices: 200000, fixedCosts: 120000, cashOnHand: 300000 }),
      unitEconomicsPositive: true,
      workloadOverloaded: true,
      qualityDeteriorating: true,
      dataConfidence: "OPERATIONAL",
    },
    expectedMode: "STABILIZE",
    expectedNextActionIncludes: "leakage",
  },
];
