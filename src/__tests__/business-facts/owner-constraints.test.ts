/**
 * B08 — Owner Constraints Engine: pure-function tests.
 *
 * Proves constraint violation detection and recommendation blocking:
 *   - budget violations block paid-ads recommendations
 *   - time constraints are surfaced
 *   - staff constraints block hiring recommendations
 *   - cash crisis blocks high-burn recommendations
 *   - channel conflicts block incompatible actions
 *   - no-budget owner does not receive paid-ad-first plan
 *   - low-time owner receives low-time action plan
 *   - cash crisis owner does not receive high-cash-burn plan
 *
 * Non-DB: pure constraint checking over recommendation + constraints.
 * Runs under `npm test`.
 */
import { describe, it, expect } from "vitest";
import {
  checkRecommendationAgainstConstraints,
  checkMultipleRecommendations,
  summarizeConstraints,
  type OwnerConstraints,
  type RecommendationForConstraintCheck,
} from "@/domain/business-facts/owner-constraints";

function createConstraints(overrides: Partial<OwnerConstraints> = {}): OwnerConstraints {
  return {
    marketing_budget_monthly: 10000,
    operational_budget_available: 50000,
    owner_available_hours_per_week: 20,
    total_staff_count: 5,
    can_hire: true,
    max_new_hires: 2,
    service_area_km_radius: 50,
    payment_processor_live: true,
    invoicing_capability: true,
    gst_compliance_status: "compliant",
    crm_system_live: true,
    accounting_system_live: true,
    marketing_analytics_live: true,
    risk_appetite: 6,
    business_stage: "growth",
    primary_goal: "growth",
    channel_focus: ["ecommerce", "direct_sales"],
    execution_capacity: 7,
    months_of_cash_runway: 12,
    ...overrides,
  };
}

function createRecommendation(overrides: Partial<RecommendationForConstraintCheck> = {}): RecommendationForConstraintCheck {
  return {
    id: "rec_test_1",
    domain: "sales",
    action: "scale_sales_team",
    cash_requirement_monthly: 5000,
    time_requirement_hours: 10,
    staff_requirement: 2,
    reversibility: "reversible",
    priority_level: "medium",
    ...overrides,
  };
}

