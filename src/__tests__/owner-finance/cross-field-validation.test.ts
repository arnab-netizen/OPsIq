import { describe, it, expect } from "vitest";
import { financialSnapshotCreateSchema, financialSnapshotAmendSchema, findFinanceContradictions } from "@/domain/owner-finance/validation";

const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" };
const issues = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) => (r.success ? [] : r.error!.issues);

describe("finance snapshot: relationships that cannot all be true are refused, naming the field", () => {
  it("repeat customers > total customers", () => {
    const i = issues(financialSnapshotCreateSchema.safeParse({ ...base, customerCount: 40, repeatCustomerCount: 60 }) as never);
    expect(i).toHaveLength(1);
    expect(i[0].path).toEqual(["repeatCustomerCount"]);
    expect(i[0].message).toMatch(/Repeat customers \(60\) cannot be more than total customers \(40\)/);
  });
  it("overdue payables > payables, overdue receivables > receivables", () => {
    const i = issues(financialSnapshotCreateSchema.safeParse({ ...base, payables: 1000, payablesOverdue: 5000, receivables: 100, receivablesOverdue: 200 }) as never);
    expect(i.map((x) => x.path[0]).sort()).toEqual(["payablesOverdue", "receivablesOverdue"]);
  });
  it("rent + payroll + utilities more than the total fixed costs", () => {
    const i = issues(financialSnapshotCreateSchema.safeParse({ ...base, fixedCosts: 20000, rent: 15000, salaryPayroll: 9000 }) as never);
    expect(i.map((x) => x.path[0])).toEqual(["fixedCosts"]);
    expect(i[0].message).toMatch(/Total fixed costs \(20000\) is less than the rent, payroll and utilities you entered \(24000\)/);
  });
  it("cost of goods vs variable costs is NOT a part/whole check (COGS is a gross-margin input; explicit variableCosts is the profit total)", () => {
    expect(financialSnapshotCreateSchema.safeParse({ ...base, costOfGoodsOrServices: 300000, variableCosts: 100000, deliveryFulfilmentCost: 200 }).success).toBe(true);
  });
  it("consumer + business revenue more than revenue", () => {
    expect(issues(financialSnapshotCreateSchema.safeParse({ ...base, revenue: 100, b2cRevenue: 80, b2bRevenue: 80 }) as never).map((x) => x.path[0])).toEqual(["revenue"]);
  });
  it("end date before start date is refused on the end date", () => {
    const i = issues(financialSnapshotCreateSchema.safeParse({ ...base, periodStart: "2026-09-30", periodEnd: "2026-09-01" }) as never);
    expect(i[0].path).toEqual(["periodEnd"]);
  });
  it("consistent figures, equal parts and whole, and explicit zeros pass; an UNKNOWN side is never a contradiction", () => {
    expect(financialSnapshotCreateSchema.safeParse({ ...base, customerCount: 40, repeatCustomerCount: 40, payables: 0, payablesOverdue: 0, fixedCosts: 24000, rent: 15000, salaryPayroll: 9000 }).success).toBe(true);
    expect(financialSnapshotCreateSchema.safeParse({ ...base, repeatCustomerCount: 60 }).success).toBe(true); // total customers UNKNOWN
    expect(findFinanceContradictions({ rent: 5, fixedCosts: null })).toEqual([]);
  });
  it("an amendment payload is held to the same relationships", () => {
    const r = financialSnapshotAmendSchema.safeParse({ amendmentReason: "fix", customerCount: 10, repeatCustomerCount: 20 });
    expect(r.success).toBe(false);
  });
});
