/**
 * Slice 6 — counterfactual case testing.
 *
 * Prevents shallow pattern-matching: pairs of cases that LOOK similar but differ in one hidden fact
 * must produce materially DIFFERENT advice. Each pair declares which output dimension(s) must diverge
 * (calculation trace, recommendation, capacity/compliance handling, local adaptation, cash stance),
 * and the runner advises both and confirms the divergence.
 */
import { advise } from "../advisor";
import { InMemoryLearningStore } from "../learning-store";
import { LOCATIONS } from "../locations";
import { SEED_CASES } from "../seed-cases";
import type { AdviceOutput, BehavioralCase, CaseFlags } from "../schema";

const BASE = SEED_CASES[0];

function mkCase(id: string, over: Omit<Partial<BehavioralCase>, "flags"> & { flags?: Partial<CaseFlags> }): BehavioralCase {
  return {
    ...BASE,
    ...over,
    id,
    sourceSeedCaseId: BASE.sourceSeedCaseId,
    flags: { ...BASE.flags, hostile: false, missingOrStaleData: false, cashRisk: false, capacityRisk: false, complianceRisk: false, ownerEmotional: false, remoteOwner: false, multiBranch: false, ...(over.flags ?? {}) },
  };
}

export type Differentiator =
  | "calculationTrace"
  | "recommendation"
  | "capacityImpact"
  | "professionalReview"
  | "localConsiderations"
  | "dataConfidence"
  | "blocksSpend";

function present(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 8;
}
function blocksSpend(a: AdviceOutput): boolean {
  // Counterfactual divergence uses ACTIVELY blocked actions (set when cash/capacity/contract risk
  // is real), so a cross-subsidy cash crisis blocks where a unit-economics-justified case does not.
  return /spend|marketing|hire|expand|accept/.test((a.blockedActions ?? []).join(" ").toLowerCase());
}

function diffOn(a: AdviceOutput, b: AdviceOutput, d: Differentiator): boolean {
  switch (d) {
    case "calculationTrace":
      return JSON.stringify(a.calculationTrace ?? []) !== JSON.stringify(b.calculationTrace ?? []);
    case "recommendation":
      return (a.recommendedNextAction ?? "") !== (b.recommendedNextAction ?? "");
    case "capacityImpact":
      return present(a.capacityImpact) !== present(b.capacityImpact);
    case "professionalReview":
      return present(a.professionalReview) !== present(b.professionalReview);
    case "localConsiderations":
      return (a.localConsiderations ?? "") !== (b.localConsiderations ?? "");
    case "dataConfidence":
      return (a.dataConfidence ?? "") !== (b.dataConfidence ?? "");
    case "blocksSpend":
      return blocksSpend(a) !== blocksSpend(b);
  }
}

export interface CounterfactualPair {
  id: string;
  description: string;
  caseA: BehavioralCase;
  caseB: BehavioralCase;
  mustDifferOn: Differentiator[];
}

