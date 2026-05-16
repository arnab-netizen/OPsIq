/**
 * Service Tests: Experiment Lifecycle
 *
 * Validates experiment state transitions, validation enforcement,
 * error handling, and business logic for the complete experiment lifecycle.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createExperiment,
  approveExperiment,
  startExperiment,
  updateExecution,
  recordResult,
  captureLearning,
  analyzeOutcome,
  generateSummary,
  ExperimentLifecycleError,
} from "@/services/experiment/experiment-lifecycle.service";
import type {
  Experiment,
  ExperimentPlan,
  Hypothesis,
  ExperimentExecution,
  ExperimentResult,
  ExperimentLearning,
} from "@/domain/experiment/experiment";

// Mock audit and logger
vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const baseHypothesis: Hypothesis = {
  statement: "If we implement feature X, then CSAT will improve by 15%",
  type: "retention_improvement",
  successCriterion: "Increase CSAT by 15%",
  successThreshold: 15,
  successMetric: "csat_score",
  failureRisk: "Could reduce CSAT",
  failureThreshold: -20,
  testDurationWeeks: 4,
  reviewCadenceWeeks: 1,
};

const basePlan: ExperimentPlan = {
  hypothesis: baseHypothesis,
  actionDescription: "Implement feature X to improve onboarding experience",
  targetAudience: "US SMB customers",
  controlGroup: "EU SMB customers",
  primaryMetric: "csat_score",
  secondaryMetrics: ["nps_score", "retention_rate"],
  confoundingFactors: ["seasonality"],
  estimatedCost: 15000,
  estimatedEffort: "80 hours",
  requiredCapabilities: ["product"],
  dependencies: [],
  requiredApprovals: ["product_lead"],
  riskLevel: "medium",
  rigorLevel: "standard",
};

describe("Experiment Lifecycle Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createExperiment", () => {
    it("should create experiment in draft status", async () => {
      const experiment = await createExperiment(
        "ws-123",
        "eng-456",
        basePlan,
        "Q2 Onboarding Test",
        "Test for onboarding improvements",
        "dec-789",
        undefined,
        undefined,
        "user-100"
      );

      expect(experiment.status).toBe("draft");
      expect(experiment.workspaceId).toBe("ws-123");
      expect(experiment.engagementId).toBe("eng-456");
      expect(experiment.name).toBe("Q2 Onboarding Test");
      expect(experiment.linkedDecisionId).toBe("dec-789");
      expect(experiment.createdBy).toBe("user-100");
    });

    it("should reject invalid plan", async () => {
      const invalidPlan = { ...basePlan, hypothesis: { ...baseHypothesis, testDurationWeeks: 0 } };

      expect(
        createExperiment("ws-123", "eng-456", invalidPlan, "Test", undefined, undefined, undefined, undefined, "user-100")
      ).rejects.toThrow("Plan validation failed");
    });

    it("should reject short experiment name", async () => {
      expect(
        createExperiment("ws-123", "eng-456", basePlan, "Test", undefined, undefined, undefined, undefined, "user-100")
      ).rejects.toThrow("name must be at least 5 characters");
    });

    it("should emit EXPERIMENT_CREATED audit event", async () => {
      await createExperiment(
        "ws-123",
        "eng-456",
        basePlan,
        "Q2 Onboarding Test",
        undefined,
        undefined,
        undefined,
        undefined,
        "user-100"
      );

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.created",
          actorId: "user-100",
          entityType: "Experiment",
        })
      );
    });
  });

  describe("approveExperiment", () => {
    it("should transition from draft to approved", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      const approved = await approveExperiment(experiment, "ws-123", "user-100");

      expect(approved.status).toBe("approved");
      expect(approved.updatedAt.getTime()).toBeGreaterThanOrEqual(experiment.createdAt.getTime());
    });

    it("should reject approval if not in draft status", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      const approved = await approveExperiment(experiment, "ws-123", "user-100");

      expect(
        approveExperiment(approved, "ws-123", "user-100")
      ).rejects.toThrow("Cannot approve experiment in approved status");
    });

    it("should reject if workspace does not match", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");

      expect(
        approveExperiment(experiment, "ws-different", "user-100")
      ).rejects.toThrow("workspace does not match");
    });

    it("should require approvals for critical-risk experiments", async () => {
      const criticalPlan = { ...basePlan, riskLevel: "critical" as const, requiredApprovals: [] };

      expect(
        createExperiment("ws-123", "eng-456", criticalPlan, "Critical Test", undefined, undefined, undefined, undefined, "user-100")
      ).rejects.toThrow("Critical-risk experiments must have required approvals");
    });

    it("should emit EXPERIMENT_APPROVED audit event", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      await approveExperiment(experiment, "ws-123", "user-100");

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.approved",
          actorId: "user-100",
        })
      );
    });
  });

  describe("startExperiment", () => {
    it("should transition from approved to active", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      const active = await startExperiment(experiment, "ws-123", "user-100");

      expect(active.status).toBe("active");
      expect(active.execution).toBeDefined();
      expect(active.execution?.startedAt).toBeDefined();
      expect(active.execution?.percentComplete).toBe(0);
    });

    it("should reject if not in approved status", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");

      expect(
        startExperiment(experiment, "ws-123", "user-100")
      ).rejects.toThrow("Cannot start experiment in draft status");
    });

    it("should set target end date based on test duration", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      const active = await startExperiment(experiment, "ws-123", "user-100");

      const expectedDays = baseHypothesis.testDurationWeeks * 7;
      expect(active.execution?.daysRemaining).toBe(expectedDays);
    });

    it("should emit EXPERIMENT_STARTED audit event", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      await startExperiment(experiment, "ws-123", "user-100");

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.started",
          actorId: "user-100",
        })
      );
    });
  });

  describe("updateExecution", () => {
    it("should update progress percentage", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const updated = await updateExecution(experiment, { percentComplete: 50, daysElapsed: 14, daysRemaining: 14 }, "ws-123", "user-100");
      expect(updated.execution?.percentComplete).toBe(50);
    });

    it("should reject for non-active experiments", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");

      expect(
        updateExecution(experiment, { percentComplete: 50 }, "ws-123", "user-100")
      ).rejects.toThrow("Cannot update execution for experiment in draft status");
    });

    it("should support early stopping", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const updated = await updateExecution(
        experiment,
        {
          percentComplete: 75,
          stoppedEarly: true,
          stoppingReason: "Success achieved early",
        },
        "ws-123",
        "user-100"
      );

      expect(updated.execution?.stoppedEarly).toBe(true);
      expect(updated.status).toBe("completed");
    });

    it("should emit EXPERIMENT_PROGRESS_UPDATED audit event", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      await updateExecution(experiment, { percentComplete: 50 }, "ws-123", "user-100");

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.progress_updated",
          actorId: "user-100",
        })
      );
    });
  });

  describe("recordResult", () => {
    it("should record result and transition to analyzed", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");
      experiment = await updateExecution(experiment, { percentComplete: 100 }, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {
          nps_score: { value: 52, change: 12, trend: "increasing" },
        },
        actualCost: 14500,
        roi: 290,
        confidenceLevel: 92,
        dataQuality: "high",
      };

      const analyzed = await recordResult(experiment, result, "ws-123", "user-100");

      expect(analyzed.status).toBe("analyzed");
      expect(analyzed.result).toEqual(result);
    });

    it("should reject if result invalid", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const invalidResult: ExperimentResult = {
        classification: "success",
        successThresholdMet: false, // Contradiction
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      expect(
        recordResult(experiment, invalidResult, "ws-123", "user-100")
      ).rejects.toThrow("Result validation failed");
    });

    it("should emit EXPERIMENT_RESULT_RECORDED audit event", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      await recordResult(experiment, result, "ws-123", "user-100");

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.result_recorded",
          actorId: "user-100",
        })
      );
    });
  });

  describe("captureLearning", () => {
    it("should capture learning and transition to archived", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      experiment = await recordResult(experiment, result, "ws-123", "user-100");

      const learning: ExperimentLearning = {
        keyFinding: "The new onboarding flow significantly improved user satisfaction scores.",
        implications: "Users value simplified processes over feature-rich but complex flows.",
        confidence: "high",
        nextAction: "Scale to all customer segments",
        priorityAfterLearning: "critical",
      };

      const archived = await captureLearning(experiment, learning, "ws-123", "user-100");

      expect(archived.status).toBe("archived");
      expect(archived.learning).toEqual(learning);
    });

    it("should reject if result not recorded", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const learning: ExperimentLearning = {
        keyFinding: "Finding",
        implications: "Implications",
        confidence: "high",
      };

      expect(
        captureLearning(experiment, learning, "ws-123", "user-100")
      ).rejects.toThrow("Must record result before capturing learning");
    });

    it("should require substantial learning statement", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      experiment = await recordResult(experiment, result, "ws-123", "user-100");

      const invalidLearning: ExperimentLearning = {
        keyFinding: "short",
        implications: "short",
        confidence: "high",
      };

      expect(
        captureLearning(experiment, invalidLearning, "ws-123", "user-100")
      ).rejects.toThrow("Key finding must be at least 10 characters");
    });

    it("should emit EXPERIMENT_LEARNING_RECORDED audit event", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      experiment = await recordResult(experiment, result, "ws-123", "user-100");

      const learning: ExperimentLearning = {
        keyFinding: "The new onboarding flow significantly improved user satisfaction.",
        implications: "Users value simplified processes over complex flows.",
        confidence: "high",
        nextAction: "Scale to all segments",
      };

      await captureLearning(experiment, learning, "ws-123", "user-100");

      const { emitAuditEvent } = await import("@/infra/audit");
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "experiment.learning_recorded",
          actorId: "user-100",
        })
      );
    });
  });

  describe("analyzeOutcome", () => {
    it("should classify as success when threshold met", () => {
      let experiment = { id: "exp-1", workspaceId: "ws-123", engagementId: "eng-456", status: "analyzed" as const, name: "Test" } as Experiment;
      experiment.plan = basePlan;
      experiment.result = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      const analysis = analyzeOutcome(experiment);

      expect(analysis.classification).toBe("success");
      expect(analysis.interpretation).toContain("Met success threshold");
    });

    it("should classify as partial when between thresholds", () => {
      let experiment = { id: "exp-1", workspaceId: "ws-123", engagementId: "eng-456", status: "analyzed" as const, name: "Test" } as Experiment;
      experiment.plan = basePlan;
      experiment.result = {
        classification: "partial",
        successThresholdMet: false,
        primaryMetricValue: 80,
        primaryMetricChange: 8,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 50,
        dataQuality: "high",
      };

      const analysis = analyzeOutcome(experiment);

      expect(analysis.classification).toBe("partial");
      expect(analysis.interpretation).toContain("Partial success");
    });

    it("should classify as failure when below failure threshold", () => {
      let experiment = { id: "exp-1", workspaceId: "ws-123", engagementId: "eng-456", status: "analyzed" as const, name: "Test" } as Experiment;
      experiment.plan = basePlan;
      experiment.result = {
        classification: "failure",
        successThresholdMet: false,
        primaryMetricValue: 65,
        primaryMetricChange: -25,
        primaryMetricTrend: "decreasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: -50,
        dataQuality: "high",
      };

      const analysis = analyzeOutcome(experiment);

      expect(analysis.classification).toBe("failure");
      expect(analysis.interpretation).toContain("Failed");
    });

    it("should override to inconclusive if confidence low", () => {
      let experiment = { id: "exp-1", workspaceId: "ws-123", engagementId: "eng-456", status: "analyzed" as const, name: "Test" } as Experiment;
      experiment.plan = basePlan;
      experiment.result = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        confidenceLevel: 50,
        dataQuality: "medium",
      };

      const analysis = analyzeOutcome(experiment);

      expect(analysis.classification).toBe("inconclusive");
      expect(analysis.nextSteps).toContainEqual(expect.stringContaining("Confidence level is low"));
    });
  });

  describe("generateSummary", () => {
    it("should generate summary for draft experiment", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Q2 Test", undefined, undefined, undefined, undefined, "user-100");

      const summary = generateSummary(experiment);

      expect(summary).toContain("Q2 Test");
      expect(summary).toContain("draft");
      expect(summary).toContain("Hypothesis:");
    });

    it("should include result in summary", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      experiment = await recordResult(experiment, result, "ws-123", "user-100");
      const summary = generateSummary(experiment);

      expect(summary).toContain("success");
      expect(summary).toContain("Result:");
    });

    it("should include learning in summary", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      experiment = await recordResult(experiment, result, "ws-123", "user-100");

      const learning: ExperimentLearning = {
        keyFinding: "The new flow works better.",
        implications: "Users prefer simpler processes.",
        confidence: "high",
        nextAction: "Scale widely",
      };

      experiment = await captureLearning(experiment, learning, "ws-123", "user-100");
      const summary = generateSummary(experiment);

      expect(summary).toContain("The new flow works better");
      expect(summary).toContain("Scale widely");
    });
  });

  describe("Workspace Isolation", () => {
    it("should reject operations with mismatched workspace", async () => {
      const experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");

      expect(
        approveExperiment(experiment, "ws-different", "user-100")
      ).rejects.toThrow("workspace does not match");
    });

    it("should reject result recording with mismatched workspace", async () => {
      let experiment = await createExperiment("ws-123", "eng-456", basePlan, "Test Exp", undefined, undefined, undefined, undefined, "user-100");
      experiment = await approveExperiment(experiment, "ws-123", "user-100");
      experiment = await startExperiment(experiment, "ws-123", "user-100");

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      expect(
        recordResult(experiment, result, "ws-different", "user-100")
      ).rejects.toThrow("workspace does not match");
    });
  });

  describe("State Machine Enforc Transitions", () => {
    it("should enforce draft → approved → active → completed → analyzed → archived", async () => {
      let exp = await createExperiment("ws-123", "eng-456", basePlan, "TestExp", undefined, undefined, undefined, undefined, "u-1");
      expect(exp.status).toBe("draft");

      exp = await approveExperiment(exp, "ws-123", "u-1");
      expect(exp.status).toBe("approved");

      exp = await startExperiment(exp, "ws-123", "u-1");
      expect(exp.status).toBe("active");

      exp = await updateExecution(exp, { percentComplete: 100 }, "ws-123", "u-1");
      expect(exp.status).toBe("active"); // Not auto-completed

      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 14500,
        roi: 290,
        dataQuality: "high",
      };

      exp = await recordResult(exp, result, "ws-123", "u-1");
      expect(exp.status).toBe("analyzed");

      const learning: ExperimentLearning = {
        keyFinding: "Finding about implementation effectiveness.",
        implications: "Suggests scaling is viable.",
        confidence: "high",
      };

      exp = await captureLearning(exp, learning, "ws-123", "u-1");
      expect(exp.status).toBe("archived");
    });
  });
});
