import { describe, it, expect } from "vitest";
import { recommendationTruthContract } from "../recommendation-truth-contract";

describe("RecommendationTruthContract", () => {
  describe("Generic recommendation rejection", () => {
    it("should reject recommendation with missing title", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "",
        description: "Valid description here",
        rationale: "Valid rationale with good length",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget", "Timeline"],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "ANTI_GENERIC_TITLE")).toBe(true);
    });

    it("should reject recommendation with missing description", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "",
        rationale: "Valid rationale with good length",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "ANTI_GENERIC_DESCRIPTION")).toBe(true);
    });

    it("should reject recommendation with insufficient rationale", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "Too short",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "ANTI_GENERIC_RATIONALE")).toBe(true);
    });
  });

  describe("Rollback requirement validation", () => {
    it("should reject recommendation without rollback plan", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "",
        constraintsConsidered: ["Budget"],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "ROLLBACK_REQUIRED")).toBe(true);
    });

    it("should accept recommendation with valid rollback plan", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state if issues occur",
        constraintsConsidered: ["Budget"],
      });

      expect(result.violations.filter((v) => v.rule === "ROLLBACK_REQUIRED")).toHaveLength(0);
    });
  });

  describe("Constraint awareness validation", () => {
    it("should reject recommendation without constraints", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: [],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "CONSTRAINTS_REQUIRED")).toBe(true);
    });

    it("should accept recommendation with constraints identified", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget constraint", "Timeline constraint"],
      });

      expect(result.violations.filter((v) => v.rule === "CONSTRAINTS_REQUIRED")).toHaveLength(0);
    });
  });

  describe("Confidence state validation", () => {
    it("should accept valid confidence states", async () => {
      const validStates = [
        "HIGH_CONFIDENCE",
        "MEDIUM_CONFIDENCE",
        "LOW_CONFIDENCE",
        "NEED_MORE_DATA",
        "CANNOT_DETERMINE",
        "DANGER_DO_NOT_ACT",
      ];

      for (const state of validStates) {
        const result = await recommendationTruthContract.validateTruthContract({
          title: "Action item",
          description: "This is a good description with substance",
          rationale: "This is a good rationale with sufficient length and detail",
          priority: "high",
          rollbackPlan: "Revert to previous state",
          constraintsConsidered: ["Budget"],
          confidenceLevel: state as any,
        });

        expect(result.violations.filter((v) => v.rule === "INVALID_CONFIDENCE_STATE")).toHaveLength(0);
      }
    });

    it("should reject invalid confidence state", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
        confidenceLevel: "INVALID_STATE" as any,
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "INVALID_CONFIDENCE_STATE")).toBe(true);
    });
  });

  describe("AI proposal containment", () => {
    it("should reject AI proposal with DANGER_DO_NOT_ACT confidence", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
        isAIProposal: true,
        confidenceLevel: "DANGER_DO_NOT_ACT",
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "AI_PROPOSAL_SANDBOX")).toBe(true);
    });

    it("should accept AI proposal with safe confidence level", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
        isAIProposal: true,
        confidenceLevel: "MEDIUM_CONFIDENCE",
      });

      expect(result.violations.filter((v) => v.rule === "AI_PROPOSAL_SANDBOX")).toHaveLength(0);
    });
  });

  describe("Expiration enforcement", () => {
    it("should reject recommendation with expired date", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
        expiresAt: pastDate,
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "RECOMMENDATION_EXPIRED")).toBe(true);
    });

    it("should accept recommendation with future expiration date", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const result = await recommendationTruthContract.validateTruthContract({
        title: "Action item",
        description: "This is a good description with substance",
        rationale: "This is a good rationale with sufficient length and detail",
        priority: "high",
        rollbackPlan: "Revert to previous state",
        constraintsConsidered: ["Budget"],
        expiresAt: futureDate,
      });

      expect(result.violations.filter((v) => v.rule === "RECOMMENDATION_EXPIRED")).toHaveLength(0);
    });
  });

  describe("Explainability enforcement", () => {
    it("should reject recommendation with insufficient total explanation", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Item",
        description: "Short",
        rationale: "Too brief",
        priority: "high",
        rollbackPlan: "Revert",
        constraintsConsidered: ["Budget"],
      });

      expect(result.isValid).toBe(false);
      expect(result.violations.some((v) => v.rule === "INSUFFICIENT_EXPLANATION")).toBe(true);
    });

    it("should accept recommendation with sufficient explanation", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Implement new pricing strategy to improve revenue",
        description: "This is a detailed description with substantial content about the recommendation",
        rationale: "This is a comprehensive rationale explaining why this action should be taken now",
        priority: "high",
        rollbackPlan: "Revert to previous pricing if targets not met",
        constraintsConsidered: ["Budget", "Timeline", "Competitive landscape"],
      });

      expect(result.violations.filter((v) => v.rule === "INSUFFICIENT_EXPLANATION")).toHaveLength(0);
    });
  });

  describe("Full valid recommendation", () => {
    it("should pass all Phase 0 validations", async () => {
      const result = await recommendationTruthContract.validateTruthContract({
        title: "Implement customer retention program",
        description: "Launch a comprehensive retention program targeting high-value customers with personalized engagement",
        rationale: "Data shows 40% of at-risk customers churn within 6 months. Retention costs 5x less than acquisition. This targets our margin-critical segment.",
        priority: "high",
        rollbackPlan: "Sunset program if adoption below 20% within 90 days and reinvest in acquisition",
        constraintsConsidered: ["Budget", "Resource capacity", "Timeline", "Competitive response"],
        confidenceLevel: "MEDIUM_CONFIDENCE",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });
});
