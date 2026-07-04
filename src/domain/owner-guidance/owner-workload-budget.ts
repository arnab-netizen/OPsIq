/**
 * Owner Workload Budget (Elite hardening — Phase G).
 *
 * OpsIQ must prove it REDUCES owner workload, not add another admin surface. This pure
 * function turns the already-assembled owner issue list + the real owner-decision-surface
 * counts into a budget that: groups related alerts, suppresses low-value noise, separates
 * owner-only decisions from staff/manager-delegable work, highlights the owner bottleneck,
 * and gives a transparent estimate of owner time required vs. saved.
 *
 * It consumes the SAME BusinessIssue[] the Owner Now View already produces (no parallel
 * truth) plus counts of concrete owner-decision surfaces (proof reviews, pending
 * reassessments, opportunity approvals). Estimates are transparent weighted counts labelled
 * as estimates — never presented as measured fact.
 */

import type { BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";

export interface OwnerWorkloadSignals {
  /** Proofs sitting in human review (owner/manager must review). */
  pendingProofReviews: number;
  /** Reassessment events awaiting an owner decision (stop/retry/modify). */
  pendingReassessments: number;
  /** Opportunity decisions flagged ownerApprovalRequired. */
  opportunityApprovalsPending: number;
}

/** Per-item owner-minute estimates (transparent, deterministic). */
const MIN_PER_DECISION = 6;
const MIN_PER_APPROVAL = 4;
const MIN_PER_REVIEW = 5;
/** Minutes the owner would have spent if grouping/suppression/delegation did NOT happen. */
const MIN_SAVED_PER_SUPPRESSED = 2;
const MIN_SAVED_PER_GROUPED_COLLAPSE = 3;
const MIN_SAVED_PER_DELEGATED = 5;

export interface OwnerTodayItem {
  category: IssueCategory;
  headline: string;
  severity: BusinessIssue["severity"];
  memberCount: number; // how many issues collapsed into this one owner-facing line
}

export interface OwnerWorkloadBudget {
  ownerDecisionsRequired: number;
  approvalsRequired: number;
  reviewsRequired: number;
  highValueAlerts: number;
  lowValueAlertsSuppressed: number;
  delegableItems: number;
  groupedAlertCollapses: number;
  ownerBottleneckItems: number;
  estimatedOwnerMinutes: number;
  estimatedMinutesSaved: number;
  /** The grouped, owner-only, severity-sorted list the owner should actually see today. */
  ownerTodayList: OwnerTodayItem[];
  /** Human-readable, honest note on how the estimate was derived. */
  estimateBasis: string;
}

const SEVERITY_RANK: Record<BusinessIssue["severity"], number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

export function computeOwnerWorkloadBudget(
  issues: BusinessIssue[],
  signals: OwnerWorkloadSignals
): OwnerWorkloadBudget {
  // 1. Low-value noise: LOW severity AND not owner-action → suppressed from the owner's day.
  const suppressed = issues.filter((i) => i.severity === "LOW" && !i.requiresOwnerAction);
  const suppressedIds = new Set(suppressed.map((i) => i.id));
  const visible = issues.filter((i) => !suppressedIds.has(i.id));

  // 2. Owner-only vs delegable (staff/manager can handle).
  const ownerOnly = visible.filter((i) => i.requiresOwnerAction);
  const delegable = visible.filter((i) => !i.requiresOwnerAction);

  // 3. Group the OWNER-ONLY items by category so related alerts collapse into one line.
  const byCategory = new Map<IssueCategory, BusinessIssue[]>();
  for (const i of ownerOnly) {
    const arr = byCategory.get(i.category) ?? [];
    arr.push(i);
    byCategory.set(i.category, arr);
  }
  const ownerTodayList: OwnerTodayItem[] = [];
  let groupedAlertCollapses = 0;
  for (const [category, members] of byCategory) {
    members.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const top = members[0];
    if (members.length > 1) groupedAlertCollapses += members.length - 1;
    ownerTodayList.push({
      category,
      headline: members.length > 1 ? `${top.headline} (+${members.length - 1} related)` : top.headline,
      severity: top.severity,
      memberCount: members.length,
    });
  }
  ownerTodayList.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  // 4. Owner bottleneck: owner-action overload issues (owner is the constraint).
  const ownerBottleneckItems = ownerOnly.filter((i) => i.category === IssueCategory.OVERLOAD).length;

  const ownerDecisionsRequired = ownerTodayList.length + Math.max(0, signals.pendingReassessments);
  const approvalsRequired = Math.max(0, signals.opportunityApprovalsPending);
  const reviewsRequired = Math.max(0, signals.pendingProofReviews);
  const highValueAlerts = ownerOnly.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length;

  const estimatedOwnerMinutes =
    ownerDecisionsRequired * MIN_PER_DECISION +
    approvalsRequired * MIN_PER_APPROVAL +
    reviewsRequired * MIN_PER_REVIEW;

  const estimatedMinutesSaved =
    suppressed.length * MIN_SAVED_PER_SUPPRESSED +
    groupedAlertCollapses * MIN_SAVED_PER_GROUPED_COLLAPSE +
    delegable.length * MIN_SAVED_PER_DELEGATED;

  return {
    ownerDecisionsRequired,
    approvalsRequired,
    reviewsRequired,
    highValueAlerts,
    lowValueAlertsSuppressed: suppressed.length,
    delegableItems: delegable.length,
    groupedAlertCollapses,
    ownerBottleneckItems,
    estimatedOwnerMinutes,
    estimatedMinutesSaved,
    ownerTodayList,
    estimateBasis:
      `Estimate: ${MIN_PER_DECISION}m/decision, ${MIN_PER_APPROVAL}m/approval, ${MIN_PER_REVIEW}m/review; ` +
      `saved = ${MIN_SAVED_PER_SUPPRESSED}m/suppressed + ${MIN_SAVED_PER_GROUPED_COLLAPSE}m/grouped + ${MIN_SAVED_PER_DELEGATED}m/delegated. ` +
      `Figures are planning estimates, not measured time.`,
  };
}
