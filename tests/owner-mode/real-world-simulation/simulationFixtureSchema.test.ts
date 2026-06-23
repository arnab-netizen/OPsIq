import { describe, it, expect } from "vitest";
import {
  validateSimulationFixture,
  parseAndValidateSimulationFixtures,
} from "./simulationFixtureSchema";

// ── Minimal valid fixture factory ────────────────────────────────────────────

function minimalValidFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    case_id: "SIM-01-001",
    title: "Bakery Running Out of Cash Every Month",
    category: "SC-01",
    test_type: "TT-1",
    segment: "Food retail, single location, 4 employees, $520K revenue",
    business_context:
      "A neighbourhood bakery has been open for three years and is profitable on paper " +
      "but the owner cannot pay himself or cover supplier invoices in the last week of each month.",
    source_basis: ["Composite of food retail cash flow patterns from consulting practice"],
    input_packet: {
      business_description:
        "The owner runs a four-person bakery. Revenue is steady and the profit-and-loss " +
        "looks positive, but the bank account goes nearly empty every month.",
      facts_known_to_owner: {
        annual_revenue: 520000,
        gross_margin_pct: 42,
        bank_balance_low_point: 3000,
      },
      symptoms: [
        "Bank account nearly empty in the last week of every month",
        "Owner cannot draw a salary without risking supplier payments",
        "Revenue feels fine but there is never enough money",
      ],
      misleading_signals: [
        "The gross margin of 42% looks healthy for a bakery",
        "Revenue has grown 15% this year — owner believes growth is the solution",
      ],
      missing_inputs_opsiq_should_request: [
        "Weekly cash flow statement showing inflows and outflows by day",
        "Supplier payment terms and whether early payment discounts are taken",
        "Payroll schedule relative to peak revenue days",
      ],
    },
    sealed_expected_output: {
      primary_root_cause: "cash_timing_mismatch",
      secondary_causes: ["supplier_payment_front_loading", "no_cash_reserve_buffer"],
      expected_first_action:
        "Map every cash inflow and outflow by day of the week for the last four weeks " +
        "to identify the exact timing of the shortfall before taking any other action.",
      bad_recommendations_to_flag: [
        "grow revenue to solve the cash problem",
        "take on a line of credit",
        "hire more staff",
        "increase marketing spend",
      ],
      scoring_rubric: {
        must_identify: [
          "cash timing",
          "payment cycle",
          "working capital",
          "cash flow gap",
        ],
        must_not_claim: [
          "revenue growth will fix the cash problem",
          "the margin is too low",
        ],
        ideal_depth: [
          "identifies specific day-of-week cash trough relative to payroll",
          "notes that supplier terms may be negotiable to reduce front-loading",
        ],
      },
    },
    leakage_controls: {
      author_read_benchmark_fixtures: false,
      author_read_composer_source: false,
      leakage_check_passed: false, // validator sets this; raw value irrelevant
    },
    holdout_meta: {
      author_id: "author-A",
      construction_date: "2026-06-22",
      industry: "Food retail",
      intervention_mode: "diagnostic",
      business_condition_hypothesis: "CASH_STRESS",
      consulting_lifecycle_stage: "diagnosis",
    },
    ...overrides,
  };
}

// ── Valid minimal fixture ─────────────────────────────────────────────────────

describe("validateSimulationFixture: valid minimal fixture", () => {
  it("accepts a valid minimal fixture", () => {
    const result = validateSimulationFixture(minimalValidFixture(), 0);
    expect(result.case_id).toBe("SIM-01-001");
    expect(result.category).toBe("SC-01");
    expect(result.test_type).toBe("TT-1");
    expect(result.leakage_controls.leakage_check_passed).toBe(true);
  });

  it("preserves all required top-level fields", () => {
    const result = validateSimulationFixture(minimalValidFixture(), 0);
    expect(result.title).toBeTruthy();
    expect(result.segment).toBeTruthy();
    expect(result.business_context).toBeTruthy();
    expect(result.source_basis).toHaveLength(1);
  });

  it("sets leakage_check_passed to true after validation", () => {
    const result = validateSimulationFixture(minimalValidFixture(), 0);
    expect(result.leakage_controls.leakage_check_passed).toBe(true);
    expect(result.leakage_controls.author_read_benchmark_fixtures).toBe(false);
    expect(result.leakage_controls.author_read_composer_source).toBe(false);
  });
});

// ── Invalid case_id ──────────────────────────────────────────────────────────

describe("validateSimulationFixture: case_id validation", () => {
  it("rejects case_id that does not match SIM-{nn}-{nnn}", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ case_id: "SMB-001" }), 0)
    ).toThrow(/does not match required pattern/);
  });

  it("rejects case_id with wrong separator", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ case_id: "SIM01001" }), 0)
    ).toThrow(/does not match required pattern/);
  });

  it("rejects blank case_id", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ case_id: "" }), 0)
    ).toThrow(/must be a non-blank string/);
  });

  it("accepts valid SIM-12-038", () => {
    const f = validateSimulationFixture(minimalValidFixture({ case_id: "SIM-12-038" }), 0);
    expect(f.case_id).toBe("SIM-12-038");
  });
});

// ── Invalid category ─────────────────────────────────────────────────────────

