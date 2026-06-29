/**
 * Slice C (1/3) — profitability / efficiency control layer.
 *
 * OpsIQ must optimise profit and efficiency, not revenue alone. Every relevant recommendation is
 * checked against 15 profitability considerations; advice that celebrates revenue while profit/cash
 * worsens, ignores rework/waste/refunds, ignores owner time cost, or walks into a working-capital
 * trap is flagged. The layer feeds arbitration (a working-capital trap becomes a blocking constraint).
 */
import { deriveCalcs } from "../expert/business-math";
import { activeConstraints } from "./arbitration";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const PROFIT_CONSIDERATIONS = [
  "revenue", "gross_margin", "contribution_margin", "net_margin", "fixed_cost_burden", "working_capital",
  "capacity_utilization", "labour_productivity", "rework_waste_refund", "retention_repeat", "owner_time_cost",
  "cash_conversion_cycle", "unit_economics", "opportunity_cost", "stop_loss",
] as const;
export type ProfitConsideration = (typeof PROFIT_CONSIDERATIONS)[number];

function txt(a: AdviceOutput): string {
  return JSON.stringify(a).toLowerCase();
}
function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 6;
}

export interface ProfitabilityResult {
  considered: Record<ProfitConsideration, boolean>;
  consideredCount: number;
  revenueOverProfit: boolean; // celebrates revenue while cash/margin worsens
  reworkIncluded: boolean;
  ownerTimeCostConsidered: boolean;
  workingCapitalTrap: boolean;
  violations: string[];
  passed: boolean;
}

export function profitabilityCheck(c: BehavioralCase, a: AdviceOutput): ProfitabilityResult {
  const t = txt(a);
  const calc = deriveCalcs(c);
  const considered: Record<ProfitConsideration, boolean> = {
    revenue: /revenue|sales/.test(t),
    gross_margin: /gross margin|margin/.test(t),
    contribution_margin: /contribution|margin/.test(t),
    net_margin: /net margin|net |after returns/.test(t),
    fixed_cost_burden: /fixed cost|rent|overhead/.test(t),
    working_capital: /working capital|receivable|payment terms|cash conversion/.test(t),
    capacity_utilization: /capacity|utilization|utilisation|throughput/.test(t),
    labour_productivity: /staff|labour|productivity|utilisation|shift/.test(t),
    rework_waste_refund: /rework|waste|refund|return|rto|spoilage|lost/.test(t),
    retention_repeat: /retention|repeat|churn|complaint/.test(t),
    owner_time_cost: has(a.ownerWorkloadReduction) || /owner (time|hours|workload|bottleneck)/.test(t),
    cash_conversion_cycle: /cash conversion|receivable|payment terms|runway/.test(t),
    unit_economics: /unit econ|contribution|cost per|per unit|per order/.test(t),
    opportunity_cost: /opportunity cost|displace|instead of|trade-?off/.test(t),
    stop_loss: has(a.reassessmentTrigger) || /stop|threshold|worsen/.test(t),
  };
  const warnsCash = has(a.cashMarginRisk) || /cash|margin/.test(t);
  const revenueOverProfit = /revenue is up|sales grew|growing revenue|more sales|grow revenue/.test(t) && (c.flags.cashRisk || /margin/i.test(c.hiddenRootCause)) && !warnsCash;
  const workingCapitalTrap = c.decisionCategory === "marketing_opportunity_contract" && calc.contractMarginAfterTerms !== null && calc.contractMarginAfterTerms <= 0 && /accept|sign|take the contract/.test(`${a.recommendedNextAction ?? ""}`.toLowerCase());

  const violations: string[] = [];
  if (revenueOverProfit) violations.push("celebrates revenue while cash/margin worsens");
  if (workingCapitalTrap) violations.push("accepts a working-capital-trap contract (margin ≤0 after terms)");
  if ((c.flags.capacityRisk || /rework|complaint/i.test(c.hiddenRootCause)) && !considered.rework_waste_refund) violations.push("ignores rework/waste/refund cost in margin");

  return {
    considered,
    consideredCount: PROFIT_CONSIDERATIONS.filter((k) => considered[k]).length,
    revenueOverProfit,
    reworkIncluded: considered.rework_waste_refund,
    ownerTimeCostConsidered: considered.owner_time_cost,
    workingCapitalTrap,
    violations,
    passed: violations.length === 0,
  };
}

/** The profitability layer can promote a working-capital trap into a blocking arbitration constraint. */
export function affectsArbitration(c: BehavioralCase): boolean {
  return activeConstraints(c).includes("below_margin") || activeConstraints(c).includes("cash_survival");
}