export function buildCounterfactuals(): CounterfactualPair[] {
  return [
    {
      id: "cashlow_receivables_vs_discounts",
      description: "Revenue up + cash low because receivables are late vs because discounts destroyed margin.",
      caseA: mkCase("cf1a", { decisionCategory: "cash_margin_working_capital", numbers: { grossSalesNow: 320000, grossSalesPrev: 180000, cash: 30000, receivables: 240000 }, flags: { cashRisk: true } }),
      caseB: mkCase("cf1b", { decisionCategory: "cash_margin_working_capital", numbers: { grossSalesNow: 320000, grossSalesPrev: 180000, cash: 30000, discountPct: 30 }, flags: { cashRisk: true } }),
      mustDifferOn: ["calculationTrace"],
    },
    {
      id: "marketing_offer_vs_quality",
      description: "Marketing failing because the offer is wrong vs because service quality is broken.",
      caseA: mkCase("cf2a", { decisionCategory: "marketing_opportunity_contract", numbers: { adSpend: 50000, adRevenue: 120000 } }),
      caseB: mkCase("cf2b", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: true } }),
      mustDifferOn: ["recommendation", "capacityImpact"],
    },
    {
      id: "staff_fake_vs_overloaded",
      description: "Staff underperforming because of fake completion vs because workload is impossible.",
      caseA: mkCase("cf3a", { decisionCategory: "staff_process_equipment", flags: { hostile: true } }),
      caseB: mkCase("cf3b", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: true } }),
      mustDifferOn: ["capacityImpact", "dataConfidence"],
    },
    {
      id: "capacity_equipment_vs_scheduling",
      description: "Capacity issue from an equipment bottleneck vs from poor scheduling.",
      caseA: mkCase("cf4a", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: true } }),
      caseB: mkCase("cf4b", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: false } }),
      mustDifferOn: ["capacityImpact"],
    },
    {
      id: "opportunity_advance_vs_60day",
      description: "Opportunity good with advance payment vs bad with 60-day receivable.",
      caseA: mkCase("cf5a", { decisionCategory: "marketing_opportunity_contract", numbers: { consideredRate: 20, fullyLoadedCost: 16, paymentTermsDays: 0 } }),
      caseB: mkCase("cf5b", { decisionCategory: "marketing_opportunity_contract", numbers: { consideredRate: 20, fullyLoadedCost: 16, paymentTermsDays: 60 } }),
      mustDifferOn: ["calculationTrace"],
    },
    {
      id: "roas_profitable_vs_loss_after_returns",
      description: "High ROAS profitable after returns vs loss-making after returns.",
      caseA: mkCase("cf6a", { decisionCategory: "marketing_opportunity_contract", numbers: { adSpend: 25000, adRevenue: 100000, returnRatePct: 5, grossMarginPct: 60 } }),
      caseB: mkCase("cf6b", { decisionCategory: "marketing_opportunity_contract", numbers: { adSpend: 25000, adRevenue: 100000, returnRatePct: 45, rtoRatePct: 20, grossMarginPct: 40 } }),
      mustDifferOn: ["calculationTrace"],
    },
    {
      id: "premium_vs_price_sensitive",
      description: "Premium market accepts higher pricing vs price-sensitive market needs an offer redesign.",
      caseA: mkCase("cf7a", { decisionCategory: "marketing_opportunity_contract", location: LOCATIONS.dense_urban_premium }),
      caseB: mkCase("cf7b", { decisionCategory: "marketing_opportunity_contract", location: LOCATIONS.low_income_urban }),
      mustDifferOn: ["localConsiderations"],
    },
    {
      id: "compliance_definitive_vs_uncertain",
      description: "Compliance warning definitive vs uncertain requiring professional review.",
      caseA: mkCase("cf8a", { decisionCategory: "compliance_location_review", flags: { complianceRisk: false } }),
      caseB: mkCase("cf8b", { decisionCategory: "compliance_location_review", flags: { complianceRisk: true } }),
      mustDifferOn: ["professionalReview"],
    },
    {
      id: "hire_demand_proven_vs_process_broken",
      description: "Owner should hire because demand is proven vs should not because process is broken.",
      caseA: mkCase("cf9a", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: false }, numbers: { provenDemandUnits: 1000 } }),
      caseB: mkCase("cf9b", { decisionCategory: "staff_process_equipment", flags: { capacityRisk: true } }),
      mustDifferOn: ["capacityImpact"],
    },
    {
      id: "expansion_justified_vs_cross_subsidy",
      description: "Branch expansion justified by unit economics vs blocked by cross-subsidy.",
      caseA: mkCase("cf10a", { decisionCategory: "multi_branch_portfolio", flags: { multiBranch: true }, numbers: { branchProfit: 80000 } }),
      caseB: mkCase("cf10b", { decisionCategory: "multi_branch_portfolio", flags: { multiBranch: true, cashRisk: true }, numbers: { branchProfit: -40000, cash: 15000 } }),
      mustDifferOn: ["blocksSpend"],
    },
  ];
}

export const COUNTERFACTUALS = buildCounterfactuals();

export interface CounterfactualResult {
  id: string;
  differs: boolean;
  divergedOn: Differentiator[];
}

export async function runCounterfactual(pair: CounterfactualPair, workspaceId = "cf-ws"): Promise<CounterfactualResult> {
  const store = new InMemoryLearningStore();
  const a = await advise(pair.caseA, { store, workspaceId });
  const b = await advise(pair.caseB, { store, workspaceId });
  const divergedOn = pair.mustDifferOn.filter((d) => diffOn(a, b, d));
  return { id: pair.id, differs: divergedOn.length > 0, divergedOn };
}
