import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisType,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

/**
 * P4-B fix: JCPenney pricing-model transition risk — new detection path
 * fin_isPricingTransition added alongside the existing price-realization-gap path.
 *
 * Fires when a single market_position/process_maturity item contains BOTH:
 *   PRICING_MODEL_CHANGE: coupon, promotional pricing, everyday pricing, EDLP,
 *     pricing model change, pricing transition
 *   PRICING_CUSTOMER_RISK: behavior change required, promo-sensitive, accustomed to
 *     promo/coupon/discount, price perception, cognitive repricing, traffic/conversion risk
 *
 * Requiring both in the same item prevents single-signal mentions (generic "coupons",
 * "everyday pricing" in normal commentary) from triggering.
 *
 * Guards: "pricing pressure from competitors" (no model-change), "summer discount sale"
 * (bare discount without model-change pattern), "retail sales declined" (no pricing signals),
 * "introduced a new coupon" alone (no customer-risk pairing).
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
    id: `00000000-0000-4000-b000-${String(seq).padStart(12, "0")}`,
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

// ─── Fire paths ──────────────────────────────────────────────────────────────

describe("P4-B: coupon/promotional-to-everyday pricing transition fires pricing_power", () => {
  it("promo-sensitive customer base + pricing model change fires pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "J.C. Penney's existing customer base is highly accustomed to promotional pricing, coupons, and discount events — behavior change required by new strategy is significant",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("price perception risk + everyday pricing transition fires pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "Customer price perception may not shift immediately from 'sale price' to 'everyday price' — cognitive repricing takes time and communication investment",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("EDLP rollout with promo-sensitive customer base fires pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "EDLP strategy launched chain-wide; existing customer base is promo-sensitive and unlikely to respond positively without a transition period",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });

  it("everyday low pricing model change + traffic risk fires pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "Shift to everyday low pricing from promotional model creates significant traffic risk as customers conditioned to promotional cadence may reduce visit frequency",
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("P4-B: JCPenney combined evidence profile fires pricing_power", () => {
  it("full JCPenney-profile evidence fires pricing_power_failure", () => {
    const evidence = [
      ev(
        "market_position",
        "J.C. Penney's existing customer base is highly accustomed to promotional pricing, coupons, and discount events — behavior change required by new strategy is significant",
      ),
      ev(
        "market_position",
        "Customer price perception may not shift immediately from 'sale price' to 'everyday price' — cognitive repricing takes time and communication investment",
      ),
      ev(
        "operational_efficiency",
        "New everyday low pricing strategy being rolled out across the full chain simultaneously — no disclosed phased or pilot approach",
      ),
      ev(
        "operational_efficiency",
        "Strategy involves simultaneous changes: pricing model, brand name, and store redesign — compounding execution risk",
      ),
      ev(
        "financial_health",
        "Traffic and conversion risk is chain-wide from day one — no control stores to measure impact separately",
      ),
      ev(
        "process_maturity",
        "No publicly disclosed real-time customer response monitoring or rollback plan — strategic optionality appears limited",
        true,
      ),
    ];
    expect(primary(evidence)).toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

// ─── Guard tests ─────────────────────────────────────────────────────────────

describe("P4-B guard: generic pricing pressure does NOT fire pricing_power", () => {
  it("'pricing pressure from competitors' alone does NOT fire pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "The company faces increasing pricing pressure from low-cost competitors entering the segment",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("P4-B guard: ordinary discount promotion does NOT fire pricing_power", () => {
  it("'summer discount sale' without model-change signals does NOT fire pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "The company ran a summer discount sale that brought in 20% more foot traffic than the prior year baseline",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("P4-B guard: retail sales decline without pricing transition does NOT fire pricing_power", () => {
  it("retail sales decline without pricing-transition signals does NOT fire pricing_power", () => {
    const evidence = [
      ev(
        "market_position",
        "Retail sales declined 8% in the most recent quarter driven by reduced foot traffic in suburban store locations",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("P4-B guard: coupon mention alone without customer risk does NOT fire pricing_power", () => {
  it("'Introduced a new digital coupon program' without customer-risk pairing does NOT fire", () => {
    const evidence = [
      ev(
        "market_position",
        "The company introduced a new digital coupon program through its loyalty app to drive repeat purchases",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});

describe("P4-B guard: pricing model change in wrong dimension does NOT fire", () => {
  it("coupon + behavior change in financial_health dimension does NOT fire pricing_power", () => {
    const evidence = [
      ev(
        "financial_health",
        "Elimination of coupons and promotional pricing requires significant customer behavior change across the customer base",
      ),
    ];
    expect(primary(evidence)).not.toBe(DiagnosisType.PRICING_POWER_FAILURE);
  });
});
