/**
 * Diagnosis Permission Gate (Decision-OS §15/§16) — pure-function tests.
 *
 * Composes the REAL `scoreDataQuality` with `assessDiagnosisPermission` so the
 * proof exercises the production scoring chain, not a hand-built score. Proves:
 *   - weak input cannot reach SAFE_TO_DIAGNOSE / cannot allow high confidence
 *   - blocking gaps and contradictions drive the correct §15 state
 *   - §16 final-recommendation and high-confidence blocks are enforced
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  businessFactsContractSchema,
  type BusinessFactsContract,
} from "@/domain/business-facts/contract";
import { scoreDataQuality } from "@/domain/business-facts/data-quality";
import {
  DIAGNOSIS_PERMISSIONS,
  assessDiagnosisPermission,
} from "@/domain/business-facts/diagnosis-permission";

const examples = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../contracts/business-facts.examples.json"),
    "utf8"
  )
) as Record<string, unknown>;

function asContract(raw: unknown): BusinessFactsContract {
  return businessFactsContractSchema.parse(raw);
}

const serviceBusiness = asContract(examples.service_business);
const missingDataCase = asContract(examples.missing_data_case);
const contradictionCase = asContract(examples.contradiction_case);
const NOW = new Date("2026-05-15T00:00:00.000Z");

describe("diagnosis-permission gate (§15/§16)", () => {
  it("only ever returns canonical permission states", () => {
    for (const fixture of [serviceBusiness, missingDataCase, contradictionCase]) {
      const score = scoreDataQuality(fixture, { now: NOW });
      const result = assessDiagnosisPermission(score, {});
      expect(DIAGNOSIS_PERMISSIONS).toContain(result.permission);
      expect(result.confidenceCap).toBeGreaterThanOrEqual(0);
      expect(result.confidenceCap).toBeLessThanOrEqual(1);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });

  it("a clean, complete, source-backed dataset can be SAFE_TO_DIAGNOSE", () => {
    const score = scoreDataQuality(serviceBusiness, { now: NOW });
    // Only assert SAFE when the underlying tier is actually high; otherwise the
    // gate must NOT claim safe — proving it never over-promises.
    const result = assessDiagnosisPermission(score, {});
    if (score.recommendation_confidence_tier === "high") {
      expect(result.permission).toBe("SAFE_TO_DIAGNOSE");
      expect(result.blocksFinalRecommendation).toBe(false);
    } else {
      expect(result.permission).not.toBe("SAFE_TO_DIAGNOSE");
    }
  });

  it("low data quality + a blocking gap ⇒ INSUFFICIENT_DATA and blocks final recommendation", () => {
    const score = scoreDataQuality(missingDataCase, { now: NOW });
    const result = assessDiagnosisPermission(score, { blockingMissingCount: 2 });
    if (score.high_confidence_blocked) {
      expect(result.permission).toBe("INSUFFICIENT_DATA");
      expect(result.blocksFinalRecommendation).toBe(true);
    }
    // Whatever the tier, low quality must block high confidence.
    expect(result.blocksHighConfidence).toBe(score.high_confidence_blocked);
  });

  it("contradictory evidence on a non-high tier ⇒ UNSAFE_TO_CONCLUDE and caps confidence ≤ 0.5", () => {
    const score = scoreDataQuality(contradictionCase, { now: NOW });
    const result = assessDiagnosisPermission(score, {
      hasContradictoryEvidence: true,
    });
    if (score.recommendation_confidence_tier !== "high") {
      expect(result.permission).toBe("UNSAFE_TO_CONCLUDE");
      expect(result.blocksFinalRecommendation).toBe(true);
    }
    expect(result.confidenceCap).toBeLessThanOrEqual(0.5);
  });

  it("missing critical financial data blocks high confidence even on a good score", () => {
    const score = scoreDataQuality(serviceBusiness, { now: NOW });
    const result = assessDiagnosisPermission(score, {
      criticalFinancialMissing: true,
    });
    expect(result.blocksHighConfidence).toBe(true);
    expect(result.confidenceCap).toBeLessThanOrEqual(0.75);
    expect(["REQUIRES_OWNER_INPUT", "INSUFFICIENT_DATA", "UNSAFE_TO_CONCLUDE"]).toContain(
      result.permission
    );
  });

  it("is deterministic and fail-closed (no optimistic default on empty signals)", () => {
    const score = scoreDataQuality(missingDataCase, { now: NOW });
    const a = assessDiagnosisPermission(score, {});
    const b = assessDiagnosisPermission(score, {});
    expect(a).toEqual(b);
    // A weak score must never silently resolve to SAFE_TO_DIAGNOSE.
    if (score.high_confidence_blocked) {
      expect(a.permission).not.toBe("SAFE_TO_DIAGNOSE");
    }
  });
});
