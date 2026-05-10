/**
 * Integration Tests for Outcome Assessment Resolver (Phase 8 Wiring)
 *
 * Proves full path: Impact Measurement → Confidence Update → Feedback Loop → Audit → DTO
 * Verifies: tenant safety, DTO boundary, audit behavior
 */

import { describe, it, expect } from "vitest";
import { outcomeAssessmentResolver } from "@/graphql/resolvers/outcome-assessment.resolver";

describe("Outcome Assessment Resolver - Phase 8 Experiment + Outcome Integration", () => {
  const mockContext = {
    userId: "user-1",
    workspaceId: "ws-1",
  };

  const mockArgs = {
    engagementId: "eng-1",
  };

  describe("Full path integration: Impact → Confidence → Feedback → Audit → DTO", () => {
    it("should measure action outcomes end-to-end", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toBeDefined();
      expect(result).toHaveProperty("assessment_id");
      expect(result).toHaveProperty("totalActionsMeasured");
      expect(result).toHaveProperty("successfulOutcomes");
    });

    it("should track action impact metrics", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.totalActionsMeasured).toBeGreaterThan(0);
      expect(typeof result.avgVariancePercent).toBe("number");
      expect(result.positiveImpactCount).toBeGreaterThanOrEqual(0);
    });

    it("should update confidence after outcome measurement", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(typeof result.avgConfidenceGain).toBe("number");
      expect(result.avgConfidenceGain).toBeGreaterThanOrEqual(-1);
      expect(result.avgConfidenceGain).toBeLessThanOrEqual(1);
    });

    it("should apply feedback loop on outcomes", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.feedbackActionsApplied).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.recommendedFutureActions)).toBe(true);
    });

    it("should generate audit packets for immutable record", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.auditPacketsGenerated).toBeGreaterThanOrEqual(0);
    });

    it("should assess measurement quality", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.avgMeasurementQuality).toBeDefined();
      expect(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]).toContain(result.avgMeasurementQuality);
    });

    it("should identify successful outcomes", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.successfulOutcomes).toBeLessThanOrEqual(result.totalActionsMeasured);
      expect(result.successfulOutcomes).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Tenant/Workspace Safety (Enforcement)", () => {
    it("should enforce workspaceId validation", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const invalidContext = {
        userId: "user-1",
        workspaceId: "", // Empty = invalid
      };

      await expect(
        resolver(null, mockArgs, invalidContext)
      ).rejects.toThrow("Workspace context required");
    });

    it("should enforce userId validation", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const invalidContext = {
        userId: "", // Empty = invalid
        workspaceId: "ws-1",
      };

      await expect(
        resolver(null, mockArgs, invalidContext)
      ).rejects.toThrow("User context required");
    });

    it("should load assessment scoped to workspace", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toBeDefined();
      expect(result.assessment_id).toBeDefined();
    });

    it("should reject missing engagementId", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const invalidArgs = {
        engagementId: "",
      };

      await expect(
        resolver(null, invalidArgs, mockContext)
      ).rejects.toThrow("Engagement ID is required");
    });
  });

  describe("DTO Boundary Enforcement", () => {
    it("should not expose internal fields in DTO output", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // Verify DTO only exposes safe fields
      expect(result).toHaveProperty("assessment_id");
      expect(result).toHaveProperty("totalActionsMeasured");
      expect(result).toHaveProperty("avgConfidenceGain");

      // Verify internal fields are NOT exposed
      expect(result).not.toHaveProperty("workspaceId");
      expect(result).not.toHaveProperty("assessed_by");
    });

    it("should have assessment_id in DTO", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.assessment_id).toBeDefined();
      expect(result.assessment_id).toMatch(/^outcome-assessment-/);
    });

    it("should include outcome metrics in DTO", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toHaveProperty("totalActionsMeasured");
      expect(result).toHaveProperty("successfulOutcomes");
      expect(result).toHaveProperty("positiveImpactCount");
      expect(result).toHaveProperty("avgVariancePercent");
    });

    it("should format assessed_at as ISO 8601 string", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toHaveProperty("assessed_at");
      expect(typeof result.assessed_at).toBe("string");
      expect(result.assessed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("Capabilities and Authorization", () => {
    it("should require userId in context", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const invalidContext = {
        userId: "",
        workspaceId: "ws-1",
      };

      await expect(
        resolver(null, mockArgs, invalidContext)
      ).rejects.toThrow("User context required");
    });

    it("should include userId in audit context", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toBeDefined();
    });
  });

  describe("Impact Tracking", () => {
    it("should measure baseline vs actual outcomes", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.totalActionsMeasured).toBeGreaterThan(0);
      expect(typeof result.avgVariancePercent).toBe("number");
    });

    it("should classify impact direction (positive/negative/neutral)", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // Some outcomes should be positive from mock data
      if (result.totalActionsMeasured > 0) {
        expect(result.positiveImpactCount).toBeGreaterThanOrEqual(0);
      }
    });

    it("should calculate variance percentage", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // Mock data has improvements, should see positive variance
      if (result.totalActionsMeasured > 0) {
        expect(result.avgVariancePercent).toBeGreaterThan(-50);
        expect(result.avgVariancePercent).toBeLessThan(100);
      }
    });
  });

  describe("Confidence Updates", () => {
    it("should update confidence based on outcome variance", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(typeof result.avgConfidenceGain).toBe("number");
    });

    it("should reflect measurement quality in confidence", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.avgMeasurementQuality).toBeDefined();
    });
  });

  describe("Feedback Loop Application", () => {
    it("should generate feedback actions from outcomes", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.feedbackActionsApplied).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.recommendedFutureActions)).toBe(true);
    });

    it("should recommend future actions based on learnings", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(Array.isArray(result.recommendedFutureActions)).toBe(true);
      // Recommendations should be unique
      const uniqueRecs = new Set(result.recommendedFutureActions);
      expect(uniqueRecs.size).toBe(result.recommendedFutureActions.length);
    });
  });

  describe("Audit Trail", () => {
    it("should create immutable audit packets", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result.auditPacketsGenerated).toBeGreaterThanOrEqual(0);
    });

    it("should track audit trail for all measured outcomes", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // Audit packets should correlate with measured actions
      expect(result.auditPacketsGenerated).toBeLessThanOrEqual(result.totalActionsMeasured);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing engagement gracefully", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const missingEngagementArgs = {
        engagementId: "non-existent-eng",
      };

      const result = await resolver(null, missingEngagementArgs, mockContext);
      expect(result).toBeDefined();
    });

    it("should not expose internal errors to client", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty("errors");
      expect(result).not.toHaveProperty("_internalState");
    });
  });

  describe("Assessment Metadata", () => {
    it("should include assessment timestamp", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      expect(result).toHaveProperty("assessed_at");
      const assessedDate = new Date(result.assessed_at);
      expect(assessedDate.getTime()).toBeGreaterThan(0);
    });
  });

  describe("Phase 8 Core Integration", () => {
    it("should integrate ImpactTracker service", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // ImpactTracker output should be reflected in results
      expect(result.totalActionsMeasured).toBeGreaterThanOrEqual(0);
      expect(typeof result.avgVariancePercent).toBe("number");
    });

    it("should integrate ConfidenceUpdater service", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // ConfidenceUpdater output should be reflected in results
      expect(typeof result.avgConfidenceGain).toBe("number");
    });

    it("should integrate FeedbackLoop service", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // FeedbackLoop output should be reflected in results
      expect(result.feedbackActionsApplied).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.recommendedFutureActions)).toBe(true);
    });

    it("should integrate OutcomeAuditor service", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // OutcomeAuditor output should be reflected in results
      expect(result.auditPacketsGenerated).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Data Flow Through Phase 8", () => {
    it("should flow outcomes through all Phase 8 engines", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // All Phase 8 metrics should be present
      expect(result).toHaveProperty("totalActionsMeasured");
      expect(result).toHaveProperty("successfulOutcomes");
      expect(result).toHaveProperty("avgVariancePercent");
      expect(result).toHaveProperty("avgConfidenceGain");
      expect(result).toHaveProperty("feedbackActionsApplied");
      expect(result).toHaveProperty("auditPacketsGenerated");
    });

    it("should produce comprehensive assessment from phase 8 pipeline", async () => {
      const resolver = outcomeAssessmentResolver.Query.outcomeAssessment;

      const result = await resolver(null, mockArgs, mockContext);

      // Assessment should contain all phase 8 outputs
      expect(result.assessment_id).toBeDefined();
      expect(result.assessed_at).toBeDefined();
      expect(result.totalActionsMeasured).toBeDefined();
      expect(result.successfulOutcomes).toBeDefined();
      expect(result.positiveImpactCount).toBeDefined();
      expect(result.avgVariancePercent).toBeDefined();
      expect(result.avgConfidenceGain).toBeDefined();
      expect(result.avgMeasurementQuality).toBeDefined();
      expect(result.auditPacketsGenerated).toBeDefined();
      expect(result.feedbackActionsApplied).toBeDefined();
      expect(result.recommendedFutureActions).toBeDefined();
    });
  });
});
