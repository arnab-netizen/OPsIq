import { BestPathOrchestrator, DiagnosticInput } from "../orchestrator";
import { DecisionPath } from "@/domain/decision/best-path";
import { v4 as uuidv4 } from "uuid";

describe("BestPathOrchestrator", () => {
  const orchestrator = new BestPathOrchestrator();
  const decisionId = uuidv4();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  const createMockPath = (overrides: Partial<DecisionPath> = {}): DecisionPath => ({
    id: uuidv4(),
    name: "Test Path",
    description: "Test decision path",
    actions: ["action-1", "action-2"],
    expectedOutcome: "Successful outcome",
    estimatedDuration: 86400000, // 1 day
    financialImpact: 50,
    successProbability: 0.75,
    executionFeasibility: 0.8,
    constraintSatisfaction: 90,
    overallScore: 0,
    risks: [],
    dependencies: [],
    ...overrides,
  });

  const mockDiagnosticData = {
    rootCause: "Market shift",
    bottlenecks: ["approval_delay"],
    rfmSegment: "HIGH_VALUE",
    metrics: [{ name: "NPS", value: 75 }],
    baselineRevenue: 1000000,
    projectedImpact: 250000,
    roi: 0.25,
    paybackDays: 60,
  };

  const mockConstraintData = {
    complianceStatus: "compliant",
    capacityLevel: "adequate",
    requiresApproval: false,
    blockers: [],
  };

  describe("analyzePaths", () => {
    it("should analyze multiple paths and select best one", async () => {
      const paths = [
        createMockPath({ successProbability: 0.6, financialImpact: 40 }),
        createMockPath({ successProbability: 0.8, financialImpact: 60 }),
        createMockPath({ successProbability: 0.7, financialImpact: 55 }),
      ];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.bestPath).toBeDefined();
      expect(result.bestPath.overallScore).toBeGreaterThan(0);
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it("should rank paths by score correctly", async () => {
      const paths = [
        createMockPath({
          name: "Path A",
          successProbability: 0.5,
          financialImpact: 30,
        }),
        createMockPath({
          name: "Path B",
          successProbability: 0.9,
          financialImpact: 80,
        }),
      ];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.bestPath.name).toBe("Path B");
    });

    it("should generate reasoning for selected path", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.selectedReason).toBeDefined();
      expect(result.reasoning.selectedReason.length).toBeGreaterThan(0);
    });

    it("should extract constraint summary", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.constraints).toBeDefined();
      expect(result.constraints.complianceStatus).toBe("compliant");
      expect(result.constraints.capacityLevel).toBe("adequate");
    });

    it("should project financials", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.financialProjection).toBeDefined();
      expect(result.financialProjection.baselineRevenue).toBe(1000000);
      expect(result.financialProjection.projectedImpact).toBe(250000);
    });

    it("should calculate confidence based on path margin", async () => {
      const paths = [
        createMockPath({ successProbability: 0.9, financialImpact: 80 }),
        createMockPath({ successProbability: 0.5, financialImpact: 20 }),
      ];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });

    it("should include success probability in analysis", async () => {
      const paths = [
        createMockPath({ successProbability: 0.75 }),
      ];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.successProbability).toBeDefined();
    });

    it("should handle no paths with default analysis", async () => {
      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        []
      );

      expect(result.bestPath).toBeDefined();
      expect(result.bestPath.name).toBe("Default Path");
      expect(result.alternatives).toHaveLength(0);
    });

    it("should include diagnostic summary in reasoning", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.reasoning.diagnosticSummary).toBeDefined();
      expect(result.reasoning.diagnosticSummary.rootCauseIdentified).toBe(true);
    });

    it("should assess path risks in reasoning", async () => {
      const riskyPath = createMockPath({
        risks: ["risk1", "risk2", "risk3"],
      });

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        [riskyPath]
      );

      expect(result.reasoning.riskAssessment).toContain("3 identified risks");
    });

    it("should set workspace-scoped analysis", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.engagementId).toBe(engagementId);
      expect(result.decisionId).toBe(decisionId);
    });

    it("should include timestamp in analysis", async () => {
      const beforeAnalysis = new Date();
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      const afterAnalysis = new Date();

      expect(result.analyzedAt.getTime()).toBeGreaterThanOrEqual(
        beforeAnalysis.getTime()
      );
      expect(result.analyzedAt.getTime()).toBeLessThanOrEqual(
        afterAnalysis.getTime()
      );
    });

    it("should include fallback options in reasoning", async () => {
      const paths = [createMockPath()];

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        paths
      );

      expect(result.reasoning.fallbackOptions).toBeDefined();
      expect(result.reasoning.fallbackOptions.length).toBeGreaterThan(0);
    });

    it("should weight scores correctly (30% financial, 30% probability, 25% feasibility, 15% constraint)", async () => {
      const perfectPath = createMockPath({
        financialImpact: 100,
        successProbability: 1.0,
        executionFeasibility: 1.0,
        constraintSatisfaction: 100,
        estimatedDuration: 1000, // 1 second for feasibility scoring
      });

      const result = await orchestrator.analyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        mockDiagnosticData,
        mockConstraintData,
        [perfectPath]
      );

      expect(result.bestPath.overallScore).toBeGreaterThan(95);
    });
  });

  describe("runFullDiagnosticsAndAnalyzePaths", () => {
    const createValidDiagnosticInput = (): DiagnosticInput => ({
      rootCauseMetrics: {
        revenue_change_pct: -25,
        cost_change_pct: 15,
        execution_delay_days: 14,
      },
      rootCauseObservations: [
        "Revenue declined",
        "Customer churn observed",
        "Marketing effectiveness decreased",
        "Sales team morale declining",
      ],
      rootCauseTimeline: {
        start: new Date(Date.now() - 604800000),
        event1: new Date(Date.now() - 172800000),
        event2: new Date(),
      },
      bottleneckMetrics: {
        utilization_pct: 85,
        conversion_rate: 0.25,
      },
      bottleneckTimelineData: {
        baseline: {
          value: 70,
          timestamp: new Date(Date.now() - 86400000),
        },
        current: {
          value: 85,
          timestamp: new Date(),
        },
      },
      bottleneckAffectedKpis: {
        revenue: 1000000,
      },
      archetypeIndicators: {
        revenueTrend: 25,
        profitMargin: 15,
        cashFlow: 500000,
        debtToEquity: 0.5,
        marketShare: 5,
        customerAcquisitionCost: 500,
        customerLifetimeValue: 5000,
        burnRate: 100000,
        runwayMonths: 24,
      },
      maturityIndicators: {
        processDocumentation: 65,
        processConsistency: 70,
        teamTraining: 60,
        toolsAvailable: 65,
        dataQuality: 70,
        decisionTracking: 65,
        riskManagement: 70,
        governanceStructure: 65,
        executionTrackRecord: 75,
      },
    });

    it("should run all diagnostics and analyze paths", async () => {
      const paths = [createMockPath()];
      const diagnosticInput = createValidDiagnosticInput();

      const result = await orchestrator.runFullDiagnosticsAndAnalyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        diagnosticInput,
        mockConstraintData,
        paths
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.bestPath).toBeDefined();
        expect(result.reasoning.diagnosticSummary).toBeDefined();
      }
    });

    it("should combine all diagnostic outputs into diagnosticData", async () => {
      const paths = [createMockPath()];
      const diagnosticInput = createValidDiagnosticInput();

      const result = await orchestrator.runFullDiagnosticsAndAnalyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        diagnosticInput,
        mockConstraintData,
        paths
      );

      expect(result).not.toBeNull();
      if (result) {
        const diagnosticSummary = result.reasoning.diagnosticSummary;
        expect(diagnosticSummary.rootCauseIdentified).toBe(true);
        expect(diagnosticSummary.bottlenecksDetected).toBeGreaterThan(0);
      }
    });

    it("should fail gracefully if any diagnostic fails", async () => {
      const paths = [createMockPath()];
      // Provide insufficient data to trigger diagnostic failures
      const invalidInput: DiagnosticInput = {
        rootCauseMetrics: { metric1: 10 }, // < 3 required
        rootCauseObservations: ["Only one"], // < 2 required
        rootCauseTimeline: { only_one: new Date() }, // < 2 required
        bottleneckMetrics: {},
        bottleneckTimelineData: {},
        bottleneckAffectedKpis: {},
        archetypeIndicators: {
          revenueTrend: NaN,
          profitMargin: NaN,
          cashFlow: NaN,
          debtToEquity: NaN,
          marketShare: NaN,
          customerAcquisitionCost: NaN,
          customerLifetimeValue: NaN,
          burnRate: NaN,
          runwayMonths: NaN,
        },
        maturityIndicators: {
          processDocumentation: 0,
          processConsistency: 0,
          teamTraining: 0,
          toolsAvailable: 0,
          dataQuality: 0,
          decisionTracking: 0,
          riskManagement: 0,
          governanceStructure: 0,
          executionTrackRecord: 0,
        },
      };

      const result = await orchestrator.runFullDiagnosticsAndAnalyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        invalidInput,
        mockConstraintData,
        paths
      );

      expect(result).toBeNull();
    });

    it("should preserve workspace context", async () => {
      const paths = [createMockPath()];
      const diagnosticInput = createValidDiagnosticInput();

      const result = await orchestrator.runFullDiagnosticsAndAnalyzePaths(
        decisionId,
        engagementId,
        workspaceId,
        diagnosticInput,
        mockConstraintData,
        paths
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.workspaceId).toBe(workspaceId);
        expect(result.engagementId).toBe(engagementId);
      }
    });
  });
});
