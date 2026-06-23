import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P3-F fix: Sears liquidity-pressure paired corroboration.
 *
 * "Debt and liquidity pressure limiting available investment" does not match
 * LIQUIDITY_HARD (no hard term) and ADVERSE_FRAMING has no "limiting"/"pressure" term,
 * so softDistress fails. Fix: new fin_isLiquidityPressurePaired fires when:
 *   1. A critical financial_health item contains LIQUIDITY_PRESSURE_PHRASE
 *      (liquidity pressure | liquidity constrained | constrained financial flexibility)
 *   2. Another critical financial_health item has LIQUIDITY_CORROBORATOR
 *      (asset sale/monetization | fund operations | comparable sales down |
 *       revenue decline | operating decline | debt limiting)
 *
 * Guards:
 *   - "liquidity pressure" alone (no corroborator) must NOT fire
 *   - "business pressure" must NOT fire
 *   - "constrained flexibility" without capital/financial qualifier must NOT fire
 *   - Scope-gap cases unchanged
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

const primary = (e: EvidenceItem[]) =>
  diagnoseRootCause(e, "test").primaryRootCause.type;

// ─── P3-F: Sears-style liquidity pressure paired fires cash_liquidity_crisis ──

describe("P3-F — Sears-style liquidity pressure + corroborator fires cash_liquidity_crisis", () => {
  it("'liquidity pressure' + 'asset sales to fund operations' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Debt and liquidity pressure limiting available investment for operational improvement"),
        ev("financial_health", "Company using asset sales and financial transactions to fund operations — substituting asset monetization for operational improvement"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("Sears full evidence set fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Q1 2018 total comparable store sales down 11.9% year-over-year per SEC filing"),
        ev("financial_health", "Sears Domestic comparable store sales down 13.4% in Q1 2018 per SEC filing"),
        ev("financial_health", "Company using asset sales and financial transactions to fund operations — substituting asset monetization for operational improvement"),
        ev("financial_health", "Debt and liquidity pressure limiting available investment for operational improvement"),
        ev("operational_efficiency", "Store closures contributing to revenue decline but not resolving the comparable sales decline in remaining stores"),
        ev("operational_efficiency", "Sustained underinvestment in store experience and customer value proposition"),
        ev("market_position", "Omnichannel capability weak relative to e-commerce and department-store competitors"),
        ev("process_maturity", "No clear operating turnaround plan — strategy primarily asset monetization and store closures without competitive repositioning", true),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'liquidity pressure' + 'comparable store sales down' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Severe liquidity pressure from declining revenue base and high fixed-cost structure"),
        ev("financial_health", "Comparable store sales down 13.4% year-over-year — revenue decline accelerating"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'constrained financial flexibility' + 'asset monetization to fund operations' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Constrained financial flexibility due to elevated debt levels; investment capacity severely limited"),
        ev("financial_health", "Company relying on asset monetization to fund operations rather than operating cash flow"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'liquidity constrained' + 'revenue declining' fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Liquidity severely constrained following covenant breach and credit facility drawdown"),
        ev("financial_health", "Revenue declining 12% year-over-year with no sign of recovery"),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── P3-F: boundary guards — individual phrases alone must NOT fire ───────────

describe("P3-F boundary guards — weak/single phrases do NOT fire cash_liquidity_crisis", () => {
  it("'liquidity pressure' alone does NOT fire cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Debt and liquidity pressure limiting available investment for operational improvement"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'business pressure' alone does NOT fire cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Business pressure from competitive dynamics and consumer spending shifts"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'financial pressure' alone does NOT fire (no liquidity term)", () => {
    expect(
      primary([
        ev("financial_health", "Financial pressure from higher raw material costs and adverse currency movements"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'constrained flexibility' without capital/financial qualifier does NOT fire", () => {
    // "constrained flexibility" without "capital" or "financial" prefix does not match
    expect(
      primary([
        ev("financial_health", "Operational flexibility is constrained by legacy store lease commitments"),
        ev("financial_health", "Revenue declining due to format competition"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'liquidity pressure' + non-critical corroborator does NOT fire (isCritical guard)", () => {
    expect(
      primary([
        ev("financial_health", "Debt and liquidity pressure limiting available investment"),
        ev("financial_health", "Company relying on asset sales to fund operations", false), // not critical
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'liquidity pressure' in wrong dimension does NOT fire", () => {
    // LIQUIDITY_PRESSURE_PHRASE only triggers in financial_health dimension
    expect(
      primary([
        ev("process_maturity", "Debt and liquidity pressure limiting governance investment"),
        ev("financial_health", "Asset sales and financial transactions to fund operations"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("corroborator alone (no liquidity pressure phrase) does NOT fire via paired path", () => {
    // LIQUIDITY_CORROBORATOR without LIQUIDITY_PRESSURE_PHRASE should not fire this path
    // (it might fire via other paths if hard terms present, but not via P3-F)
    expect(
      primary([
        ev("financial_health", "Company using asset sales to fund operations"),
        ev("financial_health", "Revenue declining 8% year-over-year"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});

// ─── P3-F: existing hard/numeric paths still fire unchanged ──────────────────

describe("P3-F — existing cash/liquidity paths unchanged", () => {
  it("'out of cash' still fires cash_liquidity_crisis (existing LIQUIDITY_HARD)", () => {
    expect(
      primary([ev("financial_health", "The company is out of cash and cannot fund operations past month-end")])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("'insolven' still fires cash_liquidity_crisis (existing LIQUIDITY_HARD)", () => {
    expect(
      primary([ev("financial_health", "Company is technically insolvent with no creditor remedy")])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("numeric leverageRatio fires debt_solvency_pressure (not liquidity)", () => {
    expect(
      primary([
        ev("financial_health", "Leverage at 8.5x above covenant of 5x", true, { leverageRatio: 8.5, covenantHeadroom: -3.5 }),
      ])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });
});

// ─── Scope-gap cases remain held ─────────────────────────────────────────────

describe("P3-F — scope-gap cases unchanged", () => {
  it("BlackBerry-style platform disruption does NOT fire cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("market_position", "Market share eroded by iOS and Android ecosystems; developer ecosystem shifted away"),
        ev("market_position", "Enterprise segment credibility retained but consumer relevance lost permanently"),
        ev("financial_health", "Revenue declined as consumer device volumes fell sharply below prior-year levels"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("strategic turnaround without financial distress does NOT fire cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("market_position", "Product portfolio fragmented across consumer and professional segments"),
        ev("operational_efficiency", "Non-core initiatives spread team capacity too thin"),
        ev("financial_health", "Operating losses reported but cost restructuring plan is in preparation"),
      ])
    ).not.toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });
});
