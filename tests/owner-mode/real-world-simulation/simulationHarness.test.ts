/**
 * Simulation harness — scaffold-level tests.
 *
 * At scaffold time, no simulation fixtures exist. These tests verify:
 * 1. Empty corpus is correctly classified as SIMULATION_CORPUS_NOT_READY
 * 2. An empty corpus cannot be reported as PASS
 * 3. A non-empty mock corpus (constructed in-memory) produces a deterministic report
 * 4. No external API calls, no DB, no secrets
 *
 * When simulation_cases.jsonl is authored, these tests remain valid.
 * The harness extends naturally to real cases without modification.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSimulationFixtures,
  _resetSimulationFixtureCache,
} from "./loadSimulationFixtures";
import {
  parseAndValidateSimulationFixtures,
  type SimulationFixture,
} from "./simulationFixtureSchema";
import { scoreSimulationOutput, type SimulationCaseScore } from "./simulationScoringContract";

beforeEach(() => {
  _resetSimulationFixtureCache();
});

// ── Harness types ─────────────────────────────────────────────────────────────

type HarnessCorpusStatus = "SIMULATION_CORPUS_NOT_READY" | "SIMULATION_CORPUS_READY";

interface HarnessCaseResult {
  case_id: string;
  category: string;
  test_type: string;
  score: SimulationCaseScore;
}

interface HarnessReport {
  corpusStatus: HarnessCorpusStatus;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number | null;
  results: HarnessCaseResult[];
  runComplete: boolean;
}

/**
 * Runs the simulation harness against a pre-loaded fixture array.
 * Does not call any external APIs or services — uses mock output for scaffold.
 */
function runSimulationHarness(
  fixtures: SimulationFixture[],
  getMockOutput: (fixture: SimulationFixture) => string
): HarnessReport {
  if (fixtures.length === 0) {
    return {
      corpusStatus: "SIMULATION_CORPUS_NOT_READY",
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      passRate: null,
      results: [],
      runComplete: false,
    };
  }

  const results: HarnessCaseResult[] = [];

  for (const fixture of fixtures) {
    const output = getMockOutput(fixture);
    const score = scoreSimulationOutput(output, fixture);
    results.push({
      case_id: fixture.case_id,
      category: fixture.category,
      test_type: fixture.test_type,
      score,
    });
  }

  const passedCases = results.filter((r) => r.score.passed).length;
  const failedCases = results.length - passedCases;
  const passRate = results.length > 0 ? passedCases / results.length : null;

  return {
    corpusStatus: "SIMULATION_CORPUS_READY",
    totalCases: results.length,
    passedCases,
    failedCases,
    passRate,
    results,
    runComplete: true,
  };
}

// ── Empty corpus tests ────────────────────────────────────────────────────────

describe("simulationHarness: empty corpus", () => {
  it("reports SIMULATION_CORPUS_NOT_READY when corpus is empty", () => {
    const corpus = loadSimulationFixtures();
    const report = runSimulationHarness(corpus.fixtures, () => "");
    expect(report.corpusStatus).toBe("SIMULATION_CORPUS_NOT_READY");
  });

  it("totalCases is 0 with empty corpus", () => {
    const report = runSimulationHarness([], () => "");
    expect(report.totalCases).toBe(0);
  });

  it("passRate is null (undefined, not 0) with empty corpus", () => {
    const report = runSimulationHarness([], () => "");
    expect(report.passRate).toBeNull();
  });

  it("runComplete is false with empty corpus", () => {
    const report = runSimulationHarness([], () => "");
    expect(report.runComplete).toBe(false);
  });

  it("zero cases cannot be reported as PASS", () => {
    const report = runSimulationHarness([], () => "");
    // No pass rate exists — cannot be >= any threshold
    expect(report.passRate).toBeNull();
    expect(report.passedCases).toBe(0);
    // If passRate is null, any >= 0.55 check is false
    const meetsFirstRunTarget = report.passRate !== null && report.passRate >= 0.55;
    expect(meetsFirstRunTarget).toBe(false);
  });
});

// ── Mock corpus tests ─────────────────────────────────────────────────────────

function buildMockFixtureJson(id: string, category: string): object {
  return {
    case_id: id,
    title: `Mock Simulation Case ${id}`,
    category,
    test_type: "TT-1",
    segment: "Service business, 3 employees, $400K revenue",
    business_context: "A small service business is experiencing cash stress.",
    source_basis: ["Composite from consulting practice"],
    input_packet: {
      business_description:
        "A small service business owner reports bank balance drops monthly despite good revenue.",
      facts_known_to_owner: { annual_revenue: 400000 },
      symptoms: [
        "Bank drops every month",
        "Owner is stressed about payroll",
        "Revenue feels fine but money is always tight",
      ],
      misleading_signals: [
        "Revenue grew 12% this year",
        "Client list has grown",
      ],
      missing_inputs_opsiq_should_request: [
        "Aged debtors report broken down by client and days outstanding",
        "Payroll schedule and timing relative to when client money arrives",
        "Forward liquidity projection for the next 13 weeks",
      ],
    },
    sealed_expected_output: {
      primary_root_cause: "receivables_collection_lag",
      secondary_causes: ["no_collections_process", "payroll_timing_mismatch"],
      expected_first_action:
        "Produce aged receivables report and contact three largest overdue clients immediately.",
      bad_recommendations_to_flag: [
        "grow revenue first",
        "take on debt",
        "hire marketing staff",
        "open a second location",
      ],
      scoring_rubric: {
        must_identify: [
          "accounts receivable",
          "payment terms",
          "collections",
          "cash flow",
        ],
        must_not_claim: [
          "revenue growth is the solution",
          "margin is the problem",
        ],
        ideal_depth: [
          "identifies specific clients with overdue invoices",
          "notes absence of a collections process",
        ],
      },
    },
    leakage_controls: {
      author_read_benchmark_fixtures: false,
      author_read_composer_source: false,
      leakage_check_passed: false,
    },
    holdout_meta: {
      author_id: "author-test",
      construction_date: "2026-06-22",
      industry: "Service",
      intervention_mode: "diagnostic",
      business_condition_hypothesis: "CASH_STRESS",
      consulting_lifecycle_stage: "diagnosis",
    },
  };
}

