import { describe, it, expect } from "vitest";
import {
  deriveActionsToAvoid,
  selectNextBestSteps,
  isEmergency,
  allRankedIssues,
} from "@/domain/owner-guidance/next-best-step";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";

const issue = (over: Partial<BusinessIssue> = {}): BusinessIssue => ({
  id: "i",
  category: IssueCategory.PROCESS_IMPROVEMENT,
  businessFunction: [BusinessFunction.SOP_PROCESS],
  severity: "MEDIUM",
  headline: "x",
  requiresOwnerAction: false,
  ...over,
});

describe("next-best-step — module contract assertions", () => {
  it("deriveActionsToAvoid is a function", () => { expect(typeof deriveActionsToAvoid).toBe("function"); });
  it("selectNextBestSteps is a function", () => { expect(typeof selectNextBestSteps).toBe("function"); });
  it("isEmergency is a function", () => { expect(typeof isEmergency).toBe("function"); });
  it("allRankedIssues is a function", () => { expect(typeof allRankedIssues).toBe("function"); });
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("IssueCategory.CASH_DANGER is defined", () => { expect(IssueCategory.CASH_DANGER).toBeDefined(); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("issue is a function", () => { expect(typeof issue).toBe("function"); });
  it("issue() returns an object", () => { expect(typeof issue()).toBe("object"); });
  it("issue() has id field", () => { expect(issue()).toHaveProperty("id"); });
  it("issue() has category field", () => { expect(issue()).toHaveProperty("category"); });
  it("deriveActionsToAvoid([]) returns an array", () => { expect(Array.isArray(deriveActionsToAvoid([]))).toBe(true); });
  it("deriveActionsToAvoid([issue()]) is empty for no-risk issue", () => { expect(deriveActionsToAvoid([issue()])).toHaveLength(0); });
  it("selectNextBestSteps([]) returns an object", () => { expect(typeof selectNextBestSteps([])).toBe("object"); });
});

describe("[module41] actions to avoid", () => {
  it("cash danger forbids campaigns, discounts, and hiring", () => {
    const avoid = deriveActionsToAvoid([issue({ id: "c", category: IssueCategory.CASH_DANGER, severity: "CRITICAL" })]);
    const ids = avoid.map((a) => a.id);
    expect(ids).toContain("avoid_growth_on_cash_danger");
    expect(ids).toContain("avoid_discount_on_cash_danger");
    expect(ids).toContain("avoid_hire_on_cash_danger");
    expect(avoid.every((a) => a.reason.length > 0)).toBe(true);
  });

  it("customer/service failure forbids scaling marketing", () => {
    const avoid = deriveActionsToAvoid([
      issue({ id: "s", category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "HIGH" }),
    ]);
    expect(avoid.map((a) => a.id)).toContain("avoid_marketing_on_service_failure");
  });

  it("overload forbids new non-critical tasks", () => {
    const avoid = deriveActionsToAvoid([issue({ id: "o", category: IssueCategory.OVERLOAD, severity: "HIGH" })]);
    expect(avoid.map((a) => a.id)).toContain("avoid_new_tasks_on_overload");
  });

  it("no risk → no actions to avoid", () => {
    expect(deriveActionsToAvoid([issue()])).toHaveLength(0);
  });

  it("supplier+growth combo forbids supply-dependent growth", () => {
    const avoid = deriveActionsToAvoid([
      issue({ id: "cap", category: IssueCategory.CAPACITY_BOTTLENECK, severity: "HIGH" }),
      issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY, severity: "MEDIUM" }),
    ]);
    expect(avoid.map((a) => a.id)).toContain("avoid_growth_on_supplier_risk");
  });
});

describe("[module41] next best steps selection", () => {
  it("caps at top 3 under normal load", () => {
    const many = Array.from({ length: 8 }, (_, k) =>
      issue({ id: `i${k}`, category: IssueCategory.PROFIT_LEAK, severity: "MEDIUM" })
    );
    const r = selectNextBestSteps(many);
    expect(r.topIssues).toHaveLength(3);
    expect(r.emergency).toBe(false);
  });

  it("emergency (critical cash) lifts the cap", () => {
    const issues = [
      issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "CRITICAL", requiresOwnerAction: true }),
      ...Array.from({ length: 5 }, (_, k) => issue({ id: `p${k}`, category: IssueCategory.PROFIT_LEAK })),
    ];
    const r = selectNextBestSteps(issues);
    expect(r.emergency).toBe(true);
    expect(r.topIssues.length).toBeGreaterThan(3);
    // cash danger ranks first
    expect(r.topIssues[0].category).toBe(IssueCategory.CASH_DANGER);
  });

  it("isEmergency only for critical cash/service/compliance", () => {
    expect(isEmergency([issue({ category: IssueCategory.PROFIT_LEAK, severity: "CRITICAL" })])).toBe(false);
    expect(isEmergency([issue({ category: IssueCategory.CASH_DANGER, severity: "HIGH" })])).toBe(false);
    expect(isEmergency([issue({ category: IssueCategory.COMPLIANCE_SAFETY_RISK, severity: "CRITICAL" })])).toBe(true);
  });

  it("allRankedIssues returns the full set ranked, cash first", () => {
    const ranked = allRankedIssues([
      issue({ id: "grow", category: IssueCategory.GROWTH_OPPORTUNITY }),
      issue({ id: "cash", category: IssueCategory.CASH_DANGER, severity: "HIGH" }),
    ]);
    expect(ranked[0].id).toBe("cash");
    expect(ranked).toHaveLength(2);
  });
});
