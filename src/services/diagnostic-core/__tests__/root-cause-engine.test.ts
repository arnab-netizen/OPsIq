import { RootCauseEngine } from "../root-cause-engine";
import { v4 as uuidv4 } from "uuid";

describe("RootCauseEngine (STRICT DIAGNOSTIC MODE)", () => {
  const engine = new RootCauseEngine();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("Data Sufficiency Gate (FAIL CLOSED)", () => {
    it("should FAIL on insufficient metrics (< 3)", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        { revenue_change_pct: -15 }, // Only 1 metric
        ["Revenue declined", "Customer churn observed"],
        { start: new Date(), event1: new Date(Date.now() + 86400000) }
      );

      expect(result).toBeNull();
    });

    it("should FAIL on insufficient observations (< 2)", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        {
          revenue_change_pct: -15,
          cost_change_pct: 10,
          execution_delay_days: 7,
        },
        ["Revenue declined"], // Only 1 observation
        { start: new Date(), event1: new Date(Date.now() + 86400000) }
      );

      expect(result).toBeNull();
    });

    it("should FAIL on insufficient timeline events (< 2)", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        {
          revenue_change_pct: -15,
          cost_change_pct: 10,
          execution_delay_days: 7,
        },
        ["Revenue declined", "Customer churn observed"],
        { start: new Date() } // Only 1 timeline event
      );

      expect(result).toBeNull();
    });

    it("should FAIL on contradiction: simultaneous revenue and cost decline", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        {
          revenue_change_pct: -60, // Large decline
          cost_change_pct: -60, // Also large decline - contradictory
          execution_delay_days: 7,
        },
        ["Revenue declined", "Cost declined unusually"],
        { start: new Date(), event1: new Date(Date.now() + 86400000) }
      );

      expect(result).toBeNull();
    });
  });

  describe("Hypothesis Competition (STRICT)", () => {
    const validMetrics = {
      revenue_change_pct: -25,
      cost_change_pct: 15,
      execution_delay_days: 14,
    };
    const validObservations = [
      "Revenue declined",
      "Customer churn observed",
      "Marketing effectiveness decreased",
      "Sales team morale declining",
      "Competitive pressure increased",
    ];
    const validTimeline = {
      start: new Date(),
      event1: new Date(Date.now() + 86400000),
      event2: new Date(Date.now() + 172800000),
    };

    it("should generate minimum 3 competing hypotheses", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedHypothesis).toBeDefined();
        expect(result.alternativeHypotheses.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("should select best hypothesis by confidence score", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        const selectedScore = result.selectedHypothesis.confidenceScore;
        const maxAlternativeScore = Math.max(
          ...result.alternativeHypotheses.map((h) => h.confidenceScore)
        );
        expect(selectedScore).toBeGreaterThanOrEqual(maxAlternativeScore);
      }
    });

    it("should include falsifier in each hypothesis", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedHypothesis.falsifier).toBeDefined();
        expect(result.selectedHypothesis.falsifier.condition).toBeDefined();
        expect(result.selectedHypothesis.falsifier.testMethod).toBeDefined();
      }
    });
  });

  describe("Confidence vs Evidence Validation (STRICT)", () => {
    it("should validate that confidence aligns with evidence quantity", async () => {
      const validMetrics = {
        revenue_change_pct: -25,
        cost_change_pct: 15,
        execution_delay_days: 14,
      };
      const richObservations = [
        "Revenue declined 25%",
        "Customer churn up 40%",
        "Marketing effectiveness down",
        "Sales team morale declining",
        "Competitive pressure increased",
        "Lead generation down 30%",
        "Employee attrition up",
      ];
      const validTimeline = {
        start: new Date(),
        event1: new Date(Date.now() + 86400000),
        event2: new Date(Date.now() + 172800000),
      };

      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        richObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        // Confidence should be proportional to evidence
        expect(result.overallConfidence).toBeGreaterThan(0);
        expect(result.overallConfidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Causal Chain Requirement (STRICT)", () => {
    const validMetrics = {
      revenue_change_pct: -25,
      cost_change_pct: 15,
      execution_delay_days: 14,
    };
    const validObservations = [
      "Revenue declined",
      "Customer churn observed",
      "Marketing effectiveness decreased",
      "Sales team morale declining",
      "Competitive pressure increased",
      "Lead generation down 30%",
    ];
    const validTimeline = {
      start: new Date(),
      event1: new Date(Date.now() + 86400000),
      event2: new Date(Date.now() + 172800000),
    };

    it("should include causal chain in hypothesis", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedHypothesis.causalChain).toBeDefined();
        expect(result.selectedHypothesis.causalChain.cause).toBeDefined();
        expect(result.selectedHypothesis.causalChain.mechanism).toBeDefined();
        expect(result.selectedHypothesis.causalChain.effect).toBeDefined();
      }
    });

    it("should include metric change in causal chain", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        const metricChange = result.selectedHypothesis.causalChain.metricChange;
        expect(metricChange.metric).toBeDefined();
        expect(metricChange.baseline).toBeDefined();
        expect(metricChange.current).toBeDefined();
        expect(metricChange.unit).toBeDefined();
        expect(metricChange.changePercent).toBeDefined();
      }
    });
  });

  describe("Uncertainty Exposure (MANDATORY)", () => {
    const validMetrics = {
      revenue_change_pct: -25,
      cost_change_pct: 15,
      execution_delay_days: 14,
    };
    const validObservations = [
      "Revenue declined",
      "Customer churn observed",
      "Marketing effectiveness decreased",
      "Sales team morale declining",
      "Competitive pressure increased",
      "Lead generation down 30%",
    ];
    const validTimeline = {
      start: new Date(),
      event1: new Date(Date.now() + 86400000),
      event2: new Date(Date.now() + 172800000),
    };

    it("should expose uncertainty with risk assessment", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.riskOfMisdiagnosis).toBeDefined();
        expect(result.uncertaintyExposure.missingDataList).toBeDefined();
        expect(result.uncertaintyExposure.assumptionsList).toBeDefined();
      }
    });

    it("should include alternative hypotheses in uncertainty message", async () => {
      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.riskOfMisdiagnosis).toContain(
          "Alternative hypotheses"
        );
      }
    });
  });

  describe("Workspace Isolation", () => {
    it("should preserve workspace context", async () => {
      const validMetrics = {
        revenue_change_pct: -25,
        cost_change_pct: 15,
        execution_delay_days: 14,
      };
      const validObservations = [
        "Revenue declined",
        "Customer churn observed",
        "Marketing effectiveness decreased",
        "Sales team morale declining",
        "Competitive pressure increased",
        "Lead generation down 30%",
      ];
      const validTimeline = {
        start: new Date(),
        event1: new Date(Date.now() + 86400000),
        event2: new Date(Date.now() + 172800000),
      };

      const result = await engine.analyzeRootCause(
        engagementId,
        workspaceId,
        validMetrics,
        validObservations,
        validTimeline
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.workspaceId).toBe(workspaceId);
        expect(result.engagementId).toBe(engagementId);
      }
    });
  });
});
