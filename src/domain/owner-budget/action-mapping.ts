/**
 * Budget action mapping (Deep Action-System Linkage). Pure, deterministic.
 *
 * Maps an advisory plan `generatedAction` into the fields persisted as an owner
 * execution task, and derives a STABLE idempotency key so repeated reassessment
 * never creates duplicate open tasks for the same budget risk.
 */

import type { BudgetGeneratedAction } from "@/domain/owner-budget/types";

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
