/**
 * Boundary guard: Finance `cashOnHand` is PHYSICAL cash (till/safe) only; `bankBalance` is a separate
 * Cashflow value the diagnosis adds to it (metrics.ts: liquid funds = cashOnHand + bankBalance). No
 * owner-facing surface that asks for the Finance `cashOnHand` field may invite the owner to include the
 * bank balance, or the two double-count once a real bank balance is recorded.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CASH_IN_HAND_COPY, BANK_BALANCE_COPY, QUICK_ENTRY_FIELDS } from "@/domain/owner-finance/quick-entry";
import { displayLabelForField } from "@/domain/owner-finance";
import { INTAKE_FIELD_SPECS } from "@/domain/owner-intake/field-specs";

const read = (f: string) => readFileSync(f, "utf8");
const BANK_INCLUSIVE = /cash and bank|bank (balance )?(and|\+|or) (till|cash)|cash (\+|and|or|plus) bank|include[s]? (the )?bank balance|bank balance you could use|in the (business )?bank account and till/i;

describe("cashOnHand means physical cash — one truthful meaning everywhere", () => {
  it("the shared copy says physical cash, excludes the bank, and tells the owner to enter 0 if none", () => {
    expect(CASH_IN_HAND_COPY.label).toBe("Cash in hand");
    expect(CASH_IN_HAND_COPY.hint).toMatch(/Physical cash/i);
    expect(CASH_IN_HAND_COPY.hint).toMatch(/Don't include money in the bank/);
    expect(CASH_IN_HAND_COPY.hint).toMatch(/enter 0/i);
    expect(CASH_IN_HAND_COPY.hint).not.toMatch(BANK_INCLUSIVE);
  });

  it("QuickFinancialPicture's cash field uses the shared copy (quick start)", () => {
    const cash = QUICK_ENTRY_FIELDS.find((f) => f.name === "cashOnHand")!;
    expect(cash.label).toBe(CASH_IN_HAND_COPY.label);
    expect(cash.hint).toBe(CASH_IN_HAND_COPY.hint);
    expect(cash.hint).not.toMatch(BANK_INCLUSIVE);
  });

  it("Money's full-detail form uses the same copy (no separate, contradictory definition)", () => {
    const src = read("src/app/(authenticated)/owner/finance/page.tsx");
    const line = src.split("\n").find((l) => l.includes('name: "cashOnHand"'))!;
    expect(line).toContain("CASH_IN_HAND_COPY.label");
    expect(line).toContain("CASH_IN_HAND_COPY.hint");
    expect(src).not.toMatch(/Cash and bank balance you could use today/);
    expect(line).not.toMatch(BANK_INCLUSIVE);
  });

  it("Guided setup renders the same four core definitions and a SEPARATE bank-balance field", () => {
    const src = read("src/app/(authenticated)/owner/onboarding/page.tsx");
    expect(src).toContain("QUICK_ENTRY_FIELDS.map");
    expect(src).toContain("BANK_BALANCE_COPY");
    expect(src).not.toMatch(BANK_INCLUSIVE);
    expect(BANK_BALANCE_COPY.label).not.toBe(CASH_IN_HAND_COPY.label);
    expect(BANK_BALANCE_COPY.hint).toMatch(/never both|counted twice/i);
  });

  it("the CSV/import label and the missing-input label do not invite bank money into cashOnHand", () => {
    const spec = INTAKE_FIELD_SPECS.finance.find((f) => f.name === "cashOnHand")!;
    expect(spec.label).toMatch(/Cash in hand/);
    expect(spec.label).not.toMatch(BANK_INCLUSIVE);
    expect(displayLabelForField("cashOnHand")).toBe("Cash in hand");
  });

  it("no owner-facing source renders a cashOnHand label/hint that includes the bank", () => {
    for (const f of [
      "src/domain/owner-finance/quick-entry.ts",
      "src/components/owner/QuickFinancialPicture.tsx",
      "src/app/(authenticated)/owner/finance/page.tsx",
      "src/app/(authenticated)/owner/onboarding/page.tsx",
      "src/domain/owner-intake/field-specs.ts",
    ]) {
      for (const line of read(f).split("\n")) {
        if (/cashOnHand|CASH_IN_HAND/.test(line) && /label|hint/.test(line)) expect(line, f).not.toMatch(BANK_INCLUSIVE);
      }
    }
  });
});
