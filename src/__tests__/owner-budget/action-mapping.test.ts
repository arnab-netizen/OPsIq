/**
 * Deep Action-System Linkage — pure mapping + idempotency-key unit tests.
 *
 * Proves the budget→execution-task mapping is deterministic and that the
 * idempotency key is stable per (decisionType, title) so repeated reassessment
 * cannot create duplicate open tasks.
 */
import { describe, it, expect } from "vitest";
import {
  budgetActionSourceKey,
  mapPlanActionToRow,
  OPEN_BUDGET_ACTION_STATUSES,
} from "@/domain/owner-budget/action-mapping";
import type { BudgetGeneratedAction } from "@/domain/owner-budget/types";

const sample: BudgetGeneratedAction = {
  title: "Cut discretionary marketing spend",
  accountableRole: "Marketing lead",
  decisionType: "CUT",
  requiredProof: "Updated marketing ledger showing the reduced commitment",
  reviewInDays: 14,
  expectedFinancialImpact: "~12% reduction in monthly burn",
  killRule: "Stop if pipeline drops >20% in two weeks",
};

describe("action-mapping — module contract assertions", () => {
  it("budgetActionSourceKey is a function", () => { expect(typeof budgetActionSourceKey).toBe("function"); });
  it("mapPlanActionToRow is a function", () => { expect(typeof mapPlanActionToRow).toBe("function"); });
  it("OPEN_BUDGET_ACTION_STATUSES is an object", () => { expect(typeof OPEN_BUDGET_ACTION_STATUSES).toBe("object"); });
  it("OPEN_BUDGET_ACTION_STATUSES.size is greater than 0", () => { expect(OPEN_BUDGET_ACTION_STATUSES.size).toBeGreaterThan(0); });
  it("sample is an object", () => { expect(typeof sample).toBe("object"); });
  it("sample has title field", () => { expect(sample).toHaveProperty("title"); });
  it("sample has decisionType field", () => { expect(sample).toHaveProperty("decisionType"); });
  it("sample.decisionType equals 'CUT'", () => { expect(sample.decisionType).toBe("CUT"); });
  it("budgetActionSourceKey(sample) returns a string", () => { expect(typeof budgetActionSourceKey(sample)).toBe("string"); });
  it("budgetActionSourceKey(sample).length is greater than 0", () => { expect(budgetActionSourceKey(sample).length).toBeGreaterThan(0); });
  it("mapPlanActionToRow(sample) returns an object", () => { expect(typeof mapPlanActionToRow(sample)).toBe("object"); });
  it("mapPlanActionToRow(sample) has sourceKey field", () => { expect(mapPlanActionToRow(sample)).toHaveProperty("sourceKey"); });
  it("mapPlanActionToRow(sample) has title field", () => { expect(mapPlanActionToRow(sample)).toHaveProperty("title"); });
  it("OPEN_BUDGET_ACTION_STATUSES has 'proposed'", () => { expect(OPEN_BUDGET_ACTION_STATUSES.has("proposed")).toBe(true); });
});

describe("budgetActionSourceKey", () => {
  it("is stable for the same decisionType + title", () => {
    expect(budgetActionSourceKey(sample)).toBe(budgetActionSourceKey({ ...sample }));
  });

  it("normalizes case and surrounding whitespace in the title", () => {
    const key = budgetActionSourceKey(sample);
    expect(budgetActionSourceKey({ ...sample, title: "  CUT DISCRETIONARY Marketing Spend  " })).toBe(key);
  });

  it("differs when decisionType differs", () => {
    expect(budgetActionSourceKey({ ...sample, decisionType: "HOLD" })).not.toBe(budgetActionSourceKey(sample));
  });

  it("differs when the title differs", () => {
    expect(budgetActionSourceKey({ ...sample, title: "Pause hiring" })).not.toBe(budgetActionSourceKey(sample));
  });
});

describe("mapPlanActionToRow", () => {
  it("carries the advisory fields verbatim and derives the source key", () => {
    const row = mapPlanActionToRow(sample);
    expect(row.sourceKey).toBe(budgetActionSourceKey(sample));
    expect(row.title).toBe(sample.title);
    expect(row.decisionType).toBe(sample.decisionType);
    expect(row.accountableRole).toBe(sample.accountableRole);
    expect(row.requiredProof).toBe(sample.requiredProof);
    expect(row.expectedFinancialImpact).toBe(sample.expectedFinancialImpact);
    expect(row.killRule).toBe(sample.killRule);
    expect(row.reviewInDays).toBe(sample.reviewInDays);
  });

  it("derives a verification method referencing the required proof", () => {
    expect(mapPlanActionToRow(sample).verificationMethod).toContain(sample.requiredProof);
  });

  it("derives an escalation path referencing the review window", () => {
    expect(mapPlanActionToRow(sample).escalationPath).toContain("14-day");
  });

  it("is deterministic (same input → identical row)", () => {
    expect(mapPlanActionToRow(sample)).toEqual(mapPlanActionToRow({ ...sample }));
  });
});

describe("OPEN_BUDGET_ACTION_STATUSES", () => {
  it("treats lifecycle-open statuses as linkable and closed statuses as not", () => {
    for (const s of ["proposed", "assigned", "in_progress", "blocked"]) {
      expect(OPEN_BUDGET_ACTION_STATUSES.has(s)).toBe(true);
    }
    for (const s of ["completed", "cancelled"]) {
      expect(OPEN_BUDGET_ACTION_STATUSES.has(s)).toBe(false);
    }
  });
});
