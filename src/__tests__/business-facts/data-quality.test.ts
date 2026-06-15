/**
 * B03 — Data Quality Scoring: pure-function tests.
 *
 * Proves the seven dimensions, the combined DATA_QUALITY_SCORE, and the §12
 * acceptance gates:
 *   - a complete clean dataset scores higher than an incomplete one
 *   - a contradictory dataset has downgraded consistency (and lower overall)
 *   - a manual-only dataset is lower confidence than a source-backed one
 *   - low data quality caps recommendation confidence (score < 50 blocks high
 *     confidence)
 *
 * Non-DB: pure scoring over validated B01 contracts. Runs under `npm test`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { businessFactsContractSchema, type BusinessFactsContract } from "@/domain/business-facts/contract";
import {
  scoreDataQuality,
  withDataQualityScore,
  dataQualityScoreSchema,
} from "@/domain/business-facts/data-quality";

const examples = JSON.parse(
  readFileSync(resolve(__dirname, "../../../contracts/business-facts.examples.json"), "utf8"),
) as Record<string, unknown>;

/** Parse a raw example through the contract schema so a bad fixture fails loudly. */
function asContract(raw: unknown): BusinessFactsContract {
  return businessFactsContractSchema.parse(raw);
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const FACT_CATEGORIES = [
  "financials",
  "sales",
  "customers",
  "marketing",
  "operations",
  "inventory",
  "staffing",
  "debt",
  "cash",
] as const;

const serviceBusiness = asContract(examples.service_business);
const missingDataCase = asContract(examples.missing_data_case);
const contradictionCase = asContract(examples.contradiction_case);

// Fixed reference dates keep recency deterministic.
const NOW_FRESH = new Date("2026-05-15T00:00:00.000Z");
const NOW_STALE = new Date("2030-01-01T00:00:00.000Z");

describe("B03 data quality — output shape & determinism", () => {
  it("produces a schema-valid result with all seven dimensions", () => {
    const score = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    expect(dataQualityScoreSchema.safeParse(score).success).toBe(true);
    expect(Object.keys(score.dimensions).sort()).toEqual(
      [
        "auditability",
        "completeness",
        "consistency",
        "extraction_confidence",
        "granularity",
        "recency",
        "source_reliability",
      ].sort(),
    );
    expect(score.data_quality_score).toBeGreaterThanOrEqual(0);
    expect(score.data_quality_score).toBeLessThanOrEqual(100);
  });

  it("is deterministic for the same input + now", () => {
    const a = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const b = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    expect(a).toEqual(b);
  });
});

describe("B03 data quality — acceptance gates", () => {
  it("complete clean dataset scores higher than an incomplete dataset", () => {
    const clean = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const incomplete = scoreDataQuality(missingDataCase, { now: NOW_FRESH });
    expect(clean.data_quality_score).toBeGreaterThan(incomplete.data_quality_score);
    expect(clean.dimensions.completeness).toBeGreaterThan(incomplete.dimensions.completeness);
  });

  it("a contradictory dataset has downgraded consistency and lower overall score", () => {
    const clean = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const conflicted = scoreDataQuality(contradictionCase, { now: NOW_FRESH });
    expect(conflicted.dimensions.consistency).toBeLessThan(clean.dimensions.consistency);
    expect(conflicted.data_quality_score).toBeLessThan(clean.data_quality_score);
  });

  it("a manual-only dataset is lower confidence than the source-backed original", () => {
    // Derive a manual-only variant of the source-backed service business.
    const manualRaw = clone(examples.service_business) as Record<string, any>;
    for (const doc of manualRaw.source_documents) doc.kind = "manual_owner_entry";
    for (const cat of FACT_CATEGORIES) {
      for (const fact of manualRaw[cat] ?? []) {
        if (fact.value !== null) fact.extraction_method = "manual_entry";
      }
    }
    const manual = asContract(manualRaw);

    const source = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const manualScore = scoreDataQuality(manual, { now: NOW_FRESH });

    expect(manualScore.dimensions.source_reliability).toBeLessThan(source.dimensions.source_reliability);
    expect(manualScore.dimensions.extraction_confidence).toBeLessThan(
      source.dimensions.extraction_confidence,
    );
    expect(manualScore.data_quality_score).toBeLessThan(source.data_quality_score);
  });

  it("low data quality (< 50) blocks high-confidence recommendations and caps confidence", () => {
    // Deliberately poor-but-valid: manual/OCR draft source, stale period, extra blocking gap.
    const poorRaw = clone(examples.missing_data_case) as Record<string, any>;
    poorRaw.source_documents[0].kind = "screenshot_ocr";
    for (const cat of FACT_CATEGORIES) {
      for (const fact of poorRaw[cat] ?? []) {
        if (fact.value !== null) {
          fact.extraction_method = "ocr";
          fact.validation_status = "draft";
          fact.confidence_score = 0.4;
        }
      }
    }
    poorRaw.missing_data.push({
      field: "operating_expenses",
      reason: "No expense data supplied for the period.",
      blocking: true,
    });
    const poor = asContract(poorRaw);

    const score = scoreDataQuality(poor, { now: NOW_STALE });
    expect(score.data_quality_score).toBeLessThan(50);
    expect(score.high_confidence_blocked).toBe(true);
    expect(score.recommendation_confidence_tier).toBe("low");
    expect(score.recommendation_confidence_cap).toBe(0.5);
    expect(score.notes.some((n) => /high-confidence/i.test(n))).toBe(true);
  });

  it("high-quality source-backed data is not blocked and allows high confidence", () => {
    const score = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    expect(score.high_confidence_blocked).toBe(false);
    expect(score.recommendation_confidence_cap).toBeGreaterThan(0.5);
  });
});

describe("B03 data quality — recency dimension", () => {
  it("downgrades a stale reporting period relative to a fresh one", () => {
    const fresh = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const stale = scoreDataQuality(serviceBusiness, { now: NOW_STALE });
    expect(stale.dimensions.recency).toBeLessThan(fresh.dimensions.recency);
    expect(stale.data_quality_score).toBeLessThan(fresh.data_quality_score);
  });
});

describe("B03 data quality — withDataQualityScore", () => {
  it("folds the score into confidence WITHOUT mutating the input", () => {
    const score = scoreDataQuality(serviceBusiness, { now: NOW_FRESH });
    const before = serviceBusiness.confidence.data_quality_score;
    const next = withDataQualityScore(serviceBusiness, score);

    expect(next.confidence.data_quality_score).toBe(score.data_quality_score);
    // Input untouched (no silent mutation of governed records).
    expect(serviceBusiness.confidence.data_quality_score).toBe(before);
    expect(next).not.toBe(serviceBusiness);
    // Result remains a valid contract.
    expect(businessFactsContractSchema.safeParse(next).success).toBe(true);
  });
});
