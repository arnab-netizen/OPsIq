/**
 * Module 41 — Next Best Step + Actions To Avoid engine (pure).
 *
 * Turns a ranked set of business issues into (a) the top owner actions to take now
 * (capped at 3 unless an emergency) and (b) the actions the owner must NOT take
 * right now because active risk makes them unsafe. This is what lets OpsIQ say
 * "do X now, and do NOT start a marketing campaign this week because staff capacity
 * is stressed and rework is rising".
 *
 * Pure + deterministic. Orchestrates issue-priority; derives nothing about the
 * world itself beyond the issues handed in.
 */

import {
  type BusinessIssue,
  IssueCategory,
  topIssues,
  rankIssues,
} from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";

export interface ActionToAvoid {
  id: string;
  /** The move the owner must NOT make right now. */
  avoid: string;
  /** Concrete reason, naming the active risk. */
  reason: string;
  businessFunction: BusinessFunction[];
  /** Which active issue categories triggered this avoidance. */
  triggeredBy: IssueCategory[];
}

interface AvoidRule {
  id: string;
  /** Triggers when ALL of these categories are present in the active issue set. */
  requires: IssueCategory[];
  avoid: string;
  reason: string;
  businessFunction: BusinessFunction[];
}

/**
 * Risk → forbidden-move rules. Encodes the spec hard rules: do not grow/market/
 * discount/hire while cash is unsafe, staff/owner are overloaded, service is
 * failing, capacity is maxed, or supply is at risk.
 */
const AVOID_RULES: readonly AvoidRule[] = [
  {
    id: "avoid_growth_on_cash_danger",
    requires: [IssueCategory.CASH_DANGER],
    avoid: "Do not start a new marketing/ad campaign or expand this week",
    reason: "cash is at risk; new spend before collection worsens survival",
    businessFunction: [BusinessFunction.CASH_FLOW, BusinessFunction.GROWTH_READINESS],
  },
  {
    id: "avoid_discount_on_cash_danger",
    requires: [IssueCategory.CASH_DANGER],
    avoid: "Do not offer discounts or take on low-margin work to chase volume",
    reason: "cash is at risk; discounting erodes the margin you need to survive",
    businessFunction: [BusinessFunction.CASH_FLOW, BusinessFunction.PRICING],
  },
  {
    id: "avoid_hire_on_cash_danger",
    requires: [IssueCategory.CASH_DANGER],
    avoid: "Do not hire until payroll affordability is proven",
    reason: "cash is at risk; new fixed payroll is unaffordable now",
    businessFunction: [BusinessFunction.CASH_FLOW, BusinessFunction.PAYROLL],
  },
  {
    id: "avoid_marketing_on_service_failure",
    requires: [IssueCategory.CUSTOMER_SERVICE_FAILURE],
    avoid: "Do not scale marketing or acquisition before fixing service quality",
    reason: "complaints/rework are rising; more demand will multiply failures",
    businessFunction: [BusinessFunction.MARKETING, BusinessFunction.QUALITY],
  },
  {
    id: "avoid_new_tasks_on_overload",
    requires: [IssueCategory.OVERLOAD],
    avoid: "Do not assign new non-critical tasks to staff or the owner",
    reason: "staff/owner are already overloaded; more load raises failure risk",
    businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD, BusinessFunction.OWNER_WORKLOAD],
  },
  {
    id: "avoid_volume_on_capacity",
    requires: [IssueCategory.CAPACITY_BOTTLENECK],
    avoid: "Do not accept more volume than current capacity can deliver",
    reason: "a capacity bottleneck is active; overcommitting breaks delivery",
    businessFunction: [BusinessFunction.CAPACITY],
  },
  {
    id: "avoid_growth_on_supplier_risk",
    requires: [IssueCategory.CAPACITY_BOTTLENECK, IssueCategory.GROWTH_OPPORTUNITY],
    avoid: "Do not commit to growth that depends on at-risk supply",
    reason: "supply/inventory is at risk; growth could stock you out",
    businessFunction: [BusinessFunction.SUPPLIER, BusinessFunction.INVENTORY],
  },
];

function presentCategories(issues: readonly BusinessIssue[]): Set<IssueCategory> {
  return new Set(issues.map((i) => i.category));
}

/**
 * Derive the actions the owner must NOT take given the active issues. Deterministic
 * order (rule declaration order). Deduped by rule id.
 */
export function deriveActionsToAvoid(issues: readonly BusinessIssue[]): ActionToAvoid[] {
  const present = presentCategories(issues);
  const out: ActionToAvoid[] = [];
  for (const rule of AVOID_RULES) {
    if (rule.requires.every((c) => present.has(c))) {
      out.push({
        id: rule.id,
        avoid: rule.avoid,
        reason: rule.reason,
        businessFunction: rule.businessFunction,
        triggeredBy: rule.requires,
      });
    }
  }
  return out;
}

/** True when the issue set warrants emergency handling (uncapped top actions). */
export function isEmergency(issues: readonly BusinessIssue[]): boolean {
  return issues.some(
    (i) =>
      i.severity === "CRITICAL" &&
      (i.category === IssueCategory.CASH_DANGER ||
        i.category === IssueCategory.CUSTOMER_SERVICE_FAILURE ||
        i.category === IssueCategory.COMPLIANCE_SAFETY_RISK)
  );
}

export interface NextBestSteps {
  topIssues: BusinessIssue[];
  actionsToAvoid: ActionToAvoid[];
  emergency: boolean;
}

/**
 * Select the top owner actions now (≤3 unless emergency) and the actions to avoid.
 * The owner is never shown 20 equal-priority actions.
 */
export function selectNextBestSteps(issues: readonly BusinessIssue[], limit = 3): NextBestSteps {
  const emergency = isEmergency(issues);
  const ranked = topIssues([...issues], limit, emergency);
  return {
    topIssues: ranked,
    actionsToAvoid: deriveActionsToAvoid(issues),
    emergency,
  };
}

/** All issues ranked (full list), for the command center's broader sections. */
export function allRankedIssues(issues: readonly BusinessIssue[]): BusinessIssue[] {
  return rankIssues([...issues]);
}
