/**
 * Module 41 — Real-Time 360° Owner Guidance Layer: PRIORITY RANKING ENGINE (pure).
 *
 * Implements section 5 of the Module 41 spec: the canonical, non-negotiable order in
 * which business issues compete for the owner's finite attention. Cash danger and
 * customer/service failure must always outrank growth and marketing; overload must
 * outrank profit optimization; proof/outcome must outrank growth. This file encodes
 * that ordering as a single source of truth so the guidance layer never surfaces a
 * "grow faster" nudge while the business is bleeding cash or breaking service.
 *
 * Pure + deterministic: no Date.now(), no Math.random(), no new Date(), no input
 * mutation. rankIssues / topIssues return NEW arrays.
 */

import { BusinessFunction } from "@/domain/owner-guidance/business-function";

/**
 * The 10 issue categories the guidance layer triages, declared in canonical
 * priority order (most urgent first) for readability. The authoritative numeric
 * ranking lives in ISSUE_PRIORITY_RANK.
 */
export enum IssueCategory {
  CASH_DANGER = "CASH_DANGER",
  CUSTOMER_SERVICE_FAILURE = "CUSTOMER_SERVICE_FAILURE",
  OVERLOAD = "OVERLOAD",
  PROFIT_LEAK = "PROFIT_LEAK",
  CAPACITY_BOTTLENECK = "CAPACITY_BOTTLENECK",
  COMPLIANCE_SAFETY_RISK = "COMPLIANCE_SAFETY_RISK",
  BLOCKED_EXECUTION = "BLOCKED_EXECUTION",
  PENDING_PROOF_OUTCOME = "PENDING_PROOF_OUTCOME",
  GROWTH_OPPORTUNITY = "GROWTH_OPPORTUNITY",
  PROCESS_IMPROVEMENT = "PROCESS_IMPROVEMENT",
}

/**
 * Canonical priority rank, 1..10 (lower = more urgent). HARD RULE from spec §5.
 * Do not reorder without a spec change.
 */
export const ISSUE_PRIORITY_RANK: Record<IssueCategory, number> = {
  [IssueCategory.CASH_DANGER]: 1,
  [IssueCategory.CUSTOMER_SERVICE_FAILURE]: 2,
  [IssueCategory.OVERLOAD]: 3,
  [IssueCategory.PROFIT_LEAK]: 4,
  [IssueCategory.CAPACITY_BOTTLENECK]: 5,
  [IssueCategory.COMPLIANCE_SAFETY_RISK]: 6,
  [IssueCategory.BLOCKED_EXECUTION]: 7,
  [IssueCategory.PENDING_PROOF_OUTCOME]: 8,
  [IssueCategory.GROWTH_OPPORTUNITY]: 9,
  [IssueCategory.PROCESS_IMPROVEMENT]: 10,
};

export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Severity rank (higher = more severe) used as a tie-break within a category. */
const SEVERITY_RANK: Record<IssueSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface BusinessIssue {
  id: string;
  category: IssueCategory;
  /** The 360° business functions this issue touches (≥1 expected). */
  businessFunction: BusinessFunction[];
  severity: IssueSeverity;
  headline: string;
  requiresOwnerAction: boolean;
}

/** True when category `a` is strictly more urgent (lower rank) than category `b`. */
export function outranks(a: IssueCategory, b: IssueCategory): boolean {
  return ISSUE_PRIORITY_RANK[a] < ISSUE_PRIORITY_RANK[b];
}

/**
 * Hard-rule helper: cash danger must always beat a growth opportunity.
 * Encoded via the generic `outranks` so there is a single source of truth.
 */
export function cashDangerOutranksGrowth(): boolean {
  return outranks(IssueCategory.CASH_DANGER, IssueCategory.GROWTH_OPPORTUNITY);
}

/**
 * Marketing work surfaces in the guidance layer as a GROWTH_OPPORTUNITY (acquire)
 * or PROCESS_IMPROVEMENT (refine) issue. Hard rule: a customer/service failure must
 * always beat any marketing-driven issue.
 */
export const MARKETING_ISSUE_CATEGORIES: readonly IssueCategory[] = [
  IssueCategory.GROWTH_OPPORTUNITY,
  IssueCategory.PROCESS_IMPROVEMENT,
];

export function customerFailureOutranksMarketing(): boolean {
  return MARKETING_ISSUE_CATEGORIES.every((m) =>
    outranks(IssueCategory.CUSTOMER_SERVICE_FAILURE, m)
  );
}

/**
 * Deterministic comparator for two issues:
 *   1. category rank ascending (most urgent category first)
 *   2. severity descending (CRITICAL > HIGH > MEDIUM > LOW)
 *   3. requiresOwnerAction first
 *   4. id ascending (stable, total order)
 */
function compareIssues(a: BusinessIssue, b: BusinessIssue): number {
  const cat = ISSUE_PRIORITY_RANK[a.category] - ISSUE_PRIORITY_RANK[b.category];
  if (cat !== 0) return cat;
  const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sev !== 0) return sev;
  if (a.requiresOwnerAction !== b.requiresOwnerAction) {
    return a.requiresOwnerAction ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Rank issues by the canonical priority order. Pure: returns a NEW array and never
 * mutates the input. The id tie-break makes the order a total order, so the result
 * is stable regardless of input order.
 */
export function rankIssues(issues: BusinessIssue[]): BusinessIssue[] {
  return [...issues].sort(compareIssues);
}

/** Emergency-tier categories whose CRITICAL severity lifts the normal display cap. */
const EMERGENCY_CATEGORIES: ReadonlySet<IssueCategory> = new Set([
  IssueCategory.CASH_DANGER,
  IssueCategory.CUSTOMER_SERVICE_FAILURE,
  IssueCategory.COMPLIANCE_SAFETY_RISK,
]);

/** True when an issue is a CRITICAL cash / service / compliance-safety emergency. */
function isEmergencyIssue(i: BusinessIssue): boolean {
  return i.severity === "CRITICAL" && EMERGENCY_CATEGORIES.has(i.category);
}

/** Default number of issues surfaced to the owner under normal load. */
export const DEFAULT_TOP_LIMIT = 3;

/**
 * The top issues the owner should see now.
 *
 * Rule: under normal load we cap the list at `limit` (default 3) to protect the
 * owner's attention. The cap is lifted — returning ALL ranked issues — when either
 * `emergency` is explicitly true, OR any CRITICAL CASH_DANGER /
 * CUSTOMER_SERVICE_FAILURE / COMPLIANCE_SAFETY_RISK issue is present, because in a
 * genuine emergency suppressing issues is more dangerous than overloading the owner.
 */
export function topIssues(
  issues: BusinessIssue[],
  limit: number = DEFAULT_TOP_LIMIT,
  emergency = false
): BusinessIssue[] {
  const ranked = rankIssues(issues);
  const inEmergency = emergency || ranked.some(isEmergencyIssue);
  if (inEmergency) return ranked;
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_TOP_LIMIT;
  return ranked.slice(0, cap);
}
