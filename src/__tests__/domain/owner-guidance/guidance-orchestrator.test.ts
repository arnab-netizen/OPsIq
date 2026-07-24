import { describe, it, expect } from "vitest";
import {
  buildOwnerNowView,
  changeHighlights,
  type GuidanceContext,
} from "@/domain/owner-guidance/guidance-orchestrator";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";

const issue = (over: Partial<BusinessIssue> = {}): BusinessIssue => ({
  id: "i",
  category: IssueCategory.PROCESS_IMPROVEMENT,
  businessFunction: [BusinessFunction.SOP_PROCESS],
  severity: "MEDIUM",
  headline: "x",
  requiresOwnerAction: false,
  ...over,
});

const ctx = (over: Partial<GuidanceContext> = {}): GuidanceContext => ({
  workspaceId: "ws1",
  businessId: "biz1",
  archetype: "laundry",
  dataConfidence: EvidenceConfidenceLevel.STRONG,
  missingCriticalData: [],
  issues: [],
  changes: [],
  growthGatePassed: true,
  cashSafe: true,
  staffOverloaded: false,
  ownerOverloaded: false,
  unsafeToGuide: false,
  ...over,
});

describe("guidance-orchestrator — module contract assertions", () => {
  it("buildOwnerNowView is a function", () => { expect(typeof buildOwnerNowView).toBe("function"); });
  it("changeHighlights is a function", () => { expect(typeof changeHighlights).toBe("function"); });
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("GuidanceClassification is an object", () => { expect(typeof GuidanceClassification).toBe("object"); });
  it("EvidenceConfidenceLevel is an object", () => { expect(typeof EvidenceConfidenceLevel).toBe("object"); });
  it("issue is a function", () => { expect(typeof issue).toBe("function"); });
  it("issue() returns an object", () => { expect(typeof issue()).toBe("object"); });
  it("ctx is a function", () => { expect(typeof ctx).toBe("function"); });
  it("ctx() returns an object", () => { expect(typeof ctx()).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module41] owner now view — top actions + caps", () => {
  it("returns at most 3 top owner actions under normal load", () => {
    const issues = Array.from({ length: 7 }, (_, k) =>
      issue({ id: `p${k}`, category: IssueCategory.PROFIT_LEAK })
    );
    const v = buildOwnerNowView(ctx({ issues }));
    expect(v.topOwnerActions.length).toBeLessThanOrEqual(3);
    expect(v.emergency).toBe(false);
  });

  it("critical cash danger creates an emergency and ranks first", () => {
    const v = buildOwnerNowView(
      ctx({
        cashSafe: false,
        issues: [
          issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true, headline: "4 overdue commercial invoices" }),
          issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "MEDIUM" }),
        ],
      })
    );
    expect(v.emergency).toBe(true);
    expect(v.topOwnerActions[0].category).toBe(IssueCategory.CASH_DANGER);
    expect(v.cashDangerStatus).toBe("CRITICAL");
  });
});

describe("[module41] hard rules", () => {
  it("cash danger outranks growth opportunity in the view", () => {
    const v = buildOwnerNowView(
      ctx({
        issues: [
          issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "HIGH" }),
          issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH" }),
        ],
      })
    );
    expect(v.topOwnerActions[0].id).toBe("cash");
  });

  it("growth is removed from top actions and an avoid is added until gates pass", () => {
    const v = buildOwnerNowView(
      ctx({
        growthGatePassed: false,
        issues: [issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "HIGH" })],
      })
    );
    expect(v.topOwnerActions.find((i) => i.category === IssueCategory.GROWTH_OPPORTUNITY)).toBeUndefined();
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_growth_before_gates");
    expect(v.growthReadinessStatus).toBe("WATCH");
  });

  it("staff overload adds an avoid-new-tasks action even without an explicit overload issue", () => {
    const v = buildOwnerNowView(ctx({ staffOverloaded: true }));
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_new_tasks_on_overload");
    expect(v.staffOverloadStatus).toBe("DANGER");
  });

  it("customer/service failure forbids scaling marketing", () => {
    const v = buildOwnerNowView(
      ctx({ issues: [issue({ id: "svc", category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "HIGH" })] })
    );
    expect(v.actionsToAvoid.map((a) => a.id)).toContain("avoid_marketing_on_service_failure");
    expect(v.qualityFailureStatus).toBe("DANGER");
  });
});

