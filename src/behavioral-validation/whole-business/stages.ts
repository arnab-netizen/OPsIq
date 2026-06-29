/**
 * Slice C (3/3) — business-stage and owner-mode awareness.
 *
 * The same facts require different advice by stage. inferBusinessStage reads the case; stageTopPriority
 * gives the stage's dominant focus; stageAdjustedPriority combines stage with the live arbitration
 * constraint so a survival-stage business protects cash even when other moves look attractive.
 */
import { activeConstraints } from "./arbitration";
import type { BehavioralCase } from "../schema";

export const BUSINESS_STAGES = [
  "survival_cash_crisis", "stabilization", "early_growth", "profitable_growth", "scaling",
  "multi_location", "turnaround", "mature_optimization", "exit_pre_sale", "shutdown_pivot",
] as const;
export type BusinessStage = (typeof BUSINESS_STAGES)[number];

export const STAGE_TOP_PRIORITY: Record<BusinessStage, string> = {
  survival_cash_crisis: "protect cash — stop discretionary spend, recover receivables, extend runway",
  stabilization: "fix process and quality so the business is reliable before any growth",
  early_growth: "prove the channel and unit economics before scaling spend",
  profitable_growth: "grow the proven, profitable lines via capped, proof-gated steps",
  scaling: "ensure repeatable SOPs and reliable capacity before scaling",
  multi_location: "manage per-branch P&L and owner attention; do not let one branch subsidise another",
  turnaround: "define a stop-loss and cut the losses before reinvesting",
  mature_optimization: "optimise efficiency, margin and retention",
  exit_pre_sale: "clean up numbers, processes and dependencies for a defensible valuation",
  shutdown_pivot: "decide stop vs pivot on evidence; avoid sunk-cost bias",
};

export function inferBusinessStage(c: BehavioralCase): BusinessStage {
  if (c.flags.cashRisk && c.flags.capacityRisk) return "turnaround";
  if (c.flags.cashRisk) return "survival_cash_crisis";
  if (c.flags.capacityRisk || /complaint|rework|quality/i.test(c.hiddenRootCause)) return "stabilization";
  if (c.flags.multiBranch || c.decisionCategory === "multi_branch_portfolio") return "multi_location";
  if (c.decisionCategory === "marketing_opportunity_contract") return "early_growth";
  return "profitable_growth";
}

/** Stage-aware top priority: a survival/turnaround stage forces cash protection regardless of the
 *  tempting move; otherwise the live dominant constraint (or the stage focus) leads. */
export function stageAdjustedPriority(c: BehavioralCase, stage: BusinessStage = inferBusinessStage(c)): string {
  const active = activeConstraints(c);
  if (stage === "survival_cash_crisis" || stage === "turnaround") return STAGE_TOP_PRIORITY[stage];
  if (active.length > 0) return `${STAGE_TOP_PRIORITY[stage]} — but first resolve ${active[0]}`;
  return STAGE_TOP_PRIORITY[stage];
}

/** Whether the stage demands an explicit stop/defer decision. */
export function stageRequiresStopLoss(stage: BusinessStage): boolean {
  return stage === "turnaround" || stage === "shutdown_pivot" || stage === "survival_cash_crisis";
}
