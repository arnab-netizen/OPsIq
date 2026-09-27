/**
 * Budget action mapping (Deep Action-System Linkage). Pure, deterministic.
 *
 * Maps an advisory plan `generatedAction` into the fields persisted as an owner
 * execution task, and derives a STABLE idempotency key so repeated reassessment
 * never creates duplicate open tasks for the same budget risk.
 */

import type { BudgetGeneratedAction, PlanDecisionType } from "@/domain/owner-budget/types";
import type { OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";

/**
 * Stable key per (decisionType, title). Reassessing the same condition yields the
 * same generated actions → the same key → an upsert/link, not a duplicate.
 */
export function budgetActionSourceKey(a: Pick<BudgetGeneratedAction, "decisionType" | "title">): string {
  return `${a.decisionType}|${a.title.trim().toLowerCase()}`;
}

export interface MappedBudgetActionRow {
  sourceKey: string;
  title: string;
  decisionType: string;
  accountableRole: string;
  requiredProof: string;
  expectedFinancialImpact: string;
  verificationMethod: string;
  escalationPath: string;
  killRule: string;
  reviewInDays: number;
}

/**
 * Map a plan action to a persisted-row field set. `verificationMethod` and
 * `escalationPath` are derived (the advisory action has no explicit field) — the
 * derivation is deterministic and documented, never invented per-call.
 */
export function mapPlanActionToRow(a: BudgetGeneratedAction): MappedBudgetActionRow {
  return {
    sourceKey: budgetActionSourceKey(a),
    title: a.title,
    decisionType: a.decisionType,
    accountableRole: a.accountableRole,
    requiredProof: a.requiredProof,
    expectedFinancialImpact: a.expectedFinancialImpact,
    verificationMethod: `Owner verifies against required proof: ${a.requiredProof}`,
    escalationPath: `Escalate to owner if not actioned by the ${a.reviewInDays}-day review date.`,
    killRule: a.killRule,
    reviewInDays: a.reviewInDays,
  };
}

/** Open (actionable) statuses — a task in these may be linked/refreshed, not duplicated. */
export const OPEN_BUDGET_ACTION_STATUSES: ReadonlySet<string> = new Set([
  "proposed", "assigned", "in_progress", "blocked",
]);

/**
 * Budget actions whose PURPOSE is margin repair although their decision type records the mechanical
 * direction of a number ("INCREASE" the price): repricing an underpriced contract (and fixing its payment
 * terms) repairs a measured loss — it is not growth spend. The generators take these titles from here, so
 * the purpose travels with the action (src/__tests__/governance/owner-action-gate-callers.test.ts checks
 * every INCREASE / REALLOCATE / APPROVE generator is classified).
 */
export const BUDGET_MARGIN_REPAIR_TITLES = Object.freeze({
  REPRICE_B2B_LAUNDRY: "Reprice / renegotiate low-margin B2B laundry contracts",
  REPRICE_B2B_LAUNDRY_AND_TERMS: "Reprice low-margin B2B laundry contract AND fix payment terms",
  REPRICE_RECURRING_HOUSEKEEPING: "Reprice underpriced recurring housekeeping contracts",
  REPRICE_RECURRING_AND_TERMS: "Reprice underpriced recurring contract AND fix payment terms",
} as const);
const MARGIN_REPAIR_TITLE_SET: ReadonlySet<string> = new Set(Object.values(BUDGET_MARGIN_REPAIR_TITLES).map((t) => t.toLowerCase()));

/**
 * What a budget action does, as the owner action gate's intent (owner-imperatives.ts) — by its business
 * PURPOSE first, then by the plan decision type (types.ts PlanDecisionType):
 *   - margin repair (repricing an underpriced contract, BUDGET_MARGIN_REPAIR_TITLES): REPAIR — the response
 *     to a measured loss, never held back by the cash danger it helps relieve;
 *   - BLOCK / PAUSE / DEFER / REDUCE withhold or cut spend ("Protect cash: freeze discretionary spend…"):
 *     STABILISE;
 *   - INVESTIGATE / COLLECT_EVIDENCE / ESCALATE find out or refer for review and commit no spend: EVIDENCE;
 *   - APPROVE / INCREASE / REALLOCATE otherwise release or move money into spend (e.g. "Address
 *     underinvestment in …"): GROW — held back while cash, capacity or margin is unsafe.
 * A decision type outside that vocabulary (a legacy row) returns null: the gate's documented fallback
 * (the finance domain's spend sensitivity) applies.
 */
const BUDGET_INTENT_BY_DECISION: Readonly<Record<PlanDecisionType, OwnerTargetIntent>> = Object.freeze({
  BLOCK: "STABILISE",
  PAUSE: "STABILISE",
  DEFER: "STABILISE",
  REDUCE: "STABILISE",
  INVESTIGATE: "EVIDENCE",
  COLLECT_EVIDENCE: "EVIDENCE",
  ESCALATE: "EVIDENCE",
  APPROVE: "GROW",
  INCREASE: "GROW",
  REALLOCATE: "GROW",
});

export function budgetActionIntent(action: { decisionType: string | null | undefined; title?: string | null }): OwnerTargetIntent | null {
  if (action.title && MARGIN_REPAIR_TITLE_SET.has(action.title.trim().toLowerCase())) return "REPAIR";
  const d = action.decisionType;
  return d && Object.prototype.hasOwnProperty.call(BUDGET_INTENT_BY_DECISION, d) ? BUDGET_INTENT_BY_DECISION[d as PlanDecisionType] : null;
}