describe("B08 owner constraints — detection and blocking", () => {
  it("returns no violations for compliant recommendation", () => {
    const constraints = createConstraints();
    const recommendation = createRecommendation({
      cash_requirement_monthly: 5000, // Less than $10k budget
      time_requirement_hours: 10, // Less than 20h/week
      staff_requirement: 2, // Less than 5 total staff
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    expect(result.violations).toHaveLength(0);
    expect(result.can_be_primary).toBe(true);
    expect(result.constraint_compliant).toBe(true);
  });

  it("detects budget violation for paid-ad recommendation", () => {
    const constraints = createConstraints({ marketing_budget_monthly: 5000 });
    const recommendation = createRecommendation({
      id: "rec_paid_ads",
      action: "scale_paid_ads",
      cash_requirement_monthly: 10000, // Exceeds $5k budget
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    expect(result.violations.length).toBeGreaterThan(0);

    const budget_violation = result.violations.find((v) => v.category === "budget");
    expect(budget_violation).toBeTruthy();
    expect(budget_violation?.severity).toBe("blocking");
    expect(result.can_be_primary).toBe(false);
  });

  it("detects time constraint violation", () => {
    const constraints = createConstraints({ owner_available_hours_per_week: 5 });
    const recommendation = createRecommendation({
      time_requirement_hours: 20, // Exceeds 5h/week
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const time_violation = result.violations.find((v) => v.category === "time");
    expect(time_violation).toBeTruthy();
    expect(time_violation?.severity).toBe("advisory");
  });

  it("detects staff constraint violation when hiring disabled", () => {
    const constraints = createConstraints({
      total_staff_count: 3,
      can_hire: false, // Cannot hire
    });
    const recommendation = createRecommendation({
      staff_requirement: 5, // Needs 5, only has 3
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const staff_violation = result.violations.find((v) => v.category === "staff");
    expect(staff_violation).toBeTruthy();
    expect(staff_violation?.severity).toBe("blocking");
    expect(result.can_be_primary).toBe(false);
  });

  it("detects when new hires exceed max allowed", () => {
    const constraints = createConstraints({
      total_staff_count: 5,
      can_hire: true,
      max_new_hires: 1, // Only 1 hire allowed
    });
    const recommendation = createRecommendation({
      staff_requirement: 8, // Needs 3 new hires, max is 1
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const staff_violation = result.violations.find((v) => v.category === "staff");
    expect(staff_violation).toBeTruthy();
    expect(staff_violation?.severity).toBe("blocking");
  });

  it("detects cash crisis blocking high-burn recommendations", () => {
    const constraints = createConstraints({
      months_of_cash_runway: 2, // Less than 3 months = crisis
    });
    const recommendation = createRecommendation({
      cash_requirement_monthly: 5000, // Any burn not allowed
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const cash_violation = result.violations.find((v) => v.category === "cash_runway");
    expect(cash_violation).toBeTruthy();
    expect(cash_violation?.severity).toBe("blocking");
    expect(result.can_be_primary).toBe(false);
  });

  it("allows zero-burn recommendations in cash crisis", () => {
    const constraints = createConstraints({
      months_of_cash_runway: 2,
    });
    const recommendation = createRecommendation({
      action: "optimize_operations",
      cash_requirement_monthly: null, // No burn
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    expect(result.violations.filter((v) => v.category === "cash_runway")).toHaveLength(0);
  });

  it("detects channel conflict blocking incompatible actions", () => {
    const constraints = createConstraints({
      channel_focus: ["direct_sales", "retail"],
      channels_to_avoid: ["marketplace", "paid_ads"],
    });
    const recommendation = createRecommendation({
      action: "scale_marketplace_listings",
      channels_required: ["marketplace", "paid_ads"],
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const channel_violation = result.violations.find((v) => v.category === "channel_limits");
    expect(channel_violation).toBeTruthy();
    expect(channel_violation?.severity).toBe("blocking");
  });

  it("detects missing payment processor for payment-dependent actions", () => {
    const constraints = createConstraints({
      payment_processor_live: false,
    });
    const recommendation = createRecommendation({
      legal_requirements: ["payment_processor"],
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const payment_violation = result.violations.find((v) => v.category === "legal_payment");
    expect(payment_violation).toBeTruthy();
    expect(payment_violation?.severity).toBe("blocking");
  });
});

describe("B08 owner constraints — acceptance gates", () => {
  it("gate 1: no-budget owner does not receive paid-ad-first plan", () => {
    const constraints = createConstraints({ marketing_budget_monthly: 0 });
    const paidAdsRec = createRecommendation({
      id: "rec_paid_ads_first",
      action: "scale_paid_ads",
      priority_level: "high",
      cash_requirement_monthly: 5000,
    });

    const result = checkRecommendationAgainstConstraints(paidAdsRec, constraints);
    expect(result.can_be_primary).toBe(false);
    expect(result.violations.some((v) => v.category === "budget" && v.severity === "blocking")).toBe(true);
  });

  it("gate 2: low-time owner receives low-time action plan recommendation", () => {
    const constraints = createConstraints({ owner_available_hours_per_week: 3 });
    const highTimeRec = createRecommendation({
      action: "comprehensive_process_redesign",
      time_requirement_hours: 15, // Exceeds capacity
    });
    const lowTimeRec = createRecommendation({
      id: "rec_low_time",
      action: "setup_automation_template",
      time_requirement_hours: 1, // Fits capacity
    });

    const highTimeResult = checkRecommendationAgainstConstraints(highTimeRec, constraints);
    const lowTimeResult = checkRecommendationAgainstConstraints(lowTimeRec, constraints);

    // High-time action should show time violation (advisory)
    expect(highTimeResult.violations.some((v) => v.category === "time")).toBe(true);

    // Low-time action should pass
    expect(lowTimeResult.violations.filter((v) => v.category === "time")).toHaveLength(0);
  });

  it("gate 3: cash crisis owner does not receive high-cash-burn plan", () => {
    const constraints = createConstraints({ months_of_cash_runway: 1 }); // Critical crisis
    const highBurnRec = createRecommendation({
      id: "rec_high_burn",
      action: "aggressive_marketing_expansion",
      cash_requirement_monthly: 25000,
    });

    const result = checkRecommendationAgainstConstraints(highBurnRec, constraints);
    expect(result.can_be_primary).toBe(false);
    expect(result.violations.some((v) => v.category === "cash_runway" && v.severity === "blocking")).toBe(true);
  });
});

describe("B08 owner constraints — batch checking", () => {
  it("checks multiple recommendations and identifies most constrained areas", () => {
    const constraints = createConstraints({
      marketing_budget_monthly: 3000,
      months_of_cash_runway: 2,
    });

    const recommendations: RecommendationForConstraintCheck[] = [
      createRecommendation({
        id: "rec_1",
        action: "scale_paid_ads",
        cash_requirement_monthly: 10000, // Budget violation
      }),
      createRecommendation({
        id: "rec_2",
        action: "expansion_marketing",
        cash_requirement_monthly: 5000, // Cash runway violation (crisis)
      }),
      createRecommendation({
        id: "rec_3",
        action: "hire_sales_manager",
        staff_requirement: 1,
        cash_requirement_monthly: 0,
      }),
    ];

    const result = checkMultipleRecommendations(recommendations, constraints);
    expect(result.any_blocking_violations).toBe(true);
    expect(result.most_constrained_categories.length).toBeGreaterThan(0);
    expect(result.results).toHaveLength(3);
  });

  it("identifies recommendations that can be primary vs those that cannot", () => {
    const constraints = createConstraints({
      marketing_budget_monthly: 2000,
      months_of_cash_runway: 1,
    });

    const recommendations: RecommendationForConstraintCheck[] = [
      createRecommendation({
        id: "rec_feasible",
        action: "organic_growth",
        cash_requirement_monthly: null, // No burn
      }),
      createRecommendation({
        id: "rec_blocked",
        action: "paid_ads_blitz",
        cash_requirement_monthly: 5000, // Violates both constraints
      }),
    ];

    const result = checkMultipleRecommendations(recommendations, constraints);
    const feasible = result.results.find((r) => r.recommendation_id === "rec_feasible");
    const blocked = result.results.find((r) => r.recommendation_id === "rec_blocked");

    expect(feasible?.can_be_primary).toBe(true);
    expect(blocked?.can_be_primary).toBe(false);
  });
});

describe("B08 owner constraints — constraint summary", () => {
  it("generates human-readable constraint summary", () => {
    const constraints = createConstraints({
      marketing_budget_monthly: 5000,
      months_of_cash_runway: 6,
      owner_available_hours_per_week: 10,
      business_stage: "growth",
      primary_goal: "profitability",
      risk_appetite: 4,
    });

    const summary = summarizeConstraints(constraints);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.some((s) => s.includes("Marketing budget"))).toBe(true);
    expect(summary.some((s) => s.includes("Cash runway"))).toBe(true);
    expect(summary.some((s) => s.includes("Owner availability"))).toBe(true);
  });

  it("handles missing or null constraints gracefully", () => {
    const sparse_constraints: OwnerConstraints = {
      marketing_budget_monthly: 5000,
      // All other constraints are undefined/null
    };

    const summary = summarizeConstraints(sparse_constraints);
    expect(summary).toContain("Marketing budget: $5000/month");
    expect(summary.length).toBe(1); // Only the one constraint
  });
});

describe("B08 owner constraints — advisory vs blocking severity", () => {
  it("marks budget/cash/staff violations as blocking", () => {
    const constraints = createConstraints({
      marketing_budget_monthly: 1000,
      months_of_cash_runway: 1,
      can_hire: false,
    });

    const recommendations: RecommendationForConstraintCheck[] = [
      createRecommendation({
        id: "budget_rec",
        cash_requirement_monthly: 5000,
      }),
      createRecommendation({
        id: "cash_rec",
        cash_requirement_monthly: 2000,
      }),
      createRecommendation({
        id: "staff_rec",
        staff_requirement: 10,
      }),
    ];

    const results = checkMultipleRecommendations(recommendations, constraints);

    for (const result of results.results) {
      const violations = result.violations.filter((v) => ["budget", "cash_runway", "staff"].includes(v.category));
      for (const violation of violations) {
        expect(violation.severity).toBe("blocking");
      }
    }
  });

  it("marks time/risk/execution warnings as advisory", () => {
    const constraints = createConstraints({
      owner_available_hours_per_week: 2,
      risk_appetite: 2,
      execution_capacity: 1,
    });

    const recommendation = createRecommendation({
      action: "experimental_channel_test",
      time_requirement_hours: 10,
      priority_level: "critical",
    });

    const result = checkRecommendationAgainstConstraints(recommendation, constraints);
    const time_violation = result.violations.find((v) => v.category === "time");
    expect(time_violation?.severity).toBe("advisory");
  });
});

describe("B08 owner constraints — full workflow acceptance gates", () => {
  it("gate 1-3 combined: growth business with good constraints receives growth plan", () => {
    const healthy_constraints = createConstraints({
      marketing_budget_monthly: 15000,
      months_of_cash_runway: 12,
      owner_available_hours_per_week: 30,
      business_stage: "growth",
      primary_goal: "growth",
    });

    const growth_recommendations: RecommendationForConstraintCheck[] = [
      createRecommendation({
        id: "paid_ads",
        action: "scale_paid_ads",
        cash_requirement_monthly: 10000,
      }),
      createRecommendation({
        id: "sales_team",
        action: "hire_sales_managers",
        staff_requirement: 2,
      }),
    ];

    const results = checkMultipleRecommendations(growth_recommendations, healthy_constraints);
    const can_execute = results.results.every((r) => r.can_be_primary);
    expect(can_execute).toBe(true);
  });

  it("gate 1-3 combined: crisis business with no budget receives survival plan", () => {
    const crisis_constraints = createConstraints({
      marketing_budget_monthly: 0,
      months_of_cash_runway: 1,
      owner_available_hours_per_week: 80, // Full time crisis mode
      business_stage: "bootstrap",
      primary_goal: "survival",
    });

    const expansion_recommendations: RecommendationForConstraintCheck[] = [
      createRecommendation({
        id: "paid_ads",
        action: "scale_paid_ads",
        cash_requirement_monthly: 5000,
      }),
      createRecommendation({
        id: "organic_growth",
        action: "organic_seo_buildup",
        cash_requirement_monthly: null,
      }),
    ];

    const results = checkMultipleRecommendations(expansion_recommendations, crisis_constraints);
    const expansion_plan = results.results.find((r) => r.recommendation_id === "paid_ads");
    const survival_plan = results.results.find((r) => r.recommendation_id === "organic_growth");

    expect(expansion_plan?.can_be_primary).toBe(false);
    expect(survival_plan?.can_be_primary).toBe(true);
  });
});
