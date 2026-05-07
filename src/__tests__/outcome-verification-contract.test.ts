/**
 * Phase 1 - Outcome Verification Contract Tests
 *
 * Verifies claimed outcomes are separated from verified outcomes:
 * - Verification score 0.0-1.0 based on evidence quality
 * - Unverified outcomes don't influence learning (fail-closed: should_influence_learning false)
 * - Learning blocked unless verification rate sufficient
 * - Deterministic assessment
 */

import { describe, it, expect } from "vitest";
import {
  assessOutcomeVerification,
  assessVerificationQuality,
  type OutcomeClaim,
  type OutcomeVerification,
} from "@/services/outcome-verification-contract";

describe("Phase 1 - Outcome Verification Contract", () => {
  const createMockClaim = (description: string = "Test claim"): OutcomeClaim => ({
    claim_id: "claim-001",
    action_id: "action-001",
    description,
    expected_metric: "revenue",
    expected_impact: 10000,
    claimed_at: "2026-05-07T10:00:00Z",
    claimed_by: "user-001",
  });

  describe("Contract - Verification Score", () => {
    it("returns verification_score 0.0-1.0 for all inputs", () => {
      const claim = createMockClaim();

      const noEvidence = assessOutcomeVerification(claim, []);
      const someEvidence = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.8 },
        { id: "ev2", type: "document", confidence: 0.7 },
      ]);

      expect(noEvidence.verification_score).toBe(0);
      expect(someEvidence.verification_score).toBeGreaterThanOrEqual(0);
      expect(someEvidence.verification_score).toBeLessThanOrEqual(1);
    });

    it("unverified claim has zero verification_score", () => {
      const claim = createMockClaim("Claim with no evidence");
      const verification = assessOutcomeVerification(claim, []);

      expect(verification.verification_score).toBe(0);
      expect(verification.status).toBe("CLAIMED");
      expect(verification.should_influence_learning).toBe(false);
    });

    it("more evidence increases verification score", () => {
      const claim = createMockClaim();

      const oneEvidence = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.9 },
      ]);

      const threeEvidence = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.9 },
        { id: "ev2", type: "metric", confidence: 0.85 },
        { id: "ev3", type: "metric", confidence: 0.9 },
      ]);

      expect(threeEvidence.verification_score).toBeGreaterThan(oneEvidence.verification_score);
    });

    it("higher confidence evidence increases verification score", () => {
      const claim = createMockClaim();

      const weakEvidence = assessOutcomeVerification(claim, [
        { id: "ev1", type: "estimate", confidence: 0.3 },
      ]);

      const strongEvidence = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.9 },
      ]);

      expect(strongEvidence.verification_score).toBeGreaterThan(weakEvidence.verification_score);
    });

    it("is deterministic - same input produces same output", () => {
      const claim = createMockClaim();
      const evidence = [
        { id: "ev1", type: "metric", confidence: 0.85 },
        { id: "ev2", type: "document", confidence: 0.75 },
      ];

      const verification1 = assessOutcomeVerification(claim, evidence);
      const verification2 = assessOutcomeVerification(claim, evidence);

      expect(verification1.verification_score).toBe(verification2.verification_score);
      expect(verification1.status).toBe(verification2.status);
    });
  });

  describe("Contract - Learning Eligibility", () => {
    it("returns should_influence_learning boolean", () => {
      const claim = createMockClaim();

      const unverified = assessOutcomeVerification(claim, []);
      const weaklyVerified = assessOutcomeVerification(claim, [
        { id: "ev1", type: "estimate", confidence: 0.5 },
      ]);
      const fullyVerified = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.95 },
        { id: "ev2", type: "metric", confidence: 0.92 },
        { id: "ev3", type: "document", confidence: 0.88 },
      ]);

      expect(unverified.should_influence_learning).toBe(false);
      expect(weaklyVerified.should_influence_learning).toBe(false);
      expect(fullyVerified.should_influence_learning).toBe(true);
    });

    it("only verified outcomes (score >= 0.7) can influence learning", () => {
      const claim = createMockClaim();

      const marginal = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.95 },
        { id: "ev2", type: "metric", confidence: 0.88 },
        { id: "ev3", type: "metric", confidence: 0.85 },
      ]);
      const borderline = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.7 },
        { id: "ev2", type: "interview", confidence: 0.65 },
      ]);

      // Marginal case should be eligible (>= 0.7)
      expect(marginal.verification_score).toBeGreaterThanOrEqual(0.7);
      expect(marginal.should_influence_learning).toBe(true);

      // Borderline case below 0.7 should not be eligible
      expect(borderline.verification_score).toBeLessThan(0.7);
      expect(borderline.should_influence_learning).toBe(false);
    });

    it("fail-closed: defaults false unless evidence strongly supports", () => {
      const claim = createMockClaim();

      const cases = [
        { evidence: [], expected: false },
        { evidence: [{ id: "ev1", type: "estimate", confidence: 0.4 }], expected: false },
        { evidence: [{ id: "ev1", type: "metric", confidence: 0.65 }], expected: false },
      ];

      cases.forEach(({ evidence, expected }) => {
        const verification = assessOutcomeVerification(claim, evidence);
        expect(verification.should_influence_learning).toBe(expected);
      });
    });
  });

  describe("Behavior - Status Determination", () => {
    it("maps verification scores to statuses", () => {
      const claim = createMockClaim();

      const verified = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.95 },
        { id: "ev2", type: "metric", confidence: 0.92 },
        { id: "ev3", type: "metric", confidence: 0.90 },
      ]);

      const partiallyVerified = assessOutcomeVerification(claim, [
        { id: "ev1", type: "interview", confidence: 0.78 },
        { id: "ev2", type: "interview", confidence: 0.75 },
      ]);

      const unverifiable = assessOutcomeVerification(claim, [
        { id: "ev1", type: "estimate", confidence: 0.5 },
        { id: "ev2", type: "estimate", confidence: 0.45 },
      ]);

      expect(verified.status).toBe("VERIFIED");
      expect(partiallyVerified.status).toBe("PARTIALLY_VERIFIED");
      expect(unverifiable.status).toBe("UNVERIFIABLE");
    });

    it("confidence_impact reflects verification strength", () => {
      const claim = createMockClaim();

      const strong = assessOutcomeVerification(claim, [
        { id: "ev1", type: "metric", confidence: 0.95 },
        { id: "ev2", type: "metric", confidence: 0.92 },
        { id: "ev3", type: "metric", confidence: 0.88 },
      ]);

      const weak = assessOutcomeVerification(claim, [
        { id: "ev1", type: "interview", confidence: 0.78 },
        { id: "ev2", type: "interview", confidence: 0.75 },
      ]);

      const none = assessOutcomeVerification(claim, []);

      expect(strong.confidence_impact).toBe("STRONG_SUPPORT");
      expect(weak.confidence_impact).toBe("WEAK_SUPPORT");
      expect(none.confidence_impact).toBe("NO_SUPPORT");
    });

    it("is deterministic", () => {
      const claim = createMockClaim();
      const evidence = [
        { id: "ev1", type: "metric", confidence: 0.75 },
        { id: "ev2", type: "interview", confidence: 0.6 },
      ];

      const status1 = assessOutcomeVerification(claim, evidence).status;
      const status2 = assessOutcomeVerification(claim, evidence).status;

      expect(status1).toBe(status2);
    });
  });

  describe("Integration - Verification Quality Assessment", () => {
    it("calculates verification_rate from verified claims", () => {
      const verifications: OutcomeVerification[] = [
        {
          claim_id: "c1",
          status: "VERIFIED",
          verification_score: 0.85,
          evidence_count: 3,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
        {
          claim_id: "c2",
          status: "PARTIALLY_VERIFIED",
          verification_score: 0.55,
          evidence_count: 1,
          confidence_impact: "WEAK_SUPPORT",
          should_influence_learning: false,
        },
        {
          claim_id: "c3",
          status: "CLAIMED",
          verification_score: 0,
          evidence_count: 0,
          confidence_impact: "NO_SUPPORT",
          should_influence_learning: false,
        },
      ];

      const assessment = assessVerificationQuality(verifications);

      expect(assessment.total_claims).toBe(3);
      expect(assessment.verified_count).toBe(1);
      expect(assessment.verification_rate).toBe(1 / 3);
      expect(assessment.learning_eligible_count).toBe(1);
      expect(assessment.learning_eligible_rate).toBe(1 / 3);
    });

    it("high verification rate enables learning (>= 80% verified, >= 70% eligible)", () => {
      const strongVerifications: OutcomeVerification[] = [
        {
          claim_id: "c1",
          status: "VERIFIED",
          verification_score: 0.9,
          evidence_count: 3,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
        {
          claim_id: "c2",
          status: "VERIFIED",
          verification_score: 0.85,
          evidence_count: 3,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
        {
          claim_id: "c3",
          status: "VERIFIED",
          verification_score: 0.88,
          evidence_count: 2,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
        {
          claim_id: "c4",
          status: "VERIFIED",
          verification_score: 0.82,
          evidence_count: 2,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
        {
          claim_id: "c5",
          status: "PARTIALLY_VERIFIED",
          verification_score: 0.5,
          evidence_count: 1,
          confidence_impact: "WEAK_SUPPORT",
          should_influence_learning: false,
        },
      ];

      const assessment = assessVerificationQuality(strongVerifications);

      expect(assessment.verification_rate).toBeGreaterThanOrEqual(0.8); // 4/5 = 0.8
      expect(assessment.recommendation).toBe("PROCEED_WITH_LEARNING");
    });

    it("low verification rate blocks learning", () => {
      const weakVerifications: OutcomeVerification[] = [
        {
          claim_id: "c1",
          status: "CLAIMED",
          verification_score: 0,
          evidence_count: 0,
          confidence_impact: "NO_SUPPORT",
          should_influence_learning: false,
        },
        {
          claim_id: "c2",
          status: "UNVERIFIABLE",
          verification_score: 0.25,
          evidence_count: 1,
          confidence_impact: "NO_SUPPORT",
          should_influence_learning: false,
        },
      ];

      const assessment = assessVerificationQuality(weakVerifications);

      expect(assessment.verification_rate).toBeLessThan(0.5);
      expect(assessment.recommendation).toBe("BLOCK_LEARNING");
    });

    it("empty verification list recommends BLOCK_LEARNING", () => {
      const assessment = assessVerificationQuality([]);

      expect(assessment.total_claims).toBe(0);
      expect(assessment.recommendation).toBe("BLOCK_LEARNING");
    });

    it("is deterministic", () => {
      const verifications: OutcomeVerification[] = [
        {
          claim_id: "c1",
          status: "VERIFIED",
          verification_score: 0.8,
          evidence_count: 2,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
      ];

      const assessment1 = assessVerificationQuality(verifications);
      const assessment2 = assessVerificationQuality(verifications);

      expect(assessment1.verification_rate).toBe(assessment2.verification_rate);
      expect(assessment1.recommendation).toBe(assessment2.recommendation);
    });
  });

  describe("Fail-Closed Behavior - Unverified Claims Blocked", () => {
    it("unverified outcomes cannot influence learning", () => {
      const claim = createMockClaim("Unverified impact claim");
      const verification = assessOutcomeVerification(claim, []);

      expect(verification.should_influence_learning).toBe(false);
      expect(verification.status).toBe("CLAIMED");
    });

    it("weak verification blocks learning influence", () => {
      const claim = createMockClaim();
      const verification = assessOutcomeVerification(claim, [
        { id: "ev1", type: "estimate", confidence: 0.35 },
      ]);

      expect(verification.verification_score).toBeLessThan(0.7);
      expect(verification.should_influence_learning).toBe(false);
    });

    it("assessment recommends BLOCK_LEARNING when majority unverified", () => {
      const verifications: OutcomeVerification[] = [
        {
          claim_id: "c1",
          status: "CLAIMED",
          verification_score: 0,
          evidence_count: 0,
          confidence_impact: "NO_SUPPORT",
          should_influence_learning: false,
        },
        {
          claim_id: "c2",
          status: "CLAIMED",
          verification_score: 0,
          evidence_count: 0,
          confidence_impact: "NO_SUPPORT",
          should_influence_learning: false,
        },
        {
          claim_id: "c3",
          status: "VERIFIED",
          verification_score: 0.9,
          evidence_count: 3,
          confidence_impact: "STRONG_SUPPORT",
          should_influence_learning: true,
        },
      ];

      const assessment = assessVerificationQuality(verifications);

      expect(assessment.learning_eligible_rate).toBeLessThan(0.5);
      expect(assessment.recommendation).not.toBe("PROCEED_WITH_LEARNING");
    });
  });
});
