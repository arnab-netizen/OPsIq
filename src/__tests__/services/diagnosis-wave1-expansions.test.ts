import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * Wave 1 expansion tests — proves the four additive diagnosis-engine changes:
 * 1. DEMAND stagnation tokens (plateau/flat/flatlined/pipeline-stagnant/departure-attrition)
 * 2. WC vocabulary synonyms (slow-pay, payment delay, outstanding invoices)
 * 3. WC numeric gate relaxation (receivablesAging alone sufficient)
 * 4. GTM vocabulary + numeric expansion (digital advertising, funnelConversionPct, leadVolume)
 *
 * All safety guards verified: seasonal softness, generic cash pressure, wrong
 * dimension, and missing numeric do NOT trigger the expanded patterns.
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

// ── 1. DEMAND stagnation tokens ───────────────────────────────────────────────

describe("Wave 1 — DEMAND stagnation: positive fires", () => {
  it("'subscriber count flat' + demand numeric fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Subscriber count has not grown for 18 months despite 12 new signups per month",
          true,
          { newCustomerRate: 12, funnelConversionPct: 6 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'flat total membership' + demand numeric fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Two-year period of flat total membership despite 18 new members joining per month on average",
          true,
          { newCustomerRate: 18, funnelConversionPct: 6 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'flatlined' + lead volume fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "New customer acquisition has flatlined for two consecutive quarters",
          true,
          { leadVolume: 50, newCustomerRate: 3 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'lead pipeline stagnant' + funnel numeric fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Lead pipeline stagnant and top-of-funnel volume has plateaued over six months",
          true,
          { leadVolume: 80, funnelConversionPct: 5 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'departure rate exceeds new acquisition' + demand numeric fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Departure rate offsets new acquisition intake — net membership unchanged for 24 months",
          true,
          { newCustomerRate: 18, funnelConversionPct: 6 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });
});

describe("Wave 1 — DEMAND stagnation: safety guards (must NOT fire)", () => {
  it("seasonal softness alone does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "Sales were lighter than expected this quarter due to seasonal patterns", true, {
          revenueChangePct: -8,
        }),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("'growth slowed' with no stagnation vocabulary does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "Growth has slowed this year and new logos are down slightly", true, {
          newCustomerRate: 10,
        }),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("stagnation vocabulary on financial_health dimension does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Subscriber count has not grown and membership is flat for two years",
          true,
          { newCustomerRate: 10 }
        ),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("stagnation vocabulary with no demand numeric does NOT trigger demand_generation_failure", () => {
    expect(
      primary([
        ev("market_position", "Subscriber count flat for 18 months", true, {
          someUnrelatedKey: 100,
        }),
      ])
    ).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });
});

// ── 2. WC vocabulary synonyms + 3. numeric gate relaxation ───────────────────

describe("Wave 1 — WC synonyms + relaxed numeric gate: positive fires", () => {
  it("receivablesAging alone (no dpo) now satisfies WC numeric gate", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Enterprise clients settling invoices late with funds arriving after payroll obligations",
          true,
          { receivablesAging: 60 }
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("'slow-paying clients' + receivablesAging fires working_capital_stress", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Slow-paying enterprise clients create a structural cash timing gap each payroll cycle",
          true,
          { receivablesAging: 65 }
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("'payment delays' synonym + receivablesAging fires working_capital_stress", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Payment delays from clients average 45 to 60 days beyond agreed terms",
          true,
          { receivablesAging: 55 }
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("'outstanding invoices' + receivablesAging fires working_capital_stress", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Outstanding invoices from completed contracts remain unreceived for more than six months",
          true,
          { receivablesAging: 180 }
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("two WC narrative items (one with receivablesAging) fires working_capital_stress via paired path", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Clients consistently settling their invoices later than the agreed payment period",
          true,
          { receivablesAging: 75 }
        ),
        ev(
          "financial_health",
          "Cash balance depletes at payroll time despite growing outstanding receivables",
          true
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });
});

describe("Wave 1 — WC: safety guards (must NOT fire)", () => {
  it("generic cash pressure alone (no WC vocabulary) does NOT fire working_capital_stress", () => {
    expect(
      primary([
        ev("financial_health", "Cash is tight and the business is under financial pressure", true, {
          cashBalance: 5000,
        }),
      ])
    ).not.toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("inventory cash lockup (no AR/AP/CCC vocabulary) does NOT fire working_capital_stress", () => {
    expect(
      primary([
        ev("financial_health", "Inventory days on hand are high and cash is tied up in stock", true, {
          inventoryDays: 100,
        }),
      ])
    ).not.toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("single WC narrative item with no numeric does NOT fire working_capital_stress", () => {
    expect(
      primary([
        ev("financial_health", "Clients are slow to pay invoices and collections are slow", true),
      ])
    ).not.toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });
});

// ── 4. GTM vocabulary + numeric expansion ────────────────────────────────────

describe("Wave 1 — GTM vocabulary expansion: positive fires", () => {
  it("'digital advertising acquisition channel' + funnelConversionPct fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Digital advertising is the primary acquisition channel with conversion rate below 4 percent",
          true,
          { funnelConversionPct: 4, leadVolume: 200 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("'pipeline conversion' + leadVolume fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Pipeline conversion rate has deteriorated and the acquisition channel is underperforming",
          true,
          { leadVolume: 150, funnelConversionPct: 3 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("'win rate' + channel numeric fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Win rate from paid-search channel has fallen sharply; channel mix needs review",
          true,
          { winRate: 8, channelConversionPct: 0.5 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("'CAC payback' with channel context fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "CAC payback period on the primary acquisition channel has extended to over 24 months",
          true,
          { cacPaybackMonths: 24, channelCac: 850 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("'channel roi' + leadVolume fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Channel ROI on digital advertising has turned negative with broadened targeting",
          true,
          { channelRoi: -15, leadVolume: 300 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });
});

describe("Wave 1 — GTM: safety guards (must NOT fire)", () => {
  it("generic growth slowdown with no channel vocabulary does NOT fire gtm_channel_mismatch", () => {
    expect(
      primary([
        ev("market_position", "Revenue growth has slowed and new logos are down this year", true, {
          newCustomerRate: 10,
        }),
      ])
    ).not.toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("GTM vocabulary on financial_health dimension does NOT fire gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Digital advertising acquisition channel conversion rate analysis",
          true,
          { funnelConversionPct: 4 }
        ),
      ])
    ).not.toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("GTM vocabulary with no channel numeric does NOT fire gtm_channel_mismatch", () => {
    expect(
      primary([
        ev("market_position", "Pipeline conversion and digital advertising are being reviewed", true, {
          someUnrelatedKey: 5,
        }),
      ])
    ).not.toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });
});

// ── Regression: prior positive tests still pass ───────────────────────────────

describe("Wave 1 — regression: existing diagnoses still fire correctly", () => {
  it("explicit demand collapse still fires demand_generation_failure", () => {
    expect(
      primary([
        ev(
          "market_position",
          "New-customer acquisition has stalled and top-of-funnel lead volume collapsed",
          true,
          { newCustomerRate: 8, leadVolume: 120 }
        ),
      ])
    ).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("DSO + CCC still fires working_capital_stress", () => {
    expect(
      primary([
        ev(
          "financial_health",
          "Days sales outstanding has risen to seventy-eight and the cash conversion cycle lengthened",
          true,
          { dso: 78, cashConversionDays: 95, dpo: 40 }
        ),
      ])
    ).toBe(DiagnosisType.WORKING_CAPITAL_STRESS);
  });

  it("paid-search CAC + channel mix still fires gtm_channel_mismatch", () => {
    expect(
      primary([
        ev(
          "market_position",
          "Paid-search absorbs seventy percent of spend but converts poorly; paid-social CAC is triple the blended target",
          true,
          { channelMix: 70, channelCac: 240, channelConversionPct: 0.9 }
        ),
      ])
    ).toBe(DiagnosisType.GTM_CHANNEL_MISMATCH);
  });

  it("cash runway crisis still fires cash_liquidity_crisis", () => {
    expect(
      primary([
        ev("financial_health", "Cash runway has fallen to three months", true, {
          cashRunwayMonths: 3,
        }),
      ])
    ).toBe(DiagnosisType.CASH_LIQUIDITY_CRISIS);
  });

  it("margin erosion still fires margin_erosion", () => {
    expect(
      primary([
        ev("financial_health", "Gross margin declined as input cost per unit rose nineteen percent", true, {
          marginPct: -14,
        }),
      ])
    ).toBe(DiagnosisType.MARGIN_EROSION);
  });

  it("healthy financial position still returns UNKNOWN", () => {
    expect(
      primary([
        ev("financial_health", "Cash reserves are healthy and ample with a long runway", true),
      ])
    ).toBe(DiagnosisType.UNKNOWN);
  });
});
