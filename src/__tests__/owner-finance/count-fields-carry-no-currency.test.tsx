// @vitest-environment jsdom
/**
 * Live QA 2026-11-24: "Order count", "Customer count" and "Repeat customers" were labelled with the business currency
 * (e.g. "Order count (INR)") and their recorded values shown as money ("Recorded now: INR 12"). Counts are not amounts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/owner-first-run-client", () => ({
  firstRunApi: { correct: vi.fn() },
  newIdempotencyKey: () => "test-key-0001",
}));

import { FirstResultCorrection } from "@/components/owner/first-run/FirstResultCorrection";
import { FINANCE_FIELDS, FINANCE_COUNT_FIELD_NAMES, financeField, financeFieldLabel, formatRecordedFinanceValue } from "@/domain/owner-finance/snapshot-fields";
import type { CorrectionField } from "@/domain/owner-first-run/correction-form";

afterEach(() => cleanup());

const money = (n: number | null) => (n === null ? "nothing yet" : `INR ${n}`);

describe("finance field units", () => {
  it("count fields carry no currency; every other finance field does", () => {
    expect([...FINANCE_COUNT_FIELD_NAMES].sort()).toEqual(["customerCount", "orderCount", "repeatCustomerCount"]);
    for (const f of FINANCE_FIELDS) {
      const label = financeFieldLabel(f, "INR");
      if (FINANCE_COUNT_FIELD_NAMES.has(f.name)) expect(label).toBe(f.label);
      else expect(label).toBe(`${f.label} (INR)`);
    }
  });
  it("recorded counts are plain numbers (a known zero stays 0), recorded amounts use the money formatter, unknown is passed through", () => {
    expect(formatRecordedFinanceValue("orderCount", 12, money)).toBe("12");
    expect(formatRecordedFinanceValue("customerCount", 0, money)).toBe("0");
    expect(formatRecordedFinanceValue("revenue", 12000, money)).toBe("INR 12000");
    expect(formatRecordedFinanceValue("orderCount", null, money)).toBe("nothing yet");
  });
});

describe("FirstResultCorrection with count fields", () => {
  it("labels counts without a currency and shows recorded counts as plain numbers", () => {
    const fields = ["revenue", "orderCount", "customerCount", "repeatCustomerCount"].map((n) => {
      const f = financeField(n);
      return { name: f.name, label: f.label, hint: f.hint } as unknown as CorrectionField;
    });
    render(
      <FirstResultCorrection
        businessId="b1" snapshotId="s1" currency="INR" fields={fields}
        recorded={{ revenue: 100000, orderCount: 12, customerCount: 9, repeatCustomerCount: 0 }} onDone={vi.fn()} onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Revenue (INR)")).toBeTruthy();
    for (const label of ["Order count", "Customer count", "Repeat customers"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
      expect(screen.queryByLabelText(`${label} (INR)`)).toBeNull();
    }
    expect(screen.getByText("Recorded now: INR 100,000")).toBeTruthy();
    expect(screen.getByText("Recorded now: 12")).toBeTruthy();
    expect(screen.getByText("Recorded now: 9")).toBeTruthy();
    expect(screen.getByText("Recorded now: 0")).toBeTruthy();
  });
});
