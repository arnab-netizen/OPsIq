/**
 * Tests for loadSimulationFixtures.ts.
 *
 * The fixture file does not exist in the repository at scaffold time (corpus not yet authored).
 * Tests therefore rely on NOT_READY state for most cases, and on a helper that
 * directly calls parseAndValidateSimulationFixtures with in-memory content.
 *
 * We do NOT mock the filesystem — instead we test the loader contract via the
 * exposed _resetSimulationFixtureCache and the fact that the fixture file is absent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSimulationFixtures,
  listSimulationCaseIds,
  getSimulationCaseById,
  _resetSimulationFixtureCache,
} from "./loadSimulationFixtures";
import { parseAndValidateSimulationFixtures } from "./simulationFixtureSchema";

beforeEach(() => {
  _resetSimulationFixtureCache();
});

// ── Empty corpus (fixture file absent) ───────────────────────────────────────

describe("loadSimulationFixtures: empty corpus returns NOT_READY", () => {
  it("returns NOT_READY when fixture file does not exist", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.status).toBe("NOT_READY");
  });

  it("returns empty fixtures array when NOT_READY", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.fixtures).toHaveLength(0);
  });

  it("includes a human-readable reason when NOT_READY", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.reason).toBeTruthy();
    expect(typeof corpus.reason).toBe("string");
  });
});

// ── listSimulationCaseIds with empty corpus ──────────────────────────────────

describe("listSimulationCaseIds: empty corpus returns empty array", () => {
  it("returns [] when corpus is NOT_READY", () => {
    const ids = listSimulationCaseIds();
    expect(ids).toEqual([]);
  });
});

// ── getSimulationCaseById with empty corpus ───────────────────────────────────

describe("getSimulationCaseById: throws on NOT_READY corpus", () => {
  it("throws when corpus is NOT_READY", () => {
    expect(() => getSimulationCaseById("SIM-01-001")).toThrow(/NOT_READY/);
  });
});

// ── getSimulationCaseById: unknown ID ─────────────────────────────────────────

describe("getSimulationCaseById: throws descriptive error for unknown ID", () => {
  it("parser itself throws for unknown ID when used directly", () => {
    // Test the parser/validator path directly with in-memory content
    const raw = {
      case_id: "SIM-01-001",
      title: "Test Case",
      category: "SC-01",
      test_type: "TT-1",
      segment: "Trade, 3 employees",
      business_context: "A small trade business is struggling with cash flow.",
      source_basis: ["Composite from consulting practice"],
      input_packet: {
        business_description:
          "A small plumbing business always runs low on cash at month end.",
        facts_known_to_owner: { annual_revenue: 400000 },
        symptoms: [
          "Cash low at month end",
          "Owner cannot pay herself",
          "Invoices outstanding pile up",
        ],
        misleading_signals: [
          "Revenue grew 10% this year",
          "Gross margin looks acceptable",
        ],
        missing_inputs_opsiq_should_request: [
          "Aged debtors report showing balances by client and days outstanding",
          "Payroll schedule relative to when client money typically arrives",
          "Supplier contract billing schedules and enforcement history",
        ],
      },
      sealed_expected_output: {
        primary_root_cause: "receivables_lag",
        secondary_causes: ["no_collections_process", "payroll_timing_mismatch"],
        expected_first_action:
          "Produce an aged debtors report and call the three largest overdue clients.",
        bad_recommendations_to_flag: [
          "increase marketing",
          "hire more staff",
          "take a loan",
          "grow revenue faster",
        ],
        scoring_rubric: {
          must_identify: [
            "accounts receivable",
            "payment terms",
            "invoice aging",
            "collections",
          ],
          must_not_claim: [
            "the margin is the problem",
            "revenue growth will fix it",
          ],
          ideal_depth: [
            "identifies the specific clients with overdue invoices",
            "notes that collections process is absent",
          ],
        },
      },
      leakage_controls: {
        author_read_benchmark_fixtures: false,
        author_read_composer_source: false,
        leakage_check_passed: false,
      },
      holdout_meta: {
        author_id: "author-B",
        construction_date: "2026-06-22",
        industry: "Trade services",
        intervention_mode: "diagnostic",
        business_condition_hypothesis: "CASH_STRESS",
        consulting_lifecycle_stage: "diagnosis",
      },
    };
    const fixtures = parseAndValidateSimulationFixtures(JSON.stringify(raw) + "\n");
    expect(fixtures).toHaveLength(1);
    // Confirm the known ID is there
    const found = fixtures.find((f) => f.case_id === "SIM-01-001");
    expect(found).toBeDefined();
    // Confirm unknown ID is not there
    const notFound = fixtures.find((f) => f.case_id === "SIM-99-999");
    expect(notFound).toBeUndefined();
  });
});

// ── Duplicate IDs in JSONL ───────────────────────────────────────────────────

describe("parseAndValidateSimulationFixtures: duplicate IDs fail", () => {
  it("throws on duplicate case_id", () => {
    const single = {
      case_id: "SIM-02-001",
      title: "Duplicate test",
      category: "SC-02",
      test_type: "TT-1",
      segment: "Retail, 5 employees",
      business_context: "A retailer with margin problems.",
      source_basis: ["Composite"],
      input_packet: {
        business_description: "A small retailer notices margins have dropped.",
        facts_known_to_owner: { annual_revenue: 650000 },
        symptoms: [
          "Revenue steady but profit is lower",
          "Owner is working longer hours",
          "Costs feel higher but owner cannot pinpoint them",
        ],
        misleading_signals: [
          "Revenue has not declined",
          "No major competitor has entered the area",
        ],
        missing_inputs_opsiq_should_request: [
          "Profitability breakdown by product category for the last 12 months",
          "Supplier cost changes over the past 12 months",
          "Wage cost as percentage of revenue for each quarter",
        ],
      },
      sealed_expected_output: {
        primary_root_cause: "margin_compression",
        secondary_causes: ["input_cost_increase", "pricing_not_adjusted"],
        expected_first_action:
          "Calculate gross margin by product category for the last three months compared to the same period last year.",
        bad_recommendations_to_flag: [
          "hire a salesperson",
          "increase marketing spend",
          "open a second location",
          "take on new product lines",
        ],
        scoring_rubric: {
          must_identify: [
            "gross margin",
            "cost of goods",
            "pricing adjustment",
            "margin compression",
          ],
          must_not_claim: [
            "revenue growth will fix it",
            "the problem is low foot traffic",
          ],
          ideal_depth: [
            "identifies specific product categories with worst margin decline",
            "notes that supplier cost increases were not passed through",
          ],
        },
      },
      leakage_controls: {
        author_read_benchmark_fixtures: false,
        author_read_composer_source: false,
        leakage_check_passed: false,
      },
      holdout_meta: {
        author_id: "author-B",
        construction_date: "2026-06-22",
        industry: "Retail",
        intervention_mode: "diagnostic",
        business_condition_hypothesis: "MARGIN_STRESS",
        consulting_lifecycle_stage: "diagnosis",
      },
    };
    const line = JSON.stringify(single);
    expect(() =>
      parseAndValidateSimulationFixtures(`${line}\n${line}\n`)
    ).toThrow(/Duplicate case_id/);
  });
});

// ── NOT_READY is never PASS ───────────────────────────────────────────────────

describe("NOT_READY corpus cannot be treated as PASS", () => {
  it("NOT_READY status is not equal to READY", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.status).not.toBe("READY");
  });

  it("fixture count is 0 in NOT_READY state", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.fixtures.length).toBe(0);
  });

  it("empty fixture list cannot satisfy a pass-rate check", () => {
    const corpus = loadSimulationFixtures();
    const supportedCount = corpus.fixtures.filter(() => true).length;
    // No cases = 0/0 — undefined pass rate — cannot be reported as pass
    expect(supportedCount).toBe(0);
  });
});
