/**
 * Domain Tests: Experiment Contract
 *
 * Validates experiment lifecycle, hypothesis validation, plan rigor,
 * execution tracking, result measurement, and learning capture.
 */

import { describe, it, expect } from "vitest";
import {
  validateHypothesis,
  validateExperimentPlan,
  validateExperimentExecution,
  validateExperimentResult,
  validateExperiment,
} from "@/domain/experiment/experiment";
import type {
  Hypothesis,
  ExperimentPlan,
  ExperimentExecution,
  ExperimentResult,
  Experiment,
} from "@/domain/experiment/experiment";

describe("Experiment Domain Contract", () => {
  describe("Hypothesis Validation", () => {
    it("should require hypothesis statement at least 20 characters", () => {
      const hypothesis: Hypothesis = {
        statement: "short",
        type: "revenue_growth",
        successCriterion: "Increase revenue by 15%",
        successThreshold: 15,
        successMetric: "monthly_revenue",
        failureRisk: "Revenue could decline",
        failureThreshold: -20,
        testDurationWeeks: 4,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("statement must be at least 20 characters"));
    });

    it("should require success metric", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then customer satisfaction will improve",
        type: "retention_improvement",
        successCriterion: "Increase satisfaction score by 10%",
        successThreshold: 10,
        successMetric: "",
        failureRisk: "Satisfaction could decline",
        failureThreshold: -15,
        testDurationWeeks: 3,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("Success metric is required"));
    });

    it("should require positive success threshold", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then metric will improve by positive amount",
        type: "product_pivot",
        successCriterion: "Increase metric",
        successThreshold: 0,
        successMetric: "metric",
        failureRisk: "Metric could decline",
        failureThreshold: -10,
        testDurationWeeks: 2,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("Success threshold must be greater than 0%"));
    });

    it("should require negative failure threshold (downside risk)", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then metric will improve by positive amount",
        type: "cost_reduction",
        successCriterion: "Reduce cost by 15%",
        successThreshold: 15,
        successMetric: "monthly_cost",
        failureRisk: "Costs could increase",
        failureThreshold: 5, // Wrong: should be negative
        testDurationWeeks: 2,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("Failure threshold must be negative"));
    });

    it("should require minimum test duration of 1 week", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then metric will improve by positive amount",
        type: "market_expansion",
        successCriterion: "Expand market",
        successThreshold: 20,
        successMetric: "new_segment_revenue",
        failureRisk: "Market rejection",
        failureThreshold: -30,
        testDurationWeeks: 0,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("Test duration must be at least 1 week"));
    });

    it("should require review cadence <= test duration", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then metric will improve by positive amount",
        type: "operational_efficiency",
        successCriterion: "Improve efficiency",
        successThreshold: 10,
        successMetric: "efficiency_score",
        failureRisk: "Efficiency could decline",
        failureThreshold: -15,
        testDurationWeeks: 2,
        reviewCadenceWeeks: 3, // Wrong: exceeds duration
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toContain(expect.stringContaining("Review cadence must be 1+ weeks and <= test duration"));
    });

    it("should pass valid hypothesis", () => {
      const hypothesis: Hypothesis = {
        statement: "If we implement feature X, then customer satisfaction will improve by 15%",
        type: "retention_improvement",
        successCriterion: "Increase CSAT score by 15%",
        successThreshold: 15,
        successMetric: "csat_score",
        failureRisk: "CSAT could decline due to complexity",
        failureThreshold: -20,
        testDurationWeeks: 4,
        reviewCadenceWeeks: 1,
      };

      const errors = validateHypothesis(hypothesis);
      expect(errors).toHaveLength(0);
    });
  });

  describe("ExperimentPlan Validation", () => {
    const baseHypothesis: Hypothesis = {
      statement: "If we implement feature X, then customer satisfaction will improve by 15%",
      type: "retention_improvement",
      successCriterion: "Increase CSAT score by 15%",
      successThreshold: 15,
      successMetric: "csat_score",
      failureRisk: "CSAT could decline",
      failureThreshold: -20,
      testDurationWeeks: 4,
      reviewCadenceWeeks: 1,
    };

    it("should require action description at least 20 characters", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "short",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: ["nps_score", "retention_rate"],
        confoundingFactors: ["seasonality", "marketing_spend"],
        estimatedCost: 5000,
        estimatedEffort: "40 hours",
        requiredCapabilities: ["product", "analytics"],
        dependencies: ["feature_flag_infra"],
        requiredApprovals: [],
        riskLevel: "medium",
        rigorLevel: "standard",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toContain(expect.stringContaining("Action description must be at least 20 characters"));
    });

    it("should require at least one secondary metric", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "We will implement a new onboarding flow to improve user satisfaction and retention.",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: [],
        confoundingFactors: ["seasonality"],
        estimatedCost: 5000,
        estimatedEffort: "40 hours",
        requiredCapabilities: ["product"],
        dependencies: [],
        requiredApprovals: [],
        riskLevel: "low",
        rigorLevel: "standard",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toContain(expect.stringContaining("At least one secondary metric is required"));
    });

    it("should require at least one confounding factor identified", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "We will implement a new onboarding flow to improve user satisfaction and retention.",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: ["nps_score"],
        confoundingFactors: [],
        estimatedCost: 5000,
        estimatedEffort: "40 hours",
        requiredCapabilities: ["product"],
        dependencies: [],
        requiredApprovals: [],
        riskLevel: "low",
        rigorLevel: "exploratory",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toContain(expect.stringContaining("At least one potential confounding factor"));
    });

    it("should require non-negative estimated cost", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "We will implement a new onboarding flow to improve user satisfaction and retention.",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: ["nps_score"],
        confoundingFactors: ["seasonality"],
        estimatedCost: -1000,
        estimatedEffort: "40 hours",
        requiredCapabilities: ["product"],
        dependencies: [],
        requiredApprovals: [],
        riskLevel: "low",
        rigorLevel: "standard",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toContain(expect.stringContaining("Estimated cost cannot be negative"));
    });

    it("should require approvals for critical-risk experiments", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "We will implement a new onboarding flow to improve user satisfaction and retention.",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: ["nps_score"],
        confoundingFactors: ["seasonality"],
        estimatedCost: 100000,
        estimatedEffort: "200 hours",
        requiredCapabilities: ["product"],
        dependencies: [],
        requiredApprovals: [],
        riskLevel: "critical",
        rigorLevel: "controlled",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toContain(expect.stringContaining("required approvals"));
    });

    it("should pass valid plan", () => {
      const plan: ExperimentPlan = {
        hypothesis: baseHypothesis,
        actionDescription: "We will implement a new onboarding flow to improve user satisfaction and retention.",
        targetAudience: "US SMB segment",
        controlGroup: "EU segment",
        primaryMetric: "csat_score",
        secondaryMetrics: ["nps_score", "retention_rate"],
        confoundingFactors: ["seasonality", "marketing_spend"],
        estimatedCost: 15000,
        estimatedEffort: "80 hours",
        requiredCapabilities: ["product", "design", "analytics"],
        dependencies: ["analytics_pipeline"],
        requiredApprovals: ["product_lead"],
        riskLevel: "high",
        rigorLevel: "strict",
      };

      const errors = validateExperimentPlan(plan);
      expect(errors).toHaveLength(0);
    });
  });

  describe("ExperimentExecution Validation", () => {
    it("should require startedAt for non-draft experiments", () => {
      const execution: ExperimentExecution = {
        status: "active",
        percentComplete: 50,
        daysElapsed: 10,
        daysRemaining: 10,
        targetEndDate: new Date("2026-06-01"),
        notes: ["Execution in progress"],
      };

      const errors = validateExperimentExecution(execution);
      expect(errors).toContain(expect.stringContaining("Started experiments must have a startedAt timestamp"));
    });

    it("should clamp percentComplete to 0-100", () => {
      const execution: ExperimentExecution = {
        status: "active",
        percentComplete: 150,
        daysElapsed: 10,
        daysRemaining: 10,
        targetEndDate: new Date("2026-06-01"),
        startedAt: new Date("2026-05-18"),
        notes: ["Execution in progress"],
      };

      const errors = validateExperimentExecution(execution);
      expect(errors).toContain(expect.stringContaining("Percent complete must be 0-100"));
    });

    it("should require actualEndDate for completed experiments", () => {
      const execution: ExperimentExecution = {
        status: "completed",
        percentComplete: 100,
        daysElapsed: 28,
        daysRemaining: 0,
        targetEndDate: new Date("2026-06-15"),
        startedAt: new Date("2026-05-18"),
        notes: ["Execution complete"],
      };

      const errors = validateExperimentExecution(execution);
      expect(errors).toContain(expect.stringContaining("actualEndDate"));
    });

    it("should pass valid execution", () => {
      const execution: ExperimentExecution = {
        status: "active",
        percentComplete: 50,
        daysElapsed: 14,
        daysRemaining: 14,
        targetEndDate: new Date("2026-06-01"),
        startedAt: new Date("2026-05-18"),
        notes: ["50% complete", "No blockers observed"],
      };

      const errors = validateExperimentExecution(execution);
      expect(errors).toHaveLength(0);
    });
  });

  describe("ExperimentResult Validation", () => {
    it("should require primary metric value", () => {
      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: undefined as unknown as number,
        primaryMetricChange: 15,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 12000,
        roi: 250,
        dataQuality: "high",
      };

      const errors = validateExperimentResult(result);
      expect(errors).toContain(expect.stringContaining("Primary metric value"));
    });

    it("should require primary metric change", () => {
      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: undefined as unknown as number,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 12000,
        roi: 250,
        dataQuality: "high",
      };

      const errors = validateExperimentResult(result);
      expect(errors).toContain(expect.stringContaining("Primary metric change"));
    });

    it("should reject success classification if threshold not met", () => {
      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: false,
        primaryMetricValue: 87.5,
        primaryMetricChange: 8,
        primaryMetricTrend: "increasing",
        secondaryResults: {},
        actualCost: 12000,
        roi: 100,
        dataQuality: "high",
      };

      const errors = validateExperimentResult(result);
      expect(errors).toContain(expect.stringContaining("cannot be 'success' if threshold not met"));
    });

    it("should pass valid result", () => {
      const result: ExperimentResult = {
        classification: "success",
        successThresholdMet: true,
        primaryMetricValue: 87.5,
        primaryMetricChange: 18,
        primaryMetricTrend: "increasing",
        secondaryResults: {
          nps_score: { value: 52, change: 12, trend: "increasing" },
          retention_rate: { value: 0.82, change: 5, trend: "increasing" },
        },
        actualCost: 12500,
        roi: 280,
        confidenceLevel: 92,
        sampleSize: 450,
        controlGroupValue: 74,
        dataQuality: "high",
      };

      const errors = validateExperimentResult(result);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Full Experiment Validation", () => {
    it("should require experiment ID", () => {
      const experiment: Experiment = {
        id: "",
        workspaceId: "ws-123",
        engagementId: "eng-456",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-789",
        status: "draft",
        name: "Q2 Onboarding Optimization",
        plan: {
          hypothesis: {
            statement: "If we simplify onboarding, CSAT will increase by 15%",
            type: "retention_improvement",
            successCriterion: "Increase CSAT by 15%",
            successThreshold: 15,
            successMetric: "csat_score",
            failureRisk: "Complexity could confuse users",
            failureThreshold: -20,
            testDurationWeeks: 4,
            reviewCadenceWeeks: 1,
          },
          actionDescription: "Simplify the onboarding flow by reducing steps from 7 to 4.",
          targetAudience: "New US SMB customers",
          controlGroup: "New EU SMB customers",
          primaryMetric: "csat_score",
          secondaryMetrics: ["time_to_activate"],
          confoundingFactors: ["seasonal_demand"],
          estimatedCost: 10000,
          estimatedEffort: "60 hours",
          requiredCapabilities: ["product", "design"],
          dependencies: ["design_review"],
          requiredApprovals: ["product_lead"],
          riskLevel: "medium",
          rigorLevel: "standard",
        },
      };

      const errors = validateExperiment(experiment);
      expect(errors).toContain(expect.stringContaining("Experiment ID is required"));
    });

    it("should pass valid experiment", () => {
      const experiment: Experiment = {
        id: "exp-789",
        workspaceId: "ws-123",
        engagementId: "eng-456",
        createdAt: new Date("2026-05-11"),
        updatedAt: new Date("2026-05-11"),
        createdBy: "user-789",
        status: "draft",
        name: "Q2 Onboarding Optimization",
        description: "Simplify the onboarding process to improve time-to-value",
        plan: {
          hypothesis: {
            statement: "If we simplify onboarding from 7 to 4 steps, CSAT will increase by 15%",
            type: "retention_improvement",
            successCriterion: "Increase CSAT by 15%",
            successThreshold: 15,
            successMetric: "csat_score",
            failureRisk: "Removing steps could omit important information",
            failureThreshold: -20,
            testDurationWeeks: 4,
            reviewCadenceWeeks: 1,
          },
          actionDescription: "Simplify the onboarding flow by removing confirmation steps and auto-populating from SSO data.",
          targetAudience: "New US SMB customers in trial",
          controlGroup: "New EU SMB customers in trial",
          primaryMetric: "csat_score",
          secondaryMetrics: ["time_to_activate", "feature_adoption_rate"],
          confoundingFactors: ["seasonality", "marketing_campaign"],
          estimatedCost: 15000,
          estimatedEffort: "80 hours",
          requiredCapabilities: ["product_engineering", "ux_design", "analytics"],
          dependencies: ["feature_flag_system", "analytics_pipeline"],
          requiredApprovals: ["product_lead", "design_lead"],
          riskLevel: "medium",
          rigorLevel: "standard",
        },
      };

      const errors = validateExperiment(experiment);
      expect(errors).toHaveLength(0);
    });

    it("should accumulate validation errors from sub-components", () => {
      const experiment: Experiment = {
        id: "exp-789",
        workspaceId: "ws-123",
        engagementId: "eng-456",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-789",
        status: "draft",
        name: "Q2 Test",
        plan: {
          hypothesis: {
            statement: "short",
            type: "revenue_growth",
            successCriterion: "Increase",
            successThreshold: 0,
            successMetric: "",
            failureRisk: "Risk",
            failureThreshold: 5,
            testDurationWeeks: 0,
            reviewCadenceWeeks: 1,
          },
          actionDescription: "short",
          targetAudience: "US",
          controlGroup: "EU",
          primaryMetric: "metric",
          secondaryMetrics: [],
          confoundingFactors: [],
          estimatedCost: -100,
          estimatedEffort: "hours",
          requiredCapabilities: [],
          dependencies: [],
          requiredApprovals: [],
          riskLevel: "low",
          rigorLevel: "exploratory",
        },
      };

      const errors = validateExperiment(experiment);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Experiment Status Lifecycle", () => {
    it("should support draft → approved transition", () => {
      const experiment: Experiment = {
        id: "exp-789",
        workspaceId: "ws-123",
        engagementId: "eng-456",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-789",
        status: "approved",
        name: "Q2 Onboarding Test",
        plan: {
          hypothesis: {
            statement: "If we simplify onboarding, CSAT will increase by 15%",
            type: "retention_improvement",
            successCriterion: "Increase CSAT by 15%",
            successThreshold: 15,
            successMetric: "csat_score",
            failureRisk: "Complexity confusion",
            failureThreshold: -20,
            testDurationWeeks: 4,
            reviewCadenceWeeks: 1,
          },
          actionDescription: "Simplify onboarding flow.",
          targetAudience: "US customers",
          controlGroup: "EU customers",
          primaryMetric: "csat_score",
          secondaryMetrics: ["time_to_activate"],
          confoundingFactors: ["seasonality"],
          estimatedCost: 10000,
          estimatedEffort: "60 hours",
          requiredCapabilities: ["product"],
          dependencies: [],
          requiredApprovals: ["product_lead"],
          riskLevel: "medium",
          rigorLevel: "standard",
        },
      };

      expect(["draft", "approved", "active", "completed", "analyzed", "archived"]).toContain(experiment.status);
    });
  });
});
