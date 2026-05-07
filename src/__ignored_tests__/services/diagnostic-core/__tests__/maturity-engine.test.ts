import { MaturityEngine } from "../maturity-engine";
import { v4 as uuidv4 } from "uuid";

describe("MaturityEngine (STRICT EXECUTION CAPABILITY MODE)", () => {
  const engine = new MaturityEngine();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("Data Sufficiency Gate (FAIL CLOSED)", () => {
    const validIndicators = {
      processDocumentation: 60,
      processConsistency: 70,
      teamTraining: 75,
      toolsAvailable: 80,
      dataQuality: 70,
      decisionTracking: 65,
      riskManagement: 70,
      governanceStructure: 75,
      executionTrackRecord: 80,
    };

    it("should FAIL on missing any required indicator", async () => {
      const indicators = { ...validIndicators };
      delete indicators.processDocumentation;

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        indicators as any
      );

      expect(result).toBeNull();
    });

    it("should PASS with all required indicators", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
    });
  });

  describe("Maturity Level Classification (1-5)", () => {
    it("should classify Level 1 (Ad-hoc)", async () => {
      const adhocIndicators = {
        processDocumentation: 10,
        processConsistency: 15,
        teamTraining: 20,
        toolsAvailable: 15,
        dataQuality: 20,
        decisionTracking: 10,
        riskManagement: 15,
        governanceStructure: 10,
        executionTrackRecord: 20,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        adhocIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maturityLevel).toBe(1);
      }
    });

    it("should classify Level 2 (Repeatable)", async () => {
      const repeatableIndicators = {
        processDocumentation: 30,
        processConsistency: 32,
        teamTraining: 28,
        toolsAvailable: 30,
        dataQuality: 32,
        decisionTracking: 28,
        riskManagement: 30,
        governanceStructure: 28,
        executionTrackRecord: 38,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        repeatableIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maturityLevel).toBe(2);
      }
    });

    it("should classify Level 3 (Managed)", async () => {
      const managedIndicators = {
        processDocumentation: 55,
        processConsistency: 58,
        teamTraining: 50,
        toolsAvailable: 55,
        dataQuality: 58,
        decisionTracking: 55,
        riskManagement: 58,
        governanceStructure: 55,
        executionTrackRecord: 65,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        managedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maturityLevel).toBe(3);
      }
    });

    it("should classify Level 4 (Optimized)", async () => {
      const optimizedIndicators = {
        processDocumentation: 75,
        processConsistency: 78,
        teamTraining: 70,
        toolsAvailable: 75,
        dataQuality: 78,
        decisionTracking: 75,
        riskManagement: 78,
        governanceStructure: 75,
        executionTrackRecord: 85,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        optimizedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maturityLevel).toBe(4);
      }
    });

    it("should classify Level 5 (Leading-Edge)", async () => {
      const leadingIndicators = {
        processDocumentation: 90,
        processConsistency: 92,
        teamTraining: 90,
        toolsAvailable: 92,
        dataQuality: 92,
        decisionTracking: 90,
        riskManagement: 92,
        governanceStructure: 90,
        executionTrackRecord: 95,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        leadingIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maturityLevel).toBe(5);
      }
    });
  });

  describe("Execution Capability Constraints", () => {
    const managedIndicators = {
      processDocumentation: 65,
      processConsistency: 70,
      teamTraining: 60,
      toolsAvailable: 65,
      dataQuality: 70,
      decisionTracking: 65,
      riskManagement: 70,
      governanceStructure: 65,
      executionTrackRecord: 75,
    };

    it("should restrict execution complexity based on maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        managedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const validComplexity = [
          "simple",
          "moderate",
          "complex",
          "expert",
        ];
        expect(validComplexity).toContain(
          result.currentMaturity.maxExecutionComplexity
        );
      }
    });

    it("should restrict decision horizon based on maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        managedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maxDecisionHorizonDays).toBeGreaterThan(0);
        expect(result.currentMaturity.maxDecisionHorizonDays).toBeLessThanOrEqual(
          365
        );
      }
    });

    it("should restrict plan size based on maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        managedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.maxPlanSizeActions).toBeGreaterThan(0);
      }
    });

    it("should define allowed strategies at each maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        managedIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.allowedStrategyTypes.length).toBeGreaterThan(
          0
        );
      }
    });

    it("should define blocked strategies at each maturity", async () => {
      const adhocIndicators = {
        processDocumentation: 10,
        processConsistency: 15,
        teamTraining: 20,
        toolsAvailable: 15,
        dataQuality: 20,
        decisionTracking: 10,
        riskManagement: 15,
        governanceStructure: 10,
        executionTrackRecord: 20,
      };

      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        adhocIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.blockedStrategyTypes.length).toBeGreaterThan(
          0
        );
      }
    });
  });

  describe("Maturity Dimension Scoring", () => {
    const validIndicators = {
      processDocumentation: 70,
      processConsistency: 75,
      teamTraining: 65,
      toolsAvailable: 70,
      dataQuality: 75,
      decisionTracking: 70,
      riskManagement: 75,
      governanceStructure: 70,
      executionTrackRecord: 80,
    };

    it("should score process maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.processMaturityScore).toBeGreaterThan(0);
        expect(result.currentMaturity.processMaturityScore).toBeLessThanOrEqual(1);
      }
    });

    it("should score team capability", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.teamCapabilityScore).toBeGreaterThan(0);
        expect(result.currentMaturity.teamCapabilityScore).toBeLessThanOrEqual(1);
      }
    });

    it("should score systems maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.systemsMaturityScore).toBeGreaterThan(0);
        expect(result.currentMaturity.systemsMaturityScore).toBeLessThanOrEqual(1);
      }
    });

    it("should score governance maturity", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.currentMaturity.governanceMaturityScore).toBeGreaterThan(0);
        expect(result.currentMaturity.governanceMaturityScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Maturity Gaps", () => {
    const lowMaturityIndicators = {
      processDocumentation: 30,
      processConsistency: 35,
      teamTraining: 25,
      toolsAvailable: 30,
      dataQuality: 35,
      decisionTracking: 25,
      riskManagement: 30,
      governanceStructure: 25,
      executionTrackRecord: 40,
    };

    it("should identify maturity gaps", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        lowMaturityIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.maturityGaps.length).toBeGreaterThan(0);
      }
    });

    it("should quantify gap size", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        lowMaturityIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        if (result.maturityGaps.length > 0) {
          const gap = result.maturityGaps[0];
          expect(gap.gap).toBeGreaterThan(0);
          expect(gap.gap).toBeLessThanOrEqual(100);
        }
      }
    });

    it("should link gaps to specific dimensions", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        lowMaturityIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        if (result.maturityGaps.length > 0) {
          const validDimensions = [
            "Process Maturity",
            "Team Capability",
            "Systems Maturity",
            "Governance Maturity",
          ];
          expect(validDimensions).toContain(result.maturityGaps[0].dimension);
        }
      }
    });
  });

  describe("Alternative Assessments", () => {
    const validIndicators = {
      processDocumentation: 60,
      processConsistency: 65,
      teamTraining: 55,
      toolsAvailable: 60,
      dataQuality: 65,
      decisionTracking: 60,
      riskManagement: 65,
      governanceStructure: 60,
      executionTrackRecord: 70,
    };

    it("should generate alternative maturity assessments", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.alternativeAssessments.length).toBeGreaterThan(0);
      }
    });

    it("should provide adjacent level assessments", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const alternatives = result.alternativeAssessments;
        const levels = alternatives.map((a) => a.maturityLevel);
        const currentLevel = result.currentMaturity.maturityLevel;

        const hasAdjacentLevel = levels.some(
          (l) => Math.abs(l - currentLevel) === 1
        );
        expect(hasAdjacentLevel || alternatives.length === 0).toBe(true);
      }
    });
  });

  describe("Confidence Scoring", () => {
    const validIndicators = {
      processDocumentation: 70,
      processConsistency: 75,
      teamTraining: 65,
      toolsAvailable: 70,
      dataQuality: 75,
      decisionTracking: 70,
      riskManagement: 75,
      governanceStructure: 70,
      executionTrackRecord: 80,
    };

    it("should score overall confidence", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.overallConfidence).toBeGreaterThan(0.5);
        expect(result.overallConfidence).toBeLessThanOrEqual(1);
      }
    });

    it("should calculate overall maturity score", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.overallMaturityScore).toBeGreaterThan(0);
        expect(result.overallMaturityScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Uncertainty Exposure (MANDATORY)", () => {
    const validIndicators = {
      processDocumentation: 70,
      processConsistency: 75,
      teamTraining: 65,
      toolsAvailable: 70,
      dataQuality: 75,
      decisionTracking: 70,
      riskManagement: 75,
      governanceStructure: 70,
      executionTrackRecord: 80,
    };

    it("should expose assessment confidence", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.assessmentConfidence).toBeDefined();
        expect(result.uncertaintyExposure.assessmentConfidence.length).toBeGreaterThan(
          0
        );
      }
    });

    it("should list assumptions", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.assumptionsList.length).toBeGreaterThan(0);
      }
    });

    it("should include dimension breakdowns in confidence message", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const message = result.uncertaintyExposure.assessmentConfidence;
        expect(message).toContain("process");
        expect(message).toContain("team");
        expect(message).toContain("systems");
        expect(message).toContain("governance");
      }
    });
  });

  describe("Workspace Isolation", () => {
    const validIndicators = {
      processDocumentation: 70,
      processConsistency: 75,
      teamTraining: 65,
      toolsAvailable: 70,
      dataQuality: 75,
      decisionTracking: 70,
      riskManagement: 75,
      governanceStructure: 70,
      executionTrackRecord: 80,
    };

    it("should preserve workspace context", async () => {
      const result = await engine.analyzeMaturity(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.workspaceId).toBe(workspaceId);
        expect(result.engagementId).toBe(engagementId);
      }
    });
  });
});
