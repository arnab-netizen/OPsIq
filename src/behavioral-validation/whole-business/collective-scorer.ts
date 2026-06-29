/**
 * Slice D (2/2) — collective whole-business outcome score (out of 100).
 *
 * Grades the integrated operating plan as a whole, not as disconnected domain rubrics. A plan fails
 * if it gives good single-domain advice while ignoring cash, customers/staff, or profit; if it does
 * not pick ONE top priority; if it floods the owner with tasks without offload; if it omits
 * proof/outcome or what-to-stop; or if it does not show tradeoffs.
 */
import { buildWholeBusinessPlan, type WholeBusinessPlan } from "./whole-plan";
import type { Constraint } from "./arbitration";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const COLLECTIVE_WEIGHTS = {
  correct_top_priority: 15,
  cross_domain_tradeoff: 15,
  cash_profit_growth_balance: 15,
  operational_feasibility: 10,
  staff_customer_sustainability: 10,
  owner_workload_reduction: 10,
  execution_proof_reassessment: 10,
  learning_adaptation: 10,
  location_context_realism: 5,
} as const;
export type CollectiveCategory = keyof typeof COLLECTIVE_WEIGHTS;

function ok(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 8 && !/^not specified/i.test(s.trim());
}
function list(xs?: string[]): boolean {
  return Array.isArray(xs) && xs.filter((x) => x && !/^no (prior )?learning|^defer only/i.test(x)).length > 0;
}

export interface CollectiveScore {
  total: number;
  categories: Record<CollectiveCategory, number>;
  failConditions: string[];
  passed: boolean;
}

export function scoreCollectivePlan(plan: WholeBusinessPlan, expectedTopPriority?: Constraint | string): CollectiveScore {
  const cats = {} as Record<CollectiveCategory, number>;
  const award = (k: CollectiveCategory, pass: boolean, partial = 0) => (cats[k] = pass ? COLLECTIVE_WEIGHTS[k] : Math.round(COLLECTIVE_WEIGHTS[k] * partial));

  const topMatches = !expectedTopPriority || plan.highestPriorityConstraint === expectedTopPriority;
  award("correct_top_priority", topMatches);
  award("cross_domain_tradeoff", plan.arbitration.rejectedAlternatives.length > 0 && plan.stopDoNotDoList.length > 0, 0.3);
  award("cash_profit_growth_balance", ok(plan.financeCashImpact) && ok(plan.marginPricingImpact) && ok(plan.plan90Day), 0.3);
  award("operational_feasibility", ok(plan.operationsProcessImpact) && ok(plan.equipmentCapacityImpact), 0.5);
  award("staff_customer_sustainability", ok(plan.staffTrainingImpact) && ok(plan.customerReputationImpact), 0.5);
  award("owner_workload_reduction", plan.opsiqPreparedWork.length > 0 && plan.delegatedWork.length > 0);
  award("execution_proof_reassessment", list(plan.proofRequired) && plan.reassessmentTriggers.length > 0 && plan.successMetrics.length > 0, 0.3);
  award("learning_adaptation", list(plan.learningUsed), 0.3);
  award("location_context_realism", plan.domainHealthTable.some((d) => d.domain === "location_market") || /india|singapore|uk|us|uae|local/i.test(plan.businessHealthSummary), 0.4);

  const failConditions: string[] = [];
  if (expectedTopPriority && !topMatches) failConditions.push(`wrong top priority (${plan.highestPriorityConstraint} ≠ ${expectedTopPriority})`);
  if (!plan.highestPriorityConstraint) failConditions.push("no single top priority selected");
  const cashRed = plan.domainHealthTable.some((d) => (d.domain === "cash_flow" || d.domain === "working_capital") && d.status === "red");
  if (cashRed && !/cash|spend|margin/i.test(plan.stopDoNotDoList.join(" ").toLowerCase())) failConditions.push("ignores cash while recommending domain action");
  if (plan.ownerApprovalRequired && plan.opsiqPreparedWork.length === 0 && plan.delegatedWork.length === 0) failConditions.push("owner overloaded without offload");
  if (!list(plan.proofRequired) || plan.successMetrics.length === 0) failConditions.push("no proof / outcome defined");
  if (plan.stopDoNotDoList.length === 0 && plan.ignoreDeferList.length === 0) failConditions.push("nothing to stop/defer stated");
  if (plan.arbitration.rejectedAlternatives.length === 0 && plan.stopDoNotDoList.length === 0) failConditions.push("no tradeoffs explained");

  const total = Math.round(Object.values(cats).reduce((a, b) => a + b, 0) * 10) / 10;
  return { total, categories: cats, failConditions, passed: failConditions.length === 0 && total >= 90 };
}

export function scoreWholeBusiness(c: BehavioralCase, a: AdviceOutput, expectedTopPriority?: Constraint | string): CollectiveScore {
  return scoreCollectivePlan(buildWholeBusinessPlan(c, a), expectedTopPriority);
}
