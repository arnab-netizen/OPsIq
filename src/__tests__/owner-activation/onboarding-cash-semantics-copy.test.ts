/**
 * Onboarding cash-semantics copy guard.
 *
 * The finance engine's cashDaysOfCosts (src/domain/owner-finance/metrics.ts) deliberately sums
 * cashOnHand + bankBalance as total liquid funds -- a real, intentional, already-tested behavior
 * (src/__tests__/owner-finance/diagnosis-blocker-remediation.test.ts "DEFECT 1") for businesses
 * that report till-cash on the finance snapshot and bank balance separately via a Cashflow
 * snapshot. That sum is only correct when the two figures are genuinely disjoint. If onboarding's
 * "cash on hand" copy told an owner to enter "bank account and till" as one combined total, and
 * that same owner later also entered a bank balance via Cashflow for the same account, the two
 * would silently double-count the bank portion.
 *
 * This is a copy/wording guard, not a finance-engine change: cashOnHand + bankBalance's summation
 * itself is correct and intentionally untouched here (per "do not invent a new finance
 * definition"). The fix is the onboarding page's own helper text warning against double entry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ONBOARDING_PAGE = join(
  process.cwd(),
  "src/app/(authenticated)/owner/onboarding/page.tsx",
);

function onboardingSource(): string {
  return readFileSync(ONBOARDING_PAGE, "utf8");
}

describe("onboarding cash-on-hand copy warns against double-counting bank balance", () => {
  it("does not tell the owner to enter bank account and till as one figure with no double-entry warning", () => {
    const src = onboardingSource();
    // The old, unqualified wording this guards against.
    expect(src).not.toContain("What&rsquo;s in the business bank account and till today.");
  });

  it("explicitly warns against entering the same bank balance in both Cash in hand and Cashflow (shared copy)", () => {
    const src = onboardingSource();
    // The bank-balance copy is defined once in the shared quick-entry domain and rendered here.
    expect(src).toContain("BANK_BALANCE_COPY");
    const shared = readFileSync(join(process.cwd(), "src/domain/owner-finance/quick-entry.ts"), "utf8");
    expect(shared).toMatch(/never both|counted twice|only there or only here/i);
    expect(shared).toMatch(/Cashflow/);
  });
});
