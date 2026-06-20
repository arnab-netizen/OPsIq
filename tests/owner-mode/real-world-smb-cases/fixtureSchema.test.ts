import { describe, it, expect } from "vitest";
import { parseAndValidateFixtures, validateFixture } from "./fixtureSchema";

// ── Helpers ──────────────────────────────────────────────────────────────────

function validFixtureObject(overrides: Record<string, unknown> = {}): unknown {
  return {
    case_id: "SMB-001",
    title: "Test Case",
    segment: "retail_smb",
    source_basis: ["source a"],
    scenario: {
      business: "A test business description",
      facts_known_to_owner: { revenue: 100000 },
      symptoms: ["symptom one"],
      misleading_signals: ["misleading signal one"],
      missing_inputs_opsiq_should_request: ["missing input one"],
    },
    expected_opsiq_diagnosis: {
      primary_root_cause: "cash_flow_problem",
      secondary_causes: ["secondary issue"],
      expected_first_action: "Run a cash flow analysis immediately.",
      bad_recommendations_to_flag: ["increase marketing"],
      scoring_criteria: {
        must_identify: ["cash flow"],
        must_not_claim: ["revenue is fine"],
        ideal_depth: ["identify the timing gap"],
      },
    },
    ...overrides,
  };
}

function validJsonlLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(validFixtureObject(overrides));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fixtureSchema: valid fixture passes", () => {
  it("accepts a fully valid fixture object", () => {
    const result = validateFixture(validFixtureObject(), 0);
    expect(result.case_id).toBe("SMB-001");
    expect(result.title).toBe("Test Case");
    expect(result.expected_opsiq_diagnosis.primary_root_cause).toBe("cash_flow_problem");
  });

  it("parses a valid single-line JSONL string", () => {
    const content = validJsonlLine();
    const fixtures = parseAndValidateFixtures(content);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].case_id).toBe("SMB-001");
  });
});

describe("fixtureSchema: duplicate case_id fails", () => {
  it("throws on duplicate case_id in JSONL", () => {
    const line = validJsonlLine({ case_id: "SMB-001" });
    const content = `${line}\n${line}`;
    expect(() => parseAndValidateFixtures(content)).toThrow(/Duplicate case_id.*SMB-001/);
  });
});

describe("fixtureSchema: missing primary_root_cause fails", () => {
  it("throws when primary_root_cause is missing", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    const dx = obj["expected_opsiq_diagnosis"] as Record<string, unknown>;
    const { primary_root_cause: _removed, ...rest } = dx;
    obj["expected_opsiq_diagnosis"] = rest;
    expect(() => validateFixture(obj, 0)).toThrow(/primary_root_cause/);
  });

  it("throws when primary_root_cause is blank string", () => {
    const obj = validFixtureObject();
    ((obj as Record<string, unknown>)["expected_opsiq_diagnosis"] as Record<string, unknown>)[
      "primary_root_cause"
    ] = "   ";
    expect(() => validateFixture(obj, 0)).toThrow(/primary_root_cause/);
  });
});

describe("fixtureSchema: blank title fails", () => {
  it("throws when title is empty string", () => {
    const obj = validFixtureObject({ title: "" });
    expect(() => validateFixture(obj, 0)).toThrow(/title/);
  });

  it("throws when title is whitespace only", () => {
    const obj = validFixtureObject({ title: "   " });
    expect(() => validateFixture(obj, 0)).toThrow(/title/);
  });
});

describe("fixtureSchema: empty must_identify fails", () => {
  it("throws when must_identify is an empty array", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    const dx = obj["expected_opsiq_diagnosis"] as Record<string, unknown>;
    const criteria = dx["scoring_criteria"] as Record<string, unknown>;
    criteria["must_identify"] = [];
    expect(() => validateFixture(obj, 0)).toThrow(/must_identify/);
  });
});

describe("fixtureSchema: invalid JSONL line fails", () => {
  it("throws when a JSONL line is not valid JSON", () => {
    const content = `${validJsonlLine()}\n{broken json`;
    expect(() => parseAndValidateFixtures(content)).toThrow(/Invalid JSON/);
  });
});

describe("fixtureSchema: wrong case_id format fails", () => {
  it("throws when case_id does not match /^SMB-\\d{3}$/", () => {
    expect(() => validateFixture(validFixtureObject({ case_id: "smb-001" }), 0)).toThrow(
      /SMB-\\d\{3\}/
    );
  });

  it("throws when case_id is CASE-001 instead of SMB-001", () => {
    expect(() => validateFixture(validFixtureObject({ case_id: "CASE-001" }), 0)).toThrow(
      /SMB-\\d\{3\}/
    );
  });

  it("throws when case_id is SMB-1 (too short)", () => {
    expect(() => validateFixture(validFixtureObject({ case_id: "SMB-1" }), 0)).toThrow(
      /SMB-\\d\{3\}/
    );
  });
});
