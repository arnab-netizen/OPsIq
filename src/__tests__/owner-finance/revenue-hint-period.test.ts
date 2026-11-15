/**
 * UX-04: the Revenue field is saved against an explicit, dated period (periodStart / periodEnd), so its guidance must
 * define Revenue by THAT period — never by a generic "typical month" the owner did not select.
 */
import { describe, it, expect } from "vitest";
import { financeField } from "@/domain/owner-finance/snapshot-fields";

describe("Revenue guidance is scoped to the selected period", () => {
  const hint = financeField("revenue").hint;

  it("refers to the period the entered numbers cover", () => {
    expect(hint).toMatch(/\bperiod\b/i);
  });

  it("does not describe Revenue as a generic typical month", () => {
    expect(hint).not.toMatch(/typical month/i);
  });
});
