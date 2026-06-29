/**
 * Slice 8 — owner-goal alignment and constraint checking.
 *
 * OpsIQ optimises for the owner's stated goal ONLY within safe constraints. It must challenge an
 * unrealistic/unsafe goal, surface the blocking constraints, propose a safer staged path, and never
 * chase vanity revenue against cash/profit, overburden staff, or silently increase owner workload.
 */
import { advise, type AdviseContext } from "../advisor";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const OWNER_GOALS = [
  "survive_cash_crunch",
  "increase_profit",
  "increase_revenue",
  "reduce_owner_workload",
  "stabilize_quality",
  "expand_new_branch",
  "accept_b2b_contract",
  "improve_staff_accountability",
  "reduce_complaints",
  "prepare_for_sale",
  "avoid_shutdown",
  "decide_shutdown_or_pivot",
] as const;
export type OwnerGoal = (typeof OWNER_GOALS)[number];

const GROWTH_GOALS = new Set<OwnerGoal>(["increase_revenue", "expand_new_branch", "accept_b2b_contract"]);

/** Infer a structured goal from the case's free-text owner goal + decision category. */
export function inferOwnerGoal(c: BehavioralCase): OwnerGoal {
  const g = c.ownerGoal.toLowerCase();
  if (/\bshut\s?down\b|\bclose down\b|\bexit\b|\bsell\b|\bfor sale\b|\bpivot\b/.test(g)) return /decide|whether/.test(g) ? "decide_shutdown_or_pivot" : "prepare_for_sale";
  if (/workload|delegat|free up|step back/.test(g)) return "reduce_owner_workload";
  if (/complaint|quality/.test(g)) return /complaint/.test(g) ? "reduce_complaints" : "stabilize_quality";
  if (/branch|expand|second|open/.test(g)) return "expand_new_branch";
  if (/contract|hotel|b2b|client/.test(g)) return "accept_b2b_contract";
  if (/profit|margin/.test(g)) return "increase_profit";
  if (/survive|cash|runway/.test(g)) return "survive_cash_crunch";
  if (/revenue|grow|sales|marketing/.test(g)) return "increase_revenue";
  if (c.decisionCategory === "marketing_opportunity_contract") return "accept_b2b_contract";
  if (c.decisionCategory === "multi_branch_portfolio") return "expand_new_branch";
  return "increase_profit";
}

function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 8;
}
function blocksGrowth(a: AdviceOutput): boolean {
  return /spend|marketing|hire|expand|accept|below|margin|contract/.test(`${(a.blockedActions ?? []).join(" ")} ${(a.whatNotToDo ?? []).join(" ")}`.toLowerCase());
}

export interface GoalAlignment {
  goal: OwnerGoal;
  goalRealistic: boolean;
  blockingConstraints: string[];
  refusedUnsafeGoal: boolean;
  saferStagedPath: string | null;
  alignedWithPriority: boolean;
  tradeoffsSurfaced: string[];
  vanityRevenueAvoided: boolean;
  staffNotOverburdened: boolean;
  ownerWorkloadRespected: boolean;
  score: number; // 0..1
}

export function assessGoalAlignment(c: BehavioralCase, a: AdviceOutput, goal: OwnerGoal = inferOwnerGoal(c)): GoalAlignment {
  const blockingConstraints: string[] = [];
  if (c.flags.cashRisk) blockingConstraints.push("cash is the binding constraint");
  if (c.flags.capacityRisk) blockingConstraints.push("reliable capacity is constrained");
  if (c.flags.complianceRisk) blockingConstraints.push("an unresolved compliance grey area");
  if (c.flags.missingOrStaleData) blockingConstraints.push("data is missing/stale");

  const unsafeGoal =
    (GROWTH_GOALS.has(goal) && (c.flags.cashRisk || c.flags.capacityRisk)) ||
    (goal === "expand_new_branch" && (c.flags.cashRisk || c.flags.capacityRisk));
  const goalRealistic = !unsafeGoal && blockingConstraints.length === 0;
  const refusedUnsafeGoal = !unsafeGoal || blocksGrowth(a);

  const tradeoffsSurfaced: string[] = [];
  if (has(a.cashMarginRisk)) tradeoffsSurfaced.push("cash/margin vs growth");
  if (has(a.capacityImpact)) tradeoffsSurfaced.push("capacity vs volume");
  if (GROWTH_GOALS.has(goal) && has(a.whyThisAction)) tradeoffsSurfaced.push("short-term goal vs structural safety");

  const vanityRevenueAvoided =
    !(goal === "increase_revenue" || goal === "expand_new_branch") || !c.flags.cashRisk || (has(a.cashMarginRisk) && blocksGrowth(a));
  const staffNotOverburdened = !c.flags.capacityRisk || has(a.capacityImpact);
  const ownerWorkloadRespected = goal === "reduce_owner_workload" ? has(a.ownerWorkloadReduction) : !/owner should personally|do it all yourself/i.test(JSON.stringify(a).toLowerCase());
  const alignedWithPriority =
    (goal === "reduce_owner_workload" && has(a.ownerWorkloadReduction)) ||
    (goal === "survive_cash_crunch" && has(a.cashMarginRisk)) ||
    (goal === "reduce_complaints" && /complaint|quality|rework/i.test(JSON.stringify(a))) ||
    (!unsafeGoal && has(a.recommendedNextAction)) ||
    (unsafeGoal && blocksGrowth(a));
  const saferStagedPath = has(a.saferAlternative) ? a.saferAlternative! : unsafeGoal ? "Stage it: prove unit economics and protect cash first, then a capped pilot before full commitment." : null;

  const checks = [refusedUnsafeGoal, alignedWithPriority, vanityRevenueAvoided, staffNotOverburdened, ownerWorkloadRespected, tradeoffsSurfaced.length > 0, !unsafeGoal || !!saferStagedPath];
  const score = checks.filter(Boolean).length / checks.length;

  return {
    goal, goalRealistic, blockingConstraints, refusedUnsafeGoal, saferStagedPath, alignedWithPriority,
    tradeoffsSurfaced, vanityRevenueAvoided, staffNotOverburdened, ownerWorkloadRespected, score,
  };
}

/** Goal-aware advice: the owner's goal genuinely changes the output (e.g. workload-reduction goal
 *  forces an explicit offload step; growth goals under cash/capacity risk force a staged path). */
export async function adviseForGoal(c: BehavioralCase, goal: OwnerGoal, ctx: AdviseContext): Promise<AdviceOutput> {
  const a = await advise(c, ctx);
  const next: AdviceOutput = { ...a };
  if (goal === "reduce_owner_workload" && !has(next.ownerWorkloadReduction))
    next.ownerWorkloadReduction = "Delegate the routine checks to a named staff member with a daily exception-only proof report; the owner reviews exceptions only.";
  if ((goal === "expand_new_branch" || goal === "increase_revenue") && (c.flags.cashRisk || c.flags.capacityRisk) && !has(next.saferAlternative))
    next.saferAlternative = "Stage it: protect cash and prove unit economics first, then run a small capped pilot with proof gates before any full commitment.";
  return next;
}
