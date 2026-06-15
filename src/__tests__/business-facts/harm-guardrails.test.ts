/**
 * B10 — Harm Guardrails: pure-function tests.
 *
 * Proves risk assessment prevents harmful recommendations:
 *   - bad ROAS business is not told to scale ads without unit economics
 *   - cash crisis business is not told to hire or expand first
 *   - high customer concentration risk is surfaced
 *   - risky recommendation includes mitigation and verification metric
 *
 * Non-DB: pure risk assessment over business facts + recommendation.
 * Runs under `npm test`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  assessCashImpact,
  assessMarginImpact,
  assessLegalComplianceRisk,
  assessExecutionCapacityRisk,
  assessReversibilityRisk,
  assessTimeToResultRisk,
  assessDownsideRisk,
  assessDependencyRisk,
  assessHarmGuardrails,
  type BusinessFactsContract,
  type HarmRisk,
} from "@/domain/business-facts/harm-guardrails";
import { businessFactsContractSchema } from "@/domain/business-facts/contract";

const examples = JSON.parse(
  readFileSync(resolve(__dirname, "../../../contracts/business-facts.examples.json"), "utf8"),
) as Record<string, unknown>;

function asContract(raw: unknown): BusinessFactsContract {
  return businessFactsContractSchema.parse(raw);
}

function createTestContract(): BusinessFactsContract {
  return asContract(examples.service_business);
}

describe("B10 harm guardrails — cash impact assessment", () => {
  it("identifies critical cash impact when outflow exceeds available cash", () => {
    const contract = createTestContract();
    const risk = assessCashImpact("rec_test", contract, 50000, null, null);

    expect(risk.severity).toBe("critical");
    expect(risk.exceeds_available_cash).toBe(true);
  });

  it("identifies high severity for burn exceeding 50% of monthly available", () => {
    const contract = createTestContract();
    const risk = assessCashImpact("rec_test", contract, 25000, null, null); // 62.5% of 40k available (exceeds 50%)

    expect(risk.severity).toBe("high");
  });

  it("identifies breakeven timeline risk", () => {
    const contract = createTestContract();
    const risk = assessCashImpact("rec_test", contract, 5000, 100000, 20); // 20 months to break even

    expect(risk.months_to_breakeven).toBe(20);
    expect(risk.severity).toBe("critical"); // Would exceed typical 6-12 month runway
  });
});

describe("B10 harm guardrails — margin impact assessment", () => {
  it("identifies critical risk when margin falls below 25%", () => {
    const risk = assessMarginImpact("rec_test", 30, -10); // 30% → 20%

    expect(risk.resulting_margin_pct).toBe(20);
    expect(risk.below_critical_threshold).toBe(true);
    expect(risk.severity).toBe("critical");
  });

  it("identifies high risk for margin below 35%", () => {
    const risk = assessMarginImpact("rec_test", 40, -8); // 40% → 32%

    expect(risk.resulting_margin_pct).toBe(32);
    expect(risk.severity).toBe("high");
  });

  it("handles missing margin data gracefully", () => {
    const risk = assessMarginImpact("rec_test", null, null);

    expect(risk.severity).toBe("medium");
    expect(risk.notes.some((n) => n.includes("No current"))).toBe(true);
  });
});

describe("B10 harm guardrails — legal/compliance assessment", () => {
  it("identifies critical risk for non-compliance", () => {
    const risk = assessLegalComplianceRisk(
      "rec_test",
      ["GST_COMPLIANCE", "LABOR_LAW"],
      "non_compliant",
      null,
    );

    expect(risk.severity).toBe("critical");
    expect(risk.remediation_required).toBe(true);
  });

  it("identifies urgent timeline when non-compliance imminent", () => {
    const risk = assessLegalComplianceRisk(
      "rec_test",
      ["TAX_FILING"],
      "at_risk",
      15, // 15 days until non-compliance
    );

    expect(risk.severity).toBe("critical");
    expect(risk.timeline_to_non_compliance_days).toBe(15);
  });

  it("handles compliant status as low risk", () => {
    const risk = assessLegalComplianceRisk(
      "rec_test",
      ["SOME_REGULATION"],
      "compliant",
      null,
    );

    expect(risk.severity).toBe("low");
  });
});

describe("B10 harm guardrails — execution capacity assessment", () => {
  it("identifies critical risk when capacity exceeds 100%", () => {
    const risk = assessExecutionCapacityRisk("rec_test", 120, 95); // Owner at 120%, team at 95%

    expect(risk.exceeds_capacity).toBe(true);
    expect(risk.severity).toBe("critical");
  });

  it("identifies high risk when capacity above 80%", () => {
    const risk = assessExecutionCapacityRisk("rec_test", 85, 75);

    expect(risk.severity).toBe("high");
  });

  it("handles missing capacity data", () => {
    const risk = assessExecutionCapacityRisk("rec_test", null, null);

    expect(risk.severity).toBe("low");
  });
});

describe("B10 harm guardrails — reversibility assessment", () => {
  it("identifies irreversible actions as critical risk", () => {
    const risk = assessReversibilityRisk(
      "rec_test",
      "irreversible",
      50000,
      90, // 90 days to unwind if possible
    );

    expect(risk.reversibility_level).toBe("irreversible");
    expect(risk.severity).toBe("critical");
  });

  it("identifies partial reversibility with costs", () => {
    const risk = assessReversibilityRisk(
      "rec_test",
      "partially_reversible",
      25000,
      30,
    );

    expect(risk.severity).toBe("medium");
    expect(risk.unwind_cost).toBe(25000);
  });

  it("identifies reversible actions as low risk", () => {
    const risk = assessReversibilityRisk("rec_test", "fully_reversible", 0, 7);

    expect(risk.severity).toBe("low");
  });
});

describe("B10 harm guardrails — time to result assessment", () => {
  it("identifies critical risk when results exceed cash runway", () => {
    const risk = assessTimeToResultRisk(
      "rec_test",
      120, // 120 days expected
      90, // 90 days to meaningful result
      2, // 2 months cash runway = 60 days
    );

    expect(risk.cash_runway_insufficient).toBe(true);
    expect(risk.severity).toBe("critical");
  });

  it("identifies long timeline as execution risk", () => {
    const risk = assessTimeToResultRisk(
      "rec_test",
      270, // 9 months
      240,
      12,
    );

    expect(risk.severity).toMatch(/medium|high/);
  });
});

describe("B10 harm guardrails — downside risk assessment", () => {
  it("identifies high downside probability as significant risk", () => {
    const risk = assessDownsideRisk(
      "rec_test",
      "Market downturn reduces demand significantly",
      0.6, // 60% probability
      "Revenue falls 30-50%",
      30000, // Under 50k threshold
    );

    expect(risk.probability_of_downside).toBe(0.6);
    expect(risk.severity).toBe("high");
  });

  it("identifies large quantified loss as critical", () => {
    const risk = assessDownsideRisk(
      "rec_test",
      "Failed expansion into new market",
      0.3,
      "Total loss of expansion investment",
      200000,
    );

    expect(risk.quantified_max_loss).toBe(200000);
    expect(risk.severity).toBe("critical");
  });
});

describe("B10 harm guardrails — dependency risk assessment", () => {
  it("identifies single points of failure as high risk", () => {
    const risk = assessDependencyRisk(
      "rec_test",
      ["key_supplier", "sales_manager", "payment_processor"],
      ["supplier_relationship", "employee_retention"],
      false, // No mitigation
    );

    expect(risk.severity).toBe("critical");
    expect(risk.single_point_of_failure_risks).toContain("supplier_relationship");
  });

  it("identifies many dependencies without mitigation as high risk", () => {
    const risk = assessDependencyRisk(
      "rec_test",
      ["dep_1", "dep_2", "dep_3", "dep_4", "dep_5", "dep_6"],
      [],
      false,
    );

    expect(risk.severity).toBe("high");
  });

  it("reduces severity when mitigation is available", () => {
    const risk = assessDependencyRisk(
      "rec_test",
      ["key_supplier"],
      ["supplier_relationship"],
      true, // Mitigation available
    );

    expect(risk.severity).not.toBe("critical");
  });
});

describe("B10 harm guardrails — acceptance gates", () => {
  it("gate 1: bad ROAS business is not told to scale ads without unit economics", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessMarginImpact("rec_scale_ads", 30, -10), // Margin falls from 30% to 20% (CRITICAL)
      assessCashImpact("rec_scale_ads", contract, 20000, 100000, 8), // Long breakeven
      assessDownsideRisk(
        "rec_scale_ads",
        "Ad spend fails to convert to revenue",
        0.5, // 50% probability
        "Total loss of ad spend budget",
        100000,
      ),
    ];

    const assessment = assessHarmGuardrails("rec_scale_ads", contract, risks, null, null);

    expect(assessment.can_be_primary).toBe(false);
    expect(assessment.critical_risks.length).toBeGreaterThan(0);
  });

  it("gate 2: cash crisis business is not told to hire or expand first", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessCashImpact("rec_hire", contract, 25000, null, null), // High monthly burn
      assessTimeToResultRisk("rec_hire", 120, 180, 2), // Results in 6 months but only 2 months cash (CRITICAL)
      assessReversibilityRisk("rec_hire", "partially_reversible", 30000, 60), // Severance costs
    ];

    const assessment = assessHarmGuardrails("rec_hire", contract, risks, null, null);

    expect(assessment.can_be_primary).toBe(false);
    expect(assessment.critical_risks.some((r) => r.category === "time_to_result")).toBe(true);
  });

  it("gate 3: high customer concentration risk is surfaced", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessDependencyRisk(
        "rec_expand",
        ["top_customer_account", "customer_renewal_cycle"],
        ["top_customer_loss_would_eliminate_40_percent_revenue"], // Single point of failure
        false, // No mitigation
      ),
    ];

    const assessment = assessHarmGuardrails("rec_expand", contract, risks, null, null);

    expect(assessment.critical_risks.some((r) => r.category === "dependency_risk")).toBe(true);
  });

  it("gate 4: risky recommendation includes mitigation and verification metric", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessMarginImpact("rec_price_cut", 35, -8), // Margin falls from 35% to 27% (HIGH)
      assessDownsideRisk(
        "rec_price_cut",
        "Competitors match price, volume doesn't compensate",
        0.6, // 60% probability
        "Net revenue decline",
        75000,
      ),
    ];

    const mitigationPlan = "Customer value communication campaign + feature differentiation";
    const verificationMetrics = [
      "Customer retention rate",
      "Unit gross margin maintenance",
      "Competitive response tracking",
    ];

    const assessment = assessHarmGuardrails("rec_price_cut", contract, risks, mitigationPlan, verificationMetrics);

    expect(assessment.high_risks.length).toBeGreaterThan(0);
    expect(assessment.verification_metrics_required.length).toBeGreaterThan(0);
    expect(assessment.mitigation_required.some((m) => m.includes("margin") || m.includes("downside"))).toBe(true);
  });
});

describe("B10 harm guardrails — safe recommendations", () => {
  it("passes safe low-risk recommendations", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessCashImpact("rec_organic_growth", contract, 0, null, null), // No cash burn
      assessMarginImpact("rec_organic_growth", 40, 0), // No margin impact
      assessTimeToResultRisk("rec_organic_growth", 60, 45, 12), // Results before cash runs out
      assessReversibilityRisk("rec_organic_growth", "fully_reversible", 0, 7),
    ];

    const assessment = assessHarmGuardrails("rec_organic_growth", contract, risks, null, null);

    expect(assessment.can_be_primary).toBe(true);
    expect(assessment.critical_risks).toHaveLength(0);
    expect(assessment.high_risks.length).toBeLessThanOrEqual(1);
  });
});

describe("B10 harm guardrails — full assessment summary", () => {
  it("generates risk summary with count of severity levels", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessMarginImpact("rec_test", 30, -10), // Critical
      assessExecutionCapacityRisk("rec_test", 85, 70), // High
      assessTimeToResultRisk("rec_test", 90, 60, 6), // Low/Medium
    ];

    const assessment = assessHarmGuardrails("rec_test", contract, risks, null, null);

    expect(assessment.risk_summary).toContain("critical");
    expect(assessment.risk_summary).toContain("high");
    expect(assessment.critical_risks.length).toBeGreaterThan(0);
  });

  it("requires verification metrics for high-risk categories", () => {
    const contract = createTestContract();
    const risks: HarmRisk[] = [
      assessMarginImpact("rec_test", 30, -8), // High margin risk (30% -> 22%, below threshold)
      assessCashImpact("rec_test", contract, 25000, null, null), // High cash risk (25k is 62.5% of 40k available)
    ];

    const assessment = assessHarmGuardrails("rec_test", contract, risks, null, null);

    expect(assessment.verification_metrics_required.some((m) => m.includes("margin"))).toBe(true);
    expect(assessment.verification_metrics_required.some((m) => m.includes("cash"))).toBe(true);
  });
});
