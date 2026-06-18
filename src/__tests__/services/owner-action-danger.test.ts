import { describe, it, expect } from "vitest";
import { detectOwnerActionDanger, type OwnerActionEvidence } from "@/services/governance/owner-action-danger";

/**
 * Owner-proposed-action danger detector (NEGATIVE_MARGIN_DISCOUNT). Abstain-only
 * signal. Fires ONLY when the owner proposes a deep/broad across-the-board discount
 * AND contribution is negative (or the cut would turn it negative). Narrow by design:
 * generic discounting alone, generic negative margin alone, small/reversible price
 * tests, capex, and debt do NOT trigger. Runtime evidence only — no case ids/keys.
 */

let seq = 0;
function ev(
  dimension: string,
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): OwnerActionEvidence {
  seq += 1;
  return { dimension, finding, isCritical, supportingData };
}
const danger = (e: OwnerActionEvidence[]) => detectOwnerActionDanger(e).danger;

describe("owner-action-danger — NEGATIVE_MARGIN_DISCOUNT", () => {
  it("[1] deep discount + negative contribution margin triggers", () => {
    const sig = detectOwnerActionDanger([
      ev("financial_health", "Margins are thin and the owner wants a deep across-the-board discount to hit the quarter", true, { marginPct: 3 }),
      ev("financial_health", "Contribution after the proposed discount would turn negative per unit", true, { contribution: -5 }),
    ]);
    expect(sig.danger).toBe(true);
    expect(sig.type).toBe("NEGATIVE_MARGIN_DISCOUNT");
  });

  it("[2] discounting with positive margin does NOT trigger", () => {
    expect(
      danger([
        ev("financial_health", "The owner wants a deep across-the-board discount to drive volume", true, { contribution: 12 }),
        ev("financial_health", "Gross margin remains healthy at 40 percent", true, { grossMarginPct: 40 }),
      ])
    ).toBe(false);
  });

  it("[3] negative margin with no discount proposal does NOT trigger", () => {
    expect(
      danger([
        ev("financial_health", "Contribution per unit is negative after rising input costs", true, { contribution: -4 }),
        ev("operational_efficiency", "Throughput is constrained at one station", true, { capacityPct: 95 }),
      ])
    ).toBe(false);
  });

  it("[4] small reversible price test does NOT trigger (even with negative contribution)", () => {
    expect(
      danger([
        ev("financial_health", "The owner proposes a small reversible price test discount on one store", true, {}),
        ev("financial_health", "Current contribution per unit is slightly negative", true, { contribution: -1 }),
      ])
    ).toBe(false);
  });

  it("[5] capex / irreversible expansion wording does NOT trigger", () => {
    expect(
      danger([
        ev("financial_health", "A large irreversible automated build is proposed funded by new debt", true, { capexAmount: 800000, reversibility: 0 }),
        ev("market_position", "The demand surge appears tied to a single short-term contract", true, { demandDurabilityMonths: 3 }),
      ])
    ).toBe(false);
  });

  it("[6] debt wording does NOT trigger", () => {
    expect(
      danger([
        ev("financial_health", "Covenant headroom is thin and a refinancing window is approaching", true, { covenantHeadroom: 0.04 }),
        ev("financial_health", "Interest coverage has fallen below 1.3x", true, { interestCoverage: 1.1 }),
      ])
    ).toBe(false);
  });

  it("non-critical evidence is ignored (both signals must be on critical items)", () => {
    expect(
      danger([
        ev("financial_health", "The owner wants a deep across-the-board discount", false, {}),
        ev("financial_health", "Contribution would turn negative", false, { contribution: -3 }),
      ])
    ).toBe(false);
  });
});