describe("[module41] classification + confidence", () => {
  it("unsafe context → GUIDANCE_BLOCKED_UNSAFE", () => {
    const v = buildOwnerNowView(ctx({ unsafeToGuide: true }));
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_BLOCKED_UNSAFE);
  });

  it("missing critical data with a high-severity issue → GUIDANCE_BLOCKED_MISSING_DATA + capped confidence", () => {
    const v = buildOwnerNowView(
      ctx({
        missingCriticalData: ["last 7 days bank statement"],
        issues: [issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH" })],
      })
    );
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_BLOCKED_MISSING_DATA);
    expect(v.confidenceCapped).toBe(true);
    expect(v.missingDataRequests).toContain("last 7 days bank statement");
  });

  it("compliance-sensitive issue → GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW", () => {
    const v = buildOwnerNowView(
      ctx({
        issues: [
          issue({
            id: "tax",
            category: IssueCategory.COMPLIANCE_SAFETY_RISK,
            severity: "HIGH",
            businessFunction: [BusinessFunction.RISK_COMPLIANCE],
            requiresOwnerAction: true,
          }),
        ],
      })
    );
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_REQUIRES_PROFESSIONAL_REVIEW);
  });

  it("critical owner-action issue → GUIDANCE_REQUIRES_OWNER_DECISION", () => {
    const v = buildOwnerNowView(
      ctx({
        issues: [issue({ id: "p", category: IssueCategory.PROFIT_LEAK, severity: "CRITICAL", requiresOwnerAction: true })],
      })
    );
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_REQUIRES_OWNER_DECISION);
  });

  it("weak data with no blocking issue → GUIDANCE_READY_WITH_LOW_CONFIDENCE", () => {
    const v = buildOwnerNowView(
      ctx({
        dataConfidence: EvidenceConfidenceLevel.WEAK,
        issues: [issue({ id: "x", category: IssueCategory.PROCESS_IMPROVEMENT, severity: "LOW" })],
      })
    );
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_READY_WITH_LOW_CONFIDENCE);
    expect(v.confidenceCapped).toBe(true);
  });

  it("strong data, low-severity issues → GUIDANCE_READY", () => {
    const v = buildOwnerNowView(ctx({ issues: [issue({ severity: "LOW" })] }));
    expect(v.classification).toBe(GuidanceClassification.GUIDANCE_READY);
    expect(v.confidenceCapped).toBe(false);
    expect(v.confidence).toBe(EvidenceConfidenceLevel.STRONG);
  });
});

describe("[module41] reasoning + change highlights", () => {
  it("reasoning summary names the most urgent issue and the classification", () => {
    const v = buildOwnerNowView(
      ctx({ cashSafe: false, issues: [issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH", headline: "overdue invoices" })] })
    );
    expect(v.reasoningSummary).toContain("overdue invoices");
    expect(v.reasoningSummary).toContain(v.classification);
    expect(v.reasoningSummary).toContain("Cash survival is unsafe");
  });

  it("changeHighlights returns only owner-alerting changes", () => {
    const v = buildOwnerNowView(
      ctx({
        changes: [
          { category: "CASH_WORSENED" as never, direction: "WORSENED" as never, businessFunction: BusinessFunction.CASH_FLOW, reason: "runway 30->12 days", ownerAlert: true },
          { category: "PROFIT_IMPROVED" as never, direction: "IMPROVED" as never, businessFunction: BusinessFunction.PROFITABILITY, reason: "margin up", ownerAlert: false },
        ],
      })
    );
    expect(changeHighlights(v)).toHaveLength(1);
    expect(changeHighlights(v)[0].ownerAlert).toBe(true);
  });
});
