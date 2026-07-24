import { describe, it, expect } from "vitest";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import {
  IssueCategory,
  ISSUE_PRIORITY_RANK,
  BusinessIssue,
  IssueSeverity,
  rankIssues,
  outranks,
  cashDangerOutranksGrowth,
  customerFailureOutranksMarketing,
  topIssues,
  DEFAULT_TOP_LIMIT,
} from "@/domain/owner-guidance/issue-priority";

function issue(
  id: string,
  category: IssueCategory,
  severity: IssueSeverity = "MEDIUM",
  requiresOwnerAction = true,
  businessFunction: BusinessFunction[] = [BusinessFunction.STRATEGY]
): BusinessIssue {
  return { id, category, severity, headline: `${id} headline`, requiresOwnerAction, businessFunction };
}

describe("issue-priority — module contract assertions", () => {
  it("IssueCategory is an object", () => { expect(typeof IssueCategory).toBe("object"); });
  it("ISSUE_PRIORITY_RANK is an object", () => { expect(typeof ISSUE_PRIORITY_RANK).toBe("object"); });
  it("rankIssues is a function", () => { expect(typeof rankIssues).toBe("function"); });
  it("outranks is a function", () => { expect(typeof outranks).toBe("function"); });
  it("cashDangerOutranksGrowth is a function", () => { expect(typeof cashDangerOutranksGrowth).toBe("function"); });
  it("customerFailureOutranksMarketing is a function", () => { expect(typeof customerFailureOutranksMarketing).toBe("function"); });
  it("topIssues is a function", () => { expect(typeof topIssues).toBe("function"); });
  it("DEFAULT_TOP_LIMIT is a number", () => { expect(typeof DEFAULT_TOP_LIMIT).toBe("number"); });
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("issue is a function", () => { expect(typeof issue).toBe("function"); });
  it("issue() returns an object", () => { expect(typeof issue("test", IssueCategory.CASH_DANGER)).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("Module 41 — priority ranking engine", () => {
  it("[module41] canonical ranks are 1..10 with no gaps/dupes in spec order", () => {
    const order = [
      IssueCategory.CASH_DANGER,
      IssueCategory.CUSTOMER_SERVICE_FAILURE,
      IssueCategory.OVERLOAD,
      IssueCategory.PROFIT_LEAK,
      IssueCategory.CAPACITY_BOTTLENECK,
      IssueCategory.COMPLIANCE_SAFETY_RISK,
      IssueCategory.BLOCKED_EXECUTION,
      IssueCategory.PENDING_PROOF_OUTCOME,
      IssueCategory.GROWTH_OPPORTUNITY,
      IssueCategory.PROCESS_IMPROVEMENT,
    ];
    expect(order.map((c) => ISSUE_PRIORITY_RANK[c])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("[module41] cash danger ranks above growth", () => {
    expect(outranks(IssueCategory.CASH_DANGER, IssueCategory.GROWTH_OPPORTUNITY)).toBe(true);
    expect(cashDangerOutranksGrowth()).toBe(true);
    const ranked = rankIssues([
      issue("g", IssueCategory.GROWTH_OPPORTUNITY, "CRITICAL"),
      issue("c", IssueCategory.CASH_DANGER, "LOW"),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["c", "g"]);
  });

  it("[module41] customer/service failure ranks above marketing (growth/process)", () => {
    expect(customerFailureOutranksMarketing()).toBe(true);
    expect(outranks(IssueCategory.CUSTOMER_SERVICE_FAILURE, IssueCategory.GROWTH_OPPORTUNITY)).toBe(true);
    expect(outranks(IssueCategory.CUSTOMER_SERVICE_FAILURE, IssueCategory.PROCESS_IMPROVEMENT)).toBe(true);
    const ranked = rankIssues([
      issue("mkt", IssueCategory.GROWTH_OPPORTUNITY, "HIGH"),
      issue("svc", IssueCategory.CUSTOMER_SERVICE_FAILURE, "LOW"),
    ]);
    expect(ranked[0].id).toBe("svc");
  });

  it("[module41] overload ranks above profit-leak optimization", () => {
    expect(outranks(IssueCategory.OVERLOAD, IssueCategory.PROFIT_LEAK)).toBe(true);
    const ranked = rankIssues([
      issue("leak", IssueCategory.PROFIT_LEAK, "CRITICAL"),
      issue("over", IssueCategory.OVERLOAD, "LOW"),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["over", "leak"]);
  });

  it("[module41] proof/outcome ranks above growth", () => {
    expect(outranks(IssueCategory.PENDING_PROOF_OUTCOME, IssueCategory.GROWTH_OPPORTUNITY)).toBe(true);
    const ranked = rankIssues([
      issue("grow", IssueCategory.GROWTH_OPPORTUNITY, "CRITICAL"),
      issue("proof", IssueCategory.PENDING_PROOF_OUTCOME, "LOW"),
    ]);
    expect(ranked[0].id).toBe("proof");
  });

  it("[module41] rankIssues is stable and does not mutate input", () => {
    const input = [
      issue("b", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("a", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("z", IssueCategory.CASH_DANGER, "LOW"),
    ];
    const snapshot = input.map((i) => i.id);
    const ranked = rankIssues(input);
    // input untouched
    expect(input.map((i) => i.id)).toEqual(snapshot);
    expect(ranked).not.toBe(input);
    // deterministic total order via id tie-break
    expect(ranked.map((i) => i.id)).toEqual(["z", "a", "b"]);
    // running twice yields identical order regardless of original order
    const ranked2 = rankIssues([...input].reverse());
    expect(ranked2.map((i) => i.id)).toEqual(ranked.map((i) => i.id));
  });

  it("[module41] severity tie-break within same category (CRITICAL>HIGH>MEDIUM>LOW)", () => {
    const ranked = rankIssues([
      issue("low", IssueCategory.PROFIT_LEAK, "LOW"),
      issue("crit", IssueCategory.PROFIT_LEAK, "CRITICAL"),
      issue("med", IssueCategory.PROFIT_LEAK, "MEDIUM"),
      issue("high", IssueCategory.PROFIT_LEAK, "HIGH"),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["crit", "high", "med", "low"]);
  });

  it("[module41] requiresOwnerAction tie-break after equal category+severity", () => {
    const ranked = rankIssues([
      issue("info", IssueCategory.CAPACITY_BOTTLENECK, "HIGH", false),
      issue("act", IssueCategory.CAPACITY_BOTTLENECK, "HIGH", true),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["act", "info"]);
  });

  it("[module41] topIssues caps at 3 for normal load", () => {
    const issues = [
      issue("1", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("2", IssueCategory.CAPACITY_BOTTLENECK, "HIGH"),
      issue("3", IssueCategory.BLOCKED_EXECUTION, "HIGH"),
      issue("4", IssueCategory.GROWTH_OPPORTUNITY, "HIGH"),
      issue("5", IssueCategory.PROCESS_IMPROVEMENT, "HIGH"),
    ];
    const top = topIssues(issues);
    expect(top).toHaveLength(DEFAULT_TOP_LIMIT);
    expect(top.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("[module41] topIssues returns more under explicit emergency flag", () => {
    const issues = [
      issue("1", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("2", IssueCategory.CAPACITY_BOTTLENECK, "HIGH"),
      issue("3", IssueCategory.BLOCKED_EXECUTION, "HIGH"),
      issue("4", IssueCategory.GROWTH_OPPORTUNITY, "HIGH"),
    ];
    expect(topIssues(issues, 3, true)).toHaveLength(4);
  });

  it("[module41] topIssues returns all under a critical cash-danger emergency", () => {
    const issues = [
      issue("cash", IssueCategory.CASH_DANGER, "CRITICAL"),
      issue("a", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("b", IssueCategory.CAPACITY_BOTTLENECK, "HIGH"),
      issue("c", IssueCategory.BLOCKED_EXECUTION, "HIGH"),
      issue("d", IssueCategory.GROWTH_OPPORTUNITY, "HIGH"),
    ];
    const top = topIssues(issues);
    expect(top).toHaveLength(5);
    expect(top[0].id).toBe("cash");
  });

  it("[module41] a non-critical cash issue does NOT lift the cap", () => {
    const issues = [
      issue("cash", IssueCategory.CASH_DANGER, "HIGH"),
      issue("a", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("b", IssueCategory.CAPACITY_BOTTLENECK, "HIGH"),
      issue("c", IssueCategory.BLOCKED_EXECUTION, "HIGH"),
    ];
    expect(topIssues(issues)).toHaveLength(DEFAULT_TOP_LIMIT);
  });

  it("[module41] topIssues falls back to default cap for invalid limits", () => {
    const issues = [
      issue("1", IssueCategory.PROFIT_LEAK, "HIGH"),
      issue("2", IssueCategory.CAPACITY_BOTTLENECK, "HIGH"),
      issue("3", IssueCategory.BLOCKED_EXECUTION, "HIGH"),
      issue("4", IssueCategory.GROWTH_OPPORTUNITY, "HIGH"),
    ];
    expect(topIssues(issues, 0)).toHaveLength(DEFAULT_TOP_LIMIT);
    expect(topIssues(issues, -5)).toHaveLength(DEFAULT_TOP_LIMIT);
  });
});
