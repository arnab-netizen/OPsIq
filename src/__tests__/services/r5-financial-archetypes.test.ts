import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * R5 slice 1 — debt / working-capital / pricing archetypes. Triggers fire only on
 * strong, specific, adverse structural evidence; generic cash/revenue/margin
 * pressure must NOT become one of these. Runs through the real diagnoseRootCause
 * (incl. R2 causal adjudication). No case ids / keys.
 */

let seq = 0;
function ev(
  dimension: EvidenceItem["dimension"],
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): EvidenceItem {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    dimension,
    finding,
    confidence: ConfidenceLevel.HIGH,
    source: "test",
    timestamp: new Date(0),
    isCritical,
    supportingData,
  };
}
const primary = (e: EvidenceItem[]) => diagnoseRootCause(e, "test").primaryRootCause.type;

describe("R5 slice 1 — debt_solvency_pressure", () => {
  it("covenant breach + leverage triggers debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "The firm is in covenant breach territory with high leverage", true, { leverageRatio: 6.1, covenantHeadroom: 0.03 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("high leverage + maturity wall + thin interest coverage triggers debt_solvency_pressure", () => {
    expect(
      primary([
        ev("financial_health", "A large debt maturity falls due next year with thin covenant headroom", true, { leverageRatio: 5.1, covenantHeadroom: 0.04, interestCoverage: 1.2 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("generic cash runway pressure does NOT become debt", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has fallen to three months as outflows outpace collections", true, { cashRunwayMonths: 3 }),
        ev("financial_health", "Monthly net cash burn is high against a thinning balance", true, { monthlyBurn: 45000 }),
      ])
    ).not.toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

describe("R5 slice 1 — working_capital_stress", () => {
  it("AR stretch (DSO) + cash-conversion cycle triggers working_capital_stress", () => {
    expect(
      primary([
        ev("financial_health", "Days sales outstanding has risen to seventy-eight and the cash conversion cycle lengthened", true, { dso: 78, cashConversionDays: 95, dpo: 40 }),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("inventory cash lockup does NOT trigger working_capital_stress without AR/AP/CCC evidence", () => {
    expect(
      primary([
        ev("financial_health", "Inventory days on hand are high and cash is tied up in stock", true, { inventoryDays: 100 }),
      ])
    ).not.toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("inventory lockup DOES trigger working_capital_stress when DSO/CCC evidence is also present", () => {
    expect(
      primary([
        ev("financial_health", "Cash is trapped in receivables and stock as DSO and the cash conversion cycle worsened", true, { dso: 90, cashConversionDays: 105, receivablesAging: 65 }),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });
});

describe("R5 slice 1 — pricing_power", () => {
  it("under-pricing below competitors + discount leakage triggers pricing failure", () => {
    expect(
      primary([
        ev("market_position", "Realized prices sit twenty-two percent below comparable competitors with heavy discount leakage", true, { realizedPrice: 78, listPrice: 100, discountPct: 19 }),
      ])
    ).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("self-inflicted discounting triggers pricing failure even when surface looks like margin", () => {
    expect(
      primary([
        ev("financial_health", "Gross margin fell sharply this year", true, { marginPct: -9 }),
        ev("market_position", "It is self-inflicted discounting: the average discount reached twenty-eight percent", true, { discountPct: 28, realizedPrice: 72 }),
        ev("financial_health", "Input costs are flat year over year; the erosion is in price realization", false, { cogsPct: 1 }),
      ])
    ).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("generic margin decline (cost inflation, no pricing evidence) does NOT trigger pricing", () => {
    expect(
      primary([
        ev("financial_health", "Gross margin declined as input cost per unit rose nineteen percent", true, { marginPct: -14, cogsPct: 19 }),
        ev("market_position", "Competitor retail prices are roughly stable; no share movement", false),
      ])
    ).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("generic revenue decline (no pricing evidence) does NOT trigger pricing", () => {
    expect(
      primary([
        ev("market_position", "Sales softened nine percent across the board", true, { revenueChangePct: -9 }),
      ])
    ).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("pricing 'headroom' opportunity framing does NOT trigger a pricing failure", () => {
    expect(
      primary([
        ev("operational_efficiency", "A delivery bottleneck pushes turnaround to eleven days", true, { turnaroundDays: 11, utilizationPct: 95 }),
        ev("market_position", "There is also clear pricing headroom and the owner wants to raise prices", true, { realizedPrice: 85, discountPct: 15 }),
      ])
    ).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("R5 slice 1 — valid prior archetypes still pass; FRC traps re-attributed", () => {
  it("a genuine cash-liquidity case is still cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has fallen to three months as outflows outpace collections", true, { cashRunwayMonths: 3 }),
        ev("financial_health", "Monthly net cash burn is high", true, { monthlyBurn: 45000 }),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("a genuine cost-inflation margin case is still margin_erosion", () => {
    expect(
      primary([
        ev("financial_health", "Gross margin declined as input cost per unit rose nineteen percent", true, { marginPct: -14, cogsPct: 19 }),
      ])
    ).toBe(DiagnosisType.MARGIN_EROSION);
  });

  it("FRC-01 debt-behind-cash now re-attributes to debt_solvency_pressure (was abstain)", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has dropped to about four months", true, { cashRunwayMonths: 4 }),
        ev("financial_health", "The real drain is debt service: leverage is high with covenant headroom nearly gone", true, { leverageRatio: 6.1, covenantHeadroom: 0.03 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});
