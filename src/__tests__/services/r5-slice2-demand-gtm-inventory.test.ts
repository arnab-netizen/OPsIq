import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * R5 slice 2 — demand / GTM / inventory archetypes. Triggers fire only on strong,
 * specific, ADVERSE domain evidence; generic revenue/margin/cash pressure and
 * proposed-cut adversarial framings do NOT fire. Runs through the real
 * diagnoseRootCause (incl. R2 causal adjudication). No case ids / keys.
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

describe("R5 slice 2 — demand_generation_failure", () => {
  it("true demand collapse (new-customer + lead volume) triggers demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "New-customer acquisition has stalled and top-of-funnel lead volume collapsed", true, { newCustomerRate: 8, leadVolume: 120 }),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'collapse in new-customer volume' phrasing triggers demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "The real driver is a forty-five percent collapse in new-customer volume", true, { newCustomerRate: 5, leadVolume: 60 }),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("generic revenue decline (no demand signal) does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "Sales softened nine percent across the board last quarter", true, { revenueChangePct: -9 }),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("a proposed marketing CUT (no demand collapse) does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "To protect profit the owner plans to cut the marketing budget by seventy percent", true, { marketingCutPct: 70 }),
        ev("market_position", "The new-customer pipeline already depends heavily on that marketing", true, { newCustomerRate: 9, pipelineValue: 1200000 }),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });
});

describe("R5 slice 2 — gtm_channel_mismatch", () => {
  it("channel mismatch (paid-social CAC + channel mix) triggers gtm_channel_mismatch", () => {
    expect(
      primary([
        ev("market_position", "Paid-search absorbs seventy percent of spend but converts poorly; paid-social CAC is triple the blended target", true, { channelMix: 70, channelCac: 240, channelConversionPct: 0.9 }),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("generic growth slowdown (no channel signal) does NOT trigger gtm_channel_mismatch", () => {
    expect(
      primary([
        ev("market_position", "Growth has slowed this year and new logos are down", true, { newCustomerRate: 10 }),
      ])
    ).not.toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });
});

describe("R5 slice 2 — inventory_forecasting_mismatch", () => {
  it("inventory-days swing + forecast error triggers inventory_forecasting_mismatch", () => {
    expect(
      primary([
        ev("operational_efficiency", "Inventory days on hand swung from thirty to seventy-five as forecasts missed", true, { inventoryDays: 75, forecastErrorPct: 38 }),
      ])
    ).toBe(DiagnosisType.INVENTORY_FORECASTING_MISMATCH);
  });

  it("stockout + overstock + forecast mismatch triggers inventory_forecasting_mismatch", () => {
    expect(
      primary([
        ev("operational_efficiency", "Stockouts on top SKUs coincide with overstock on low-velocity lines", true, { stockoutRate: 14, forecastErrorPct: 38 }),
      ])
    ).toBe(DiagnosisType.INVENTORY_FORECASTING_MISMATCH);
  });

  it("generic cash pressure does NOT trigger inventory_forecasting_mismatch", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has fallen to three months as outflows outpace collections", true, { cashRunwayMonths: 3 }),
      ])
    ).not.toBe(DiagnosisType.INVENTORY_FORECASTING_MISMATCH);
  });

  it("a stockout-only proposed inventory CUT (no forecast error) does NOT trigger inventory_forecasting_mismatch", () => {
    expect(
      primary([
        ev("operational_efficiency", "To free cash the owner plans to halve inventory across all lines immediately", true, { inventoryCutPct: 50 }),
        ev("operational_efficiency", "Best-sellers already stock out periodically and a cut would worsen it", true, { stockoutRate: 9, inventoryDays: 40 }),
      ])
    ).not.toBe(DiagnosisType.INVENTORY_FORECASTING_MISMATCH);
  });
});

describe("R5 slice 2 — regression: prior archetypes still pass; healthy abstains", () => {
  it("a genuine cash-liquidity case is still cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has fallen to three months", true, { cashRunwayMonths: 3 }),
        ev("financial_health", "Monthly net cash burn is high", true, { monthlyBurn: 45000 }),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("a genuine cost-inflation margin case is still margin_erosion", () => {
    expect(
      primary([ev("financial_health", "Gross margin declined as input cost per unit rose nineteen percent", true, { marginPct: -14, cogsPct: 19 })])
    ).toBe(DiagnosisType.MARGIN_EROSION);
  });

  it("a debt case (slice 1) is still debt_solvency_pressure", () => {
    expect(
      primary([ev("financial_health", "Covenant breach territory with high leverage and a maturity wall", true, { leverageRatio: 6.1, covenantHeadroom: 0.03 })])
    ).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
  });

  it("a healthy financial position remains UNKNOWN (no fabricated diagnosis)", () => {
    expect(
      primary([ev("financial_health", "Cash reserves are healthy and ample with a long runway", true)])
    ).toBe(DiagnosisType.UNKNOWN);
  });
});
