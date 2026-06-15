/**
 * B21-S1: Controlled Learning From Every Output — Unit Tests
 *
 * Tests learning observation creation, validation, and hard rules enforcement.
 */

import {
  validateLearningObservation,
  canLearnFromObservation,
  scoreObservation,
  extractCommonPatterns,
  requireAdminApprovalForPromotion,
  type LearningObservation,
} from "@/domain/benchmark/learning-observation";
import {
  getAllSampleObservations,
  getSampleObservation,
  createObservation,
  evaluateForLearning,
  checkAdminApprovalRequirement,
  analyzeBatchObservations,
  promoteObservationToRule,
} from "@/services/benchmark/learning-observation.service";

describe("B21-S1 — Controlled Learning From Every Output", () => {
  describe("Sample Observations", () => {
    it("should create 3 sample observations", () => {
      const samples = getAllSampleObservations();
      expect(samples).toHaveLength(3);
    });

    it("should have unique observation IDs", () => {
      const samples = getAllSampleObservations();
      const ids = samples.map((o) => o.observation_id);
      expect(new Set(ids).size).toBe(3);
    });

    it("should retrieve sample by ID", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).not.toBeNull();
      expect(obs?.observation_id).toBe("obs_success_001");
    });

    it("should return null for unknown ID", () => {
      const obs = getSampleObservation("unknown");
      expect(obs).toBeNull();
    });

    it("successful observation should be verified", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs?.outcome_verified).toBe(true);
      expect(obs?.actual_outcome?.status).toBe("full_success");
    });

    it("partial observation should be verified with partial success", () => {
      const obs = getSampleObservation("obs_partial_001");
      expect(obs?.outcome_verified).toBe(true);
      expect(obs?.actual_outcome?.status).toBe("partial_success");
    });

    it("unverified observation should not have outcome", () => {
      const obs = getSampleObservation("obs_unverified_001");
      expect(obs?.outcome_verified).toBe(false);
      expect(obs?.actual_outcome).toBeUndefined();
    });
  });

  describe("Validation", () => {
    it("should validate sample observations", () => {
      const samples = getAllSampleObservations();
      for (const obs of samples) {
        const validation = validateLearningObservation(obs);
        // Unverified observation may not have actual_outcome, which is ok
        if (obs.outcome_verified) {
          expect(validation.valid).toBe(true);
        }
      }
    });

    it("should reject observation without diagnosis_id", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      const invalid = { ...obs, diagnosis_id: "" };
      const validation = validateLearningObservation(invalid!);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Diagnosis ID"))).toBe(true);
    });

    it("should reject observation without business context", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      const invalid = { ...obs, business_context: undefined };
      const validation = validateLearningObservation(invalid!);
      expect(validation.valid).toBe(false);
    });

    it("should reject observation without recommendations", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      const invalid = { ...obs, recommendations_given: [] };
      const validation = validateLearningObservation(invalid!);
      expect(validation.valid).toBe(false);
    });
  });

  describe("Hard Rule: No Learning From Unverified Outcomes", () => {
    it("should block learning from unverified observations", () => {
      const obs = getSampleObservation("obs_unverified_001");
      expect(obs).toBeDefined();
      const result = canLearnFromObservation(obs!);
      expect(result.can_learn).toBe(false);
      expect(result.signal_strength).toBe("weak");
    });

    it("should allow learning from verified observations", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      const result = canLearnFromObservation(obs!);
      expect(result.can_learn).toBe(true);
      expect(result.signal_strength).toBe("strong");
    });

    it("should allow learning from verified failed outcomes", () => {
      const obs = getSampleObservation("obs_unverified_001");
      expect(obs).toBeDefined();
      const modified = {
        ...obs!,
        outcome_verified: true,
        actual_outcome: {
          status: "failed" as const,
          metrics_changed: [],
          success_metrics: [],
          failure_metrics: ["all"],
          owner_assessment: "Failed",
        },
      };
      const result = canLearnFromObservation(modified);
      expect(result.can_learn).toBe(true);
      expect(result.signal_strength).toBe("strong");
    });

    it("should distinguish learning signal strength", () => {
      const success = getSampleObservation("obs_success_001");
      const partial = getSampleObservation("obs_partial_001");
      expect(success).toBeDefined();
      expect(partial).toBeDefined();

      const successSignal = canLearnFromObservation(success!);
      const partialSignal = canLearnFromObservation(partial!);

      expect(successSignal.signal_strength).toBe("strong");
      expect(partialSignal.signal_strength).toBe("weak"); // Partial success is ambiguous
    });
  });

  describe("Hard Rule: Admin Approval Required", () => {
    it("should require admin approval for all rule changes", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      expect(obs?.rule_change_candidates.length).toBeGreaterThan(0);

      for (const candidate of obs!.rule_change_candidates) {
        const approval = requireAdminApprovalForPromotion(candidate);
        expect(approval.requires_approval).toBe(true);
      }
    });

    it("should assess rule change risk level", () => {
      const obs = getSampleObservation("obs_partial_001");
      expect(obs).toBeDefined();

      const approval = checkAdminApprovalRequirement(obs!);
      expect(approval.requires_approval).toBe(true);
      expect(Object.values(approval.risk_levels).length).toBeGreaterThan(0);
    });

    it("should prevent promotion without admin approval", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      const result = promoteObservationToRule(obs!, false, "admin_id");
      expect(result.success).toBe(false);
      expect(result.reason).toContain("Admin approval");
    });

    it("should allow promotion with admin approval", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      const result = promoteObservationToRule(obs!, true, "admin_123");
      expect(result.success).toBe(true);
      expect(result.new_status).toBe("approved");
    });
  });

  describe("Observation Scoring", () => {
    it("should score successful observation highly", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      const scores = scoreObservation(obs!);
      expect(scores.accuracy_score).toBeGreaterThan(80);
      expect(scores.outcome_alignment).toBeGreaterThanOrEqual(90);
      expect(scores.learning_value).toBeGreaterThan(50);
    });

    it("should score partial observation moderately", () => {
      const obs = getSampleObservation("obs_partial_001");
      expect(obs).toBeDefined();
      const scores = scoreObservation(obs!);
      expect(scores.accuracy_score).toBeGreaterThan(30);
      expect(scores.accuracy_score).toBeLessThan(70);
      expect(scores.outcome_alignment).toBeGreaterThan(0);
      expect(scores.outcome_alignment).toBeLessThan(70);
    });

    it("should score unverified observation with low learning value", () => {
      const obs = getSampleObservation("obs_unverified_001");
      expect(obs).toBeDefined();
      const scores = scoreObservation(obs!);
      expect(scores.learning_value).toBeLessThan(30); // Unverified has low value
    });

    it("should keep all scores in valid ranges", () => {
      const samples = getAllSampleObservations();
      for (const obs of samples) {
        const scores = scoreObservation(obs);
        expect(scores.accuracy_score).toBeGreaterThanOrEqual(0);
        expect(scores.accuracy_score).toBeLessThanOrEqual(100);
        expect(scores.outcome_alignment).toBeGreaterThanOrEqual(0);
        expect(scores.outcome_alignment).toBeLessThanOrEqual(100);
        expect(scores.learning_value).toBeGreaterThanOrEqual(0);
        expect(scores.learning_value).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Lesson Extraction", () => {
    it("should extract lessons from observations", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      expect(obs?.lessons_learned.length).toBeGreaterThan(0);
    });

    it("should categorize lessons", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();
      for (const lesson of obs!.lessons_learned) {
        expect([
          "root_cause_pattern",
          "recommendation_pattern",
          "data_quality_pattern",
          "constraint_pattern",
        ]).toContain(lesson.category);
      }
    });

    it("should assign confidence to lessons", () => {
      const obs = getSampleObservation("obs_partial_001");
      expect(obs).toBeDefined();
      for (const lesson of obs!.lessons_learned) {
        expect(lesson.confidence).toBeGreaterThanOrEqual(0);
        expect(lesson.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("should extract common patterns from batch", () => {
      const samples = getAllSampleObservations();
      const patterns = extractCommonPatterns(samples);

      expect(patterns.success_patterns).toBeDefined();
      expect(patterns.failure_patterns).toBeDefined();
      expect(patterns.data_quality_impact).toBeDefined();
      expect(Array.isArray(patterns.constraint_violations)).toBe(true);
    });
  });

  describe("Learning Service", () => {
    it("should create observation with validation", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      const result = createObservation(obs!);
      expect(result.success).toBe(true);
      expect(result.observation).toBeDefined();
    });

    it("should reject invalid observation", () => {
      const invalid = {
        observation_id: "test",
        diagnosis_id: "",
        created_at: new Date(),
      } as any;

      const result = createObservation(invalid);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should evaluate observation for learning", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      const evaluation = evaluateForLearning(obs!);
      expect(evaluation.can_learn).toBe(true);
      expect(evaluation.scores.accuracy).toBeGreaterThan(0);
      expect(evaluation.scores.alignment).toBeGreaterThan(0);
    });

    it("should batch analyze observations", () => {
      const samples = getAllSampleObservations();
      const analysis = analyzeBatchObservations(samples);

      expect(analysis.total_observations).toBe(3);
      expect(analysis.verified_count).toBeGreaterThan(0);
      expect(analysis.success_count).toBeGreaterThan(0);
      expect(analysis.pending_promotion_candidates).toBeDefined();
    });
  });

  describe("Determinism", () => {
    it("should produce identical scores for same observation", () => {
      const obs1 = getSampleObservation("obs_success_001");
      const obs2 = getSampleObservation("obs_success_001");

      const scores1 = scoreObservation(obs1!);
      const scores2 = scoreObservation(obs2!);

      expect(scores1.accuracy_score).toBe(scores2.accuracy_score);
      expect(scores1.outcome_alignment).toBe(scores2.outcome_alignment);
      expect(scores1.learning_value).toBe(scores2.learning_value);
    });

    it("should produce consistent learning decisions", () => {
      const obs = getSampleObservation("obs_unverified_001");

      const decision1 = canLearnFromObservation(obs!);
      const decision2 = canLearnFromObservation(obs!);

      expect(decision1.can_learn).toBe(decision2.can_learn);
      expect(decision1.signal_strength).toBe(decision2.signal_strength);
    });
  });

  describe("Integration: Full workflow", () => {
    it("should demonstrate learning workflow for successful case", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      // 1. Validate observation
      const validation = validateLearningObservation(obs!);
      expect(validation.valid).toBe(true);

      // 2. Evaluate for learning
      const learning = canLearnFromObservation(obs!);
      expect(learning.can_learn).toBe(true);

      // 3. Score observation
      const scores = scoreObservation(obs!);
      expect(scores.accuracy_score).toBeGreaterThan(50);

      // 4. Check for rule change candidates
      const approval = checkAdminApprovalRequirement(obs!);
      expect(approval.requires_approval).toBe(true);

      // 5. Admin must approve promotion
      const promotion = promoteObservationToRule(obs!, true, "admin_user");
      expect(promotion.success).toBe(true);
    });

    it("should demonstrate hard rule: no auto-promotion", () => {
      const obs = getSampleObservation("obs_success_001");
      expect(obs).toBeDefined();

      // Without admin approval, promotion fails
      const result = promoteObservationToRule(obs!, false, "user");
      expect(result.success).toBe(false);
      expect(result.reason).toContain("Admin approval");
    });

    it("should demonstrate hard rule: no learning from unverified outcomes", () => {
      const samples = getAllSampleObservations();
      const unverified = samples.filter((o) => !o.outcome_verified);

      for (const obs of unverified) {
        const learning = canLearnFromObservation(obs);
        expect(learning.can_learn).toBe(false);
        expect(learning.signal_strength).toBe("weak");
      }
    });

    it("should batch analyze and identify promotion candidates", () => {
      const samples = getAllSampleObservations();
      const analysis = analyzeBatchObservations(samples);

      expect(analysis.total_observations).toBe(3);

      // All pending candidates require approval
      for (const candidate of analysis.pending_promotion_candidates) {
        const approval = requireAdminApprovalForPromotion(candidate);
        expect(approval.requires_approval).toBe(true);
      }
    });
  });
});
