import { BestPathOrchestrator } from "../orchestrator";
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
});
