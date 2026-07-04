/**
 * Owner Workload Budget (Elite Phase G) — proves OpsIQ reduces owner load:
 * groups related alerts, suppresses low-value noise, separates owner-only from
 * delegable work, highlights the owner bottleneck, and keeps urgent items visible.
 */
import { describe, it, expect } from "vitest";
import { computeOwnerWorkloadBudget } from "@/domain/owner-guidance/owner-workload-budget";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";

let n = 0;
const issue = (over: Partial<BusinessIssue>): BusinessIssue => ({
  id: over.id ?? `i${n++}`,
  category: over.category ?? IssueCategory.PROFIT_LEAK,
  businessFunction: over.businessFunction ?? [BusinessFunction.PROFITABILITY],
  severity: over.severity ?? "MEDIUM",
  headline: over.headline ?? "issue",
  requiresOwnerAction: over.requiresOwnerAction ?? false,
});
const NO_SIGNALS = { pendingProofReviews: 0, pendingReassessments: 0, opportunityApprovalsPending: 0 };

describe("owner workload budget", () => {
  it("suppresses LOW-severity, non-owner noise from the owner's day", () => {
    const b = computeOwnerWorkloadBudget(
      [issue({ severity: "LOW", requiresOwnerAction: false }), issue({ severity: "LOW", requiresOwnerAction: false })],
      NO_SIGNALS
    );
    expect(b.lowValueAlertsSuppressed).toBe(2);
    expect(b.ownerDecisionsRequired).toBe(0);
    expect(b.ownerTodayList).toHaveLength(0);
    expect(b.estimatedMinutesSaved).toBeGreaterThan(0);
  });

  it("separates owner-only decisions from staff/manager-delegable work", () => {
    const b = computeOwnerWorkloadBudget(
      [
        issue({ category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true }),
        issue({ category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "MEDIUM", requiresOwnerAction: false }),
        issue({ category: IssueCategory.PENDING_PROOF_OUTCOME, severity: "MEDIUM", requiresOwnerAction: false }),
      ],
      NO_SIGNALS
    );
    expect(b.delegableItems).toBe(2);
    expect(b.ownerDecisionsRequired).toBe(1);
    expect(b.highValueAlerts).toBe(1);
  });

  it("groups related owner alerts of the same category into one line", () => {
    const b = computeOwnerWorkloadBudget(
      [
        issue({ category: IssueCategory.CASH_DANGER, severity: "HIGH", requiresOwnerAction: true, headline: "cash A" }),
        issue({ category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true, headline: "cash B" }),
        issue({ category: IssueCategory.CASH_DANGER, severity: "MEDIUM", requiresOwnerAction: true, headline: "cash C" }),
      ],
      NO_SIGNALS
    );
    expect(b.ownerTodayList).toHaveLength(1);
    expect(b.groupedAlertCollapses).toBe(2);
    // The surviving line shows the most severe headline + the related count.
    expect(b.ownerTodayList[0].severity).toBe("CRITICAL");
    expect(b.ownerTodayList[0].headline).toMatch(/\+2 related/);
  });

  it("keeps an urgent owner issue visible even amid suppressed noise", () => {
    const b = computeOwnerWorkloadBudget(
      [
        issue({ category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true, headline: "cash crisis" }),
        ...Array.from({ length: 5 }, () => issue({ severity: "LOW", requiresOwnerAction: false })),
      ],
      NO_SIGNALS
    );
    expect(b.ownerTodayList.some((i) => i.headline.includes("cash crisis"))).toBe(true);
    expect(b.lowValueAlertsSuppressed).toBe(5);
  });

  it("flags the owner bottleneck when overload requires owner action", () => {
    const b = computeOwnerWorkloadBudget(
      [issue({ category: IssueCategory.OVERLOAD, severity: "HIGH", requiresOwnerAction: true })],
      NO_SIGNALS
    );
    expect(b.ownerBottleneckItems).toBe(1);
  });

  it("counts real owner-decision surfaces (reviews, reassessments) into the budget", () => {
    const b = computeOwnerWorkloadBudget([], { pendingProofReviews: 3, pendingReassessments: 2, opportunityApprovalsPending: 1 });
    expect(b.reviewsRequired).toBe(3);
    expect(b.approvalsRequired).toBe(1);
    expect(b.ownerDecisionsRequired).toBe(2); // reassessments
    expect(b.estimatedOwnerMinutes).toBe(2 * 6 + 1 * 4 + 3 * 5); // decisions + approvals + reviews
  });

  it("delegating work (fewer owner-only issues) lowers the owner budget", () => {
    const before = computeOwnerWorkloadBudget(
      [
        issue({ category: IssueCategory.CASH_DANGER, severity: "HIGH", requiresOwnerAction: true }),
        issue({ category: IssueCategory.CAPACITY_BOTTLENECK, severity: "HIGH", requiresOwnerAction: true }),
      ],
      NO_SIGNALS
    );
    const after = computeOwnerWorkloadBudget(
      [
        issue({ category: IssueCategory.CASH_DANGER, severity: "HIGH", requiresOwnerAction: true }),
        issue({ category: IssueCategory.CAPACITY_BOTTLENECK, severity: "HIGH", requiresOwnerAction: false }), // delegated
      ],
      NO_SIGNALS
    );
    expect(after.ownerDecisionsRequired).toBeLessThan(before.ownerDecisionsRequired);
    expect(after.delegableItems).toBeGreaterThan(before.delegableItems);
    expect(after.estimatedOwnerMinutes).toBeLessThan(before.estimatedOwnerMinutes);
  });
});
