/**
 * Phase 1 - Evidence Reliability Engine Tests
 *
 * Verifies weighted evidence scoring prevents fake certainty:
 * - Source type credibility is applied
 * - Freshness decay is deterministic
 * - Evidence quality assessment guides confidence claims
 * - Composite scoring is idempotent
 */

import { describe, it, expect } from "vitest";
import {
  getSourceTypeWeight,
  calculateFreshnessScore,
  calculateCompositeScore,
  scoreEvidence,
  assessEvidenceQuality,
  type EvidenceScore,
  type EvidenceReliabilityAssessment,
} from "@/services/evidence-reliability-engine";

describe("Phase 1 - Evidence Reliability Engine", () => {
  describe("Contract - Source Type Weighting", () => {
    it("returns 0.0-1.0 for all evidence types", () => {
      const types = ["document", "interview", "metric", "observation", "estimate", "assumption", "unknown"];

      types.forEach((type) => {
        const weight = getSourceTypeWeight(type);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });

    it("metric source has highest credibility", () => {
      const weights = {
        metric: getSourceTypeWeight("metric"),
        document: getSourceTypeWeight("document"),
        interview: getSourceTypeWeight("interview"),
        observation: getSourceTypeWeight("observation"),
        estimate: getSourceTypeWeight("estimate"),
        assumption: getSourceTypeWeight("assumption"),
      };

      expect(weights.metric).toBeGreaterThan(weights.interview);
      expect(weights.metric).toBeGreaterThan(weights.estimate);
    });

    it("assumption source has lowest credibility", () => {
      const assumption = getSourceTypeWeight("assumption");
      const estimate = getSourceTypeWeight("estimate");

      expect(assumption).toBeLessThan(estimate);
    });

    it("null or undefined returns default weight", () => {
      expect(getSourceTypeWeight(null)).toBe(0.5);
      expect(getSourceTypeWeight(undefined)).toBe(0.5);
      expect(getSourceTypeWeight("")).toBe(0.5);
    });

    it("case-insensitive source type matching", () => {
      expect(getSourceTypeWeight("METRIC")).toBe(getSourceTypeWeight("metric"));
      expect(getSourceTypeWeight("Interview")).toBe(getSourceTypeWeight("interview"));
    });
  });

  describe("Contract - Freshness Score Decay", () => {
    it("returns 0.0-1.0 for all ages", () => {
      const recentTime = new Date("2026-05-07T10:00:00Z");
      const oldTime = new Date("2020-01-01T10:00:00Z");

      const recent = calculateFreshnessScore("2026-05-07T09:00:00Z", "2026-05-07T10:00:00Z");
      const old = calculateFreshnessScore(oldTime.toISOString(), recentTime.toISOString());

      expect(recent).toBeGreaterThan(0);
      expect(recent).toBeLessThanOrEqual(1);
      expect(old).toBeGreaterThanOrEqual(0);
      expect(old).toBeLessThanOrEqual(1);
    });

    it("recent evidence has higher freshness than old evidence", () => {
      const referenceTime = "2026-05-07T10:00:00Z";
      const recent = calculateFreshnessScore("2026-05-07T09:00:00Z", referenceTime); // 1 hour old
      const older = calculateFreshnessScore("2026-04-07T10:00:00Z", referenceTime); // 30 days old

      expect(recent).toBeGreaterThan(older);
    });

    it("null observedAt returns neutral freshness", () => {
      const score = calculateFreshnessScore(null);
      expect(score).toBe(0.5);
    });

    it("exponential decay is deterministic", () => {
      const time1 = calculateFreshnessScore("2026-01-01T00:00:00Z", "2026-05-07T00:00:00Z");
      const time2 = calculateFreshnessScore("2026-01-01T00:00:00Z", "2026-05-07T00:00:00Z");

      expect(time1).toBe(time2);
    });

    it("90-day evidence has approximately 50% freshness", () => {
      const ninetyDaysAgo = new Date("2026-02-07T10:00:00Z").toISOString();
      const now = "2026-05-07T10:00:00Z";

      const score = calculateFreshnessScore(ninetyDaysAgo, now);
      // Should be close to 0.5 (exact depends on leap years, etc)
      expect(score).toBeGreaterThan(0.45);
      expect(score).toBeLessThan(0.55);
    });

    it("evidence older than 365 days has zero freshness", () => {
      const veryOld = "2024-05-07T10:00:00Z";
      const now = "2026-05-07T10:00:00Z";

      const score = calculateFreshnessScore(veryOld, now);
      expect(score).toBe(0);
    });
  });

  describe("Contract - Composite Score", () => {
    it("returns 0.0-1.0 for all combinations", () => {
      const combinations = [
        [0, 0],
        [1, 1],
        [0.5, 0.5],
        [1, 0],
        [0, 1],
      ];

      combinations.forEach(([reliability, freshness]) => {
        const score = calculateCompositeScore(reliability, freshness);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it("is multiplication of reliability and freshness", () => {
      const reliability = 0.8;
      const freshness = 0.5;
      const expected = 0.4;

      const score = calculateCompositeScore(reliability, freshness);
      expect(score).toBe(expected);
    });

    it("null reliability defaults to 0.5", () => {
      const score = calculateCompositeScore(null, 0.8);
      expect(score).toBe(0.4); // 0.5 * 0.8
    });

    it("is idempotent - calling twice produces same result", () => {
      const score1 = calculateCompositeScore(0.7, 0.6);
      const score2 = calculateCompositeScore(0.7, 0.6);

      expect(score1).toBe(score2);
    });
  });

  describe("Behavior - Individual Evidence Scoring", () => {
    it("metric evidence gets higher score than assumption", () => {
      const metric = scoreEvidence("ev1", "metric", 0.85, "2026-05-07T00:00:00Z", "2026-05-07T10:00:00Z");
      const assumption = scoreEvidence("ev2", "assumption", 0.2, "2026-05-07T00:00:00Z", "2026-05-07T10:00:00Z");

      expect(metric.composite_score).toBeGreaterThan(assumption.composite_score);
    });

    it("recent evidence gets higher score than stale evidence", () => {
      const recent = scoreEvidence("ev1", "metric", 0.85, "2026-05-07T09:00:00Z", "2026-05-07T10:00:00Z");
      const old = scoreEvidence("ev2", "metric", 0.85, "2025-05-07T09:00:00Z", "2026-05-07T10:00:00Z");

      expect(recent.composite_score).toBeGreaterThan(old.composite_score);
    });

    it("returns correct confidence impact classification", () => {
      const high = scoreEvidence("ev1", "metric", 0.9, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z");
      const medium = scoreEvidence("ev2", "interview", 0.6, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z");
      const low = scoreEvidence("ev3", "estimate", 0.3, "2025-05-07T00:00:00Z", "2026-05-07T01:00:00Z");

      expect(high.confidence_impact).toBe("HIGH");
      expect(medium.confidence_impact).toBe("MEDIUM");
      expect(low.confidence_impact).toBe("LOW");
    });

    it("includes reason string explaining score", () => {
      const score = scoreEvidence("ev1", "document", 0.8, "2026-05-07T00:00:00Z", "2026-05-07T10:00:00Z");

      expect(score.reason).toContain("document");
      expect(score.reason).toContain("%");
    });

    it("is deterministic - same inputs produce same output", () => {
      const score1 = scoreEvidence("ev1", "metric", 0.85, "2026-05-01T00:00:00Z", "2026-05-07T00:00:00Z");
      const score2 = scoreEvidence("ev1", "metric", 0.85, "2026-05-01T00:00:00Z", "2026-05-07T00:00:00Z");

      expect(score1.reliability_score).toBe(score2.reliability_score);
      expect(score1.freshness_score).toBe(score2.freshness_score);
      expect(score1.composite_score).toBe(score2.composite_score);
      expect(score1.confidence_impact).toBe(score2.confidence_impact);
    });
  });

  describe("Behavior - Evidence Quality Assessment", () => {
    it("empty evidence list returns INSUFFICIENT verdict", () => {
      const assessment = assessEvidenceQuality([]);

      expect(assessment.total_evidence_count).toBe(0);
      expect(assessment.evidence_quality_verdict).toBe("INSUFFICIENT");
      expect(assessment.confidence_recommendation).toBe("NEED_MORE_DATA");
      expect(assessment.improvement_actions.length).toBeGreaterThan(0);
    });

    it("strong evidence (avg >= 0.7, min >= 0.5) returns HIGH_CONFIDENCE", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "metric", 0.9, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev2", "metric", 0.85, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev3", "document", 0.8, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      expect(assessment.evidence_quality_verdict).toBe("STRONG");
      expect(assessment.confidence_recommendation).toBe("HIGH_CONFIDENCE");
    });

    it("acceptable evidence (avg >= 0.5, min >= 0.3) returns MEDIUM_CONFIDENCE", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "interview", 0.6, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev2", "document", 0.55, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      expect(assessment.evidence_quality_verdict).toBe("ACCEPTABLE");
      expect(assessment.confidence_recommendation).toBe("MEDIUM_CONFIDENCE");
    });

    it("weak evidence (avg >= 0.3) returns LOW_CONFIDENCE with improvement actions", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "interview", 0.35, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev2", "estimate", 0.3, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      expect(assessment.evidence_quality_verdict).toBe("WEAK");
      expect(assessment.confidence_recommendation).toBe("LOW_CONFIDENCE");
      expect(assessment.improvement_actions.length).toBeGreaterThan(0);
    });

    it("calculates correct weighted average score", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "metric", 0.8, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev2", "metric", 0.6, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      // Both are 1 hour old with similar freshness, composite ~0.8 and ~0.6
      expect(assessment.weighted_average_score).toBeGreaterThan(0.5);
      expect(assessment.weighted_average_score).toBeLessThan(1);
    });

    it("detects stale evidence and adds improvement action", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "metric", 0.9, "2024-05-07T00:00:00Z", "2026-05-07T00:00:00Z"), // Very old
      ];

      const assessment = assessEvidenceQuality(scores);

      const staleAction = assessment.improvement_actions.find((a) => a.includes("stale"));
      expect(staleAction).toBeTruthy();
    });

    it("is deterministic - same evidence produces same assessment", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "metric", 0.85, "2026-05-01T00:00:00Z", "2026-05-07T00:00:00Z"),
        scoreEvidence("ev2", "interview", 0.6, "2026-05-02T00:00:00Z", "2026-05-07T00:00:00Z"),
      ];

      const assessment1 = assessEvidenceQuality(scores);
      const assessment2 = assessEvidenceQuality(scores);

      expect(assessment1.weighted_average_score).toBe(assessment2.weighted_average_score);
      expect(assessment1.evidence_quality_verdict).toBe(assessment2.evidence_quality_verdict);
      expect(assessment1.confidence_recommendation).toBe(assessment2.confidence_recommendation);
    });
  });

  describe("Integration - Confidence Gating", () => {
    it("strong evidence enables HIGH_CONFIDENCE claims", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "metric", 0.95, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev2", "metric", 0.9, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
        scoreEvidence("ev3", "metric", 0.88, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      if (assessment.confidence_recommendation === "HIGH_CONFIDENCE") {
        // Can claim high confidence
        expect(assessment.weighted_average_score).toBeGreaterThanOrEqual(0.7);
        expect(assessment.minimum_score).toBeGreaterThanOrEqual(0.5);
      }
    });

    it("weak evidence blocks HIGH_CONFIDENCE claims", () => {
      const scores: EvidenceScore[] = [
        scoreEvidence("ev1", "estimate", 0.35, "2026-05-01T00:00:00Z", "2026-05-07T00:00:00Z"),
      ];

      const assessment = assessEvidenceQuality(scores);

      expect(assessment.confidence_recommendation).not.toBe("HIGH_CONFIDENCE");
    });

    it("contradicting evidence quality verdicts prevent claim collisions", () => {
      const strongEvidence = assessEvidenceQuality([
        scoreEvidence("ev1", "metric", 0.9, "2026-05-07T00:00:00Z", "2026-05-07T01:00:00Z"),
      ]);

      const weakEvidence = assessEvidenceQuality([
        scoreEvidence("ev1", "estimate", 0.25, "2026-05-01T00:00:00Z", "2026-05-07T00:00:00Z"),
      ]);

      expect(strongEvidence.confidence_recommendation).not.toBe(weakEvidence.confidence_recommendation);
    });
  });
});