describe("validateSimulationFixture: category validation", () => {
  it("rejects unknown category SC-99", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ category: "SC-99" }), 0)
    ).toThrow(/not a valid category/);
  });

  it("rejects blank category", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ category: "" }), 0)
    ).toThrow(/must be a non-blank string/);
  });

  it("accepts all 12 valid categories", () => {
    for (let i = 1; i <= 12; i++) {
      const cat = `SC-${String(i).padStart(2, "0")}`;
      const f = validateSimulationFixture(
        minimalValidFixture({ category: cat, case_id: `SIM-${String(i).padStart(2, "0")}-001` }),
        0
      );
      expect(f.category).toBe(cat);
    }
  });
});

// ── Invalid test_type ─────────────────────────────────────────────────────────

describe("validateSimulationFixture: test_type validation", () => {
  it("rejects unknown test type TT-9", () => {
    expect(() =>
      validateSimulationFixture(minimalValidFixture({ test_type: "TT-9" }), 0)
    ).toThrow(/not a valid test type/);
  });

  it("accepts all 5 valid test types", () => {
    for (let i = 1; i <= 5; i++) {
      const f = validateSimulationFixture(
        minimalValidFixture({ test_type: `TT-${i}` }),
        0
      );
      expect(f.test_type).toBe(`TT-${i}`);
    }
  });
});

// ── Missing sealed_expected_output ───────────────────────────────────────────

describe("validateSimulationFixture: sealed_expected_output required", () => {
  it("rejects missing sealed_expected_output", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    delete raw["sealed_expected_output"];
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/sealed_expected_output/);
  });

  it("rejects sealed_expected_output with only 1 bad_recommendation (needs ≥4)", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    const seo = { ...(raw["sealed_expected_output"] as Record<string, unknown>) };
    seo["bad_recommendations_to_flag"] = ["just one"];
    raw["sealed_expected_output"] = seo;
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/must have 4–6 items/);
  });
});

// ── Missing leakage_controls ─────────────────────────────────────────────────

describe("validateSimulationFixture: leakage_controls required", () => {
  it("rejects missing leakage_controls", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    delete raw["leakage_controls"];
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/leakage_controls/);
  });

  it("rejects leakage_controls.author_read_benchmark_fixtures = true", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    raw["leakage_controls"] = {
      author_read_benchmark_fixtures: true,
      author_read_composer_source: false,
      leakage_check_passed: false,
    };
    expect(() => validateSimulationFixture(raw, 0)).toThrow(
      /author_read_benchmark_fixtures must be false/
    );
  });

  it("rejects leakage_controls.author_read_composer_source = true", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    raw["leakage_controls"] = {
      author_read_benchmark_fixtures: false,
      author_read_composer_source: true,
      leakage_check_passed: false,
    };
    expect(() => validateSimulationFixture(raw, 0)).toThrow(
      /author_read_composer_source must be false/
    );
  });
});

// ── Missing holdout_meta ─────────────────────────────────────────────────────

describe("validateSimulationFixture: holdout_meta required", () => {
  it("rejects missing holdout_meta", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    delete raw["holdout_meta"];
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/holdout_meta/);
  });

  it("rejects invalid intervention_mode", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    raw["holdout_meta"] = {
      author_id: "author-A",
      construction_date: "2026-06-22",
      industry: "Food retail",
      intervention_mode: "hacking",
      business_condition_hypothesis: "CASH_STRESS",
      consulting_lifecycle_stage: "diagnosis",
    };
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/intervention_mode/);
  });
});

// ── Input leakage detection ──────────────────────────────────────────────────

describe("validateSimulationFixture: leakage detection", () => {
  it("rejects fixture where must_identify phrase appears in symptoms", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    const ip = { ...(raw["input_packet"] as Record<string, unknown>) };
    ip["symptoms"] = [
      "We have a cash timing problem every month",   // "cash timing" is in must_identify
      "Owner cannot draw a salary",
      "Revenue feels fine but there is never enough money",
    ];
    raw["input_packet"] = ip;
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/Leakage detected/);
  });

  it("rejects fixture where bad_recommendation appears in business_description", () => {
    const raw = minimalValidFixture() as Record<string, unknown>;
    const ip = { ...(raw["input_packet"] as Record<string, unknown>) };
    ip["business_description"] =
      "The owner tried to grow revenue to solve the cash problem but it did not work.";
    raw["input_packet"] = ip;
    expect(() => validateSimulationFixture(raw, 0)).toThrow(/Leakage detected/);
  });

  it("accepts fixture with no leakage", () => {
    const result = validateSimulationFixture(minimalValidFixture(), 0);
    expect(result.leakage_controls.leakage_check_passed).toBe(true);
  });
});

// ── Duplicate case_id detection ───────────────────────────────────────────────

describe("parseAndValidateSimulationFixtures: duplicate case_id fails", () => {
  it("throws on duplicate case_id in JSONL", () => {
    const line = JSON.stringify(minimalValidFixture());
    const content = `${line}\n${line}\n`;
    expect(() => parseAndValidateSimulationFixtures(content)).toThrow(/Duplicate case_id/);
  });
});

// ── JSONL parsing ─────────────────────────────────────────────────────────────

describe("parseAndValidateSimulationFixtures: valid JSONL", () => {
  it("parses a single valid fixture", () => {
    const line = JSON.stringify(minimalValidFixture());
    const fixtures = parseAndValidateSimulationFixtures(`${line}\n`);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].case_id).toBe("SIM-01-001");
  });

  it("handles blank lines gracefully", () => {
    const line = JSON.stringify(minimalValidFixture());
    const fixtures = parseAndValidateSimulationFixtures(`\n${line}\n\n`);
    expect(fixtures).toHaveLength(1);
  });
});