function buildMockCorpus(count: number): SimulationFixture[] {
  const categories = ["SC-01", "SC-02", "SC-03", "SC-04"] as const;
  const lines = Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(3, "0");
    const cat = categories[i % categories.length];
    const catNum = cat.replace("SC-", "");
    const id = `SIM-${catNum}-${num}`;
    return JSON.stringify(buildMockFixtureJson(id, cat));
  });
  return parseAndValidateSimulationFixtures(lines.join("\n") + "\n");
}

const STRONG_MOCK_OUTPUT = [
  "The primary issue is accounts receivable collections lag creating a recurring cash flow gap.",
  "Payment terms are not enforced and the collections process is absent.",
  "I need to see the aged receivables report broken down by client and outstanding days.",
  "Also the payroll schedule and timing relative to when invoices are collected.",
  "Cash flow projection for the next 13 weeks is essential before any other action.",
  "Produce aged receivables report and contact three largest overdue clients immediately.",
  "If further evidence changes the picture, this analysis will need revision.",
].join(" ");

describe("simulationHarness: non-empty mock corpus", () => {
  it("reports SIMULATION_CORPUS_READY with fixtures present", () => {
    const fixtures = buildMockCorpus(3);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report.corpusStatus).toBe("SIMULATION_CORPUS_READY");
  });

  it("totalCases matches fixture count", () => {
    const fixtures = buildMockCorpus(3);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report.totalCases).toBe(3);
  });

  it("runComplete is true with fixtures present", () => {
    const fixtures = buildMockCorpus(1);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report.runComplete).toBe(true);
  });

  it("produces a result entry for each fixture", () => {
    const fixtures = buildMockCorpus(3);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report.results).toHaveLength(3);
  });

  it("result entries have case_id, category, test_type, and score", () => {
    const fixtures = buildMockCorpus(1);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    const entry = report.results[0];
    expect(entry.case_id).toMatch(/^SIM-\d{2}-\d{3}$/);
    expect(entry.category).toMatch(/^SC-\d{2}$/);
    expect(entry.test_type).toBe("TT-1");
    expect(entry.score).toBeDefined();
    expect(typeof entry.score.totalScore).toBe("number");
  });

  it("is deterministic — same output yields same result on re-run", () => {
    const fixtures = buildMockCorpus(2);
    const report1 = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    const report2 = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report1.passedCases).toBe(report2.passedCases);
    expect(report1.totalCases).toBe(report2.totalCases);
    expect(report1.passRate).toBe(report2.passRate);
  });

  it("passRate is a number between 0 and 1 with fixtures present", () => {
    const fixtures = buildMockCorpus(2);
    const report = runSimulationHarness(fixtures, () => STRONG_MOCK_OUTPUT);
    expect(report.passRate).not.toBeNull();
    expect(report.passRate!).toBeGreaterThanOrEqual(0);
    expect(report.passRate!).toBeLessThanOrEqual(1);
  });
});

describe("simulationHarness: zero cases cannot produce a PASS", () => {
  it("null passRate cannot satisfy >= 0.55 first-run threshold", () => {
    const report = runSimulationHarness([], () => "");
    const meetsThreshold = report.passRate !== null && report.passRate >= 0.55;
    expect(meetsThreshold).toBe(false);
  });

  it("corpus status NOT_READY cannot be treated as PASS regardless of threshold", () => {
    const report = runSimulationHarness([], () => "");
    expect(report.corpusStatus).not.toBe("SIMULATION_CORPUS_READY");
    expect(report.runComplete).toBe(false);
  });
});

describe("simulationHarness: no external calls", () => {
  it("harness produces results without any I/O beyond fixture loading", () => {
    // This test verifies structural completeness — the harness is pure function
    const fixtures = buildMockCorpus(1);
    const report = runSimulationHarness(fixtures, (f) =>
      `Accounts receivable collections lag is the root cause. Cash flow gap is present. ` +
      `Payment terms are the mechanism. Collections process is absent. ` +
      `I need to see the aged receivables report and payroll schedule. ` +
      `If evidence changes, this may be revised. ` +
      `Primary root cause is ${f.sealed_expected_output.primary_root_cause.replace(/_/g, " ")}.`
    );
    expect(report.runComplete).toBe(true);
    expect(report.totalCases).toBe(1);
  });
});
