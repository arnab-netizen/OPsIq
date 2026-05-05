import { describe, it, expect } from "vitest";
import { ConstraintEnforcer } from "../constraint-enforcer";
import { v4 as uuidv4 } from "uuid";

describe("ConstraintEnforcer", () => {
  const enforcer = new ConstraintEnforcer();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  const validDiagnosticData = {
    rootCauseIdentified: true,
    rootCauseConfidence: 0.75,
    primaryBottleneck: "Conversion Rate",
    bottleneckConfidence: 0.80,
    archetype: "Growth-Stage Company",
    archetypeConfidence: 0.70,
    maturityLevel: 3,
    maturityConfidence: 0.65,
    allowedStrategies: ["revenue_growth", "market_expansion"],
    forbiddenStrategies: ["debt_reduction"],
  };

  describe("checkDataSufficiency", () => {
    it("should pass with all required diagnostic fields", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const dataSufficiencyGate = result.gateResults[0];
      expect(dataSufficiencyGate.name).toBe("data_sufficient");
      expect(dataSufficiencyGate.passed).toBe(true);
    });

    it("should fail with missing rootCauseIdentified", async () => {
      const incompleteData = { ...validDiagnosticData };
      delete (incompleteData as any).rootCauseIdentified;

      const result = await enforcer.enforceAllGates(
        incompleteData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("data_sufficient");
    });

    it("should fail with missing primaryBottleneck", async () => {
      const incompleteData = { ...validDiagnosticData };
      delete (incompleteData as any).primaryBottleneck;

      const result = await enforcer.enforceAllGates(
        incompleteData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("data_sufficient");
    });

    it("should fail with missing archetype", async () => {
      const incompleteData = { ...validDiagnosticData };
      delete (incompleteData as any).archetype;

      const result = await enforcer.enforceAllGates(
        incompleteData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("data_sufficient");
    });

    it("should fail with missing maturityLevel", async () => {
      const incompleteData = { ...validDiagnosticData };
      delete (incompleteData as any).maturityLevel;

      const result = await enforcer.enforceAllGates(
        incompleteData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("data_sufficient");
    });
  });

  describe("checkContradictionFree", () => {
    it("should pass with high confidence scores", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const contradictionGate = result.gateResults.find((g) => g.name === "contradiction_free");
      expect(contradictionGate?.passed).toBe(true);
    });

    it("should fail with very low average confidence", async () => {
      const lowConfidenceData = {
        ...validDiagnosticData,
        rootCauseConfidence: 0.1,
        bottleneckConfidence: 0.1,
        archetypeConfidence: 0.1,
        maturityConfidence: 0.1,
      };

      const result = await enforcer.enforceAllGates(
        lowConfidenceData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("contradiction_free");
    });

    it("should fail with conflicting strategy constraints", async () => {
      const conflictingData = {
        ...validDiagnosticData,
        allowedStrategies: ["revenue_growth", "cost_reduction"],
        forbiddenStrategies: ["cost_reduction", "debt_reduction"],
      };

      const result = await enforcer.enforceAllGates(
        conflictingData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("contradiction_free");
    });
  });

  describe("checkCapacityAvailable", () => {
    it("should pass with sufficient available hours", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const capacityGate = result.gateResults.find((g) => g.name === "capacity_available");
      expect(capacityGate?.passed).toBe(true);
    });

    it("should fail when effort_hours exceed available_hours", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 120, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("capacity_available");
    });

    it("should fail when effort_hours equal available_hours (no margin)", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 100, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      // This should PASS - we allow exact match
      const capacityGate = result.gateResults.find((g) => g.name === "capacity_available");
      expect(capacityGate?.passed).toBe(true);
    });

    it("should use default available hours if not provided", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const capacityGate = result.gateResults.find((g) => g.name === "capacity_available");
      expect(capacityGate?.passed).toBe(true); // 40 hours < 168 (default week)
    });
  });

  describe("checkCashRunwaySafe", () => {
    it("should pass with reasonable payback period", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const cashGate = result.gateResults.find((g) => g.name === "cash_runway_safe");
      expect(cashGate?.passed).toBe(true);
    });

    it("should fail with payback period exceeding 180 days", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 200, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("cash_runway_safe");
    });

    it("should fail with negative capital requirement", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: -5000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("cash_runway_safe");
    });

    it("should pass at boundary (180 days)", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 180, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const cashGate = result.gateResults.find((g) => g.name === "cash_runway_safe");
      expect(cashGate?.passed).toBe(true);
    });
  });

  describe("checkLegalCompliance", () => {
    it("should pass with allowed strategy type", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { strategy_type: "revenue_growth", engagement_id: engagementId, workspace_id: workspaceId }
      );

      const complianceGate = result.gateResults.find((g) => g.name === "legal_compliance_ok");
      expect(complianceGate?.passed).toBe(true);
    });

    it("should fail with blocked strategy type", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { strategy_type: "high_risk_pivot", engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("legal_compliance_ok");
    });

    it("should fail with aggressive_downsizing strategy", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { strategy_type: "aggressive_downsizing", engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
    });

    it("should pass with no strategy type specified", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      const complianceGate = result.gateResults.find((g) => g.name === "legal_compliance_ok");
      expect(complianceGate?.passed).toBe(true);
    });
  });

  describe("enforceAllGates - Fail-Closed Behavior", () => {
    it("should return null on first gate failure (fail-closed)", async () => {
      const result = await enforcer.enforceAllGates(
        { rootCauseIdentified: true }, // Missing other fields
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe("data_sufficient");
      expect(result.passedGates.length).toBe(0);
    });

    it("should pass all gates with valid inputs", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { strategy_type: "revenue_growth", engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.allPassed).toBe(true);
      expect(result.failedGates.length).toBe(0);
      expect(result.gateResults.length).toBe(5);
      expect(result.gateResults.every((g) => g.passed)).toBe(true);
    });

    it("should not evaluate subsequent gates after first failure", async () => {
      const result = await enforcer.enforceAllGates(
        { rootCauseIdentified: true }, // Missing fields - gate 1 fails
        { effort_hours: 120, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId }, // Would fail gate 3
        { capital_required: -10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId }, // Would fail gate 4
        { strategy_type: "high_risk_pivot", engagement_id: engagementId, workspace_id: workspaceId } // Would fail gate 5
      );

      // Only gate 1 should be evaluated
      expect(result.gateResults.length).toBe(1);
      expect(result.firstFailure).toBe("data_sufficient");
    });
  });

  describe("Gate Order - Sequence Enforcement", () => {
    it("should check gates in correct order: 1->2->3->4->5", async () => {
      const result = await enforcer.enforceAllGates(
        validDiagnosticData,
        { effort_hours: 40, available_hours: 100, engagement_id: engagementId, workspace_id: workspaceId },
        { capital_required: 10000, payback_days: 30, engagement_id: engagementId, workspace_id: workspaceId },
        { engagement_id: engagementId, workspace_id: workspaceId }
      );

      expect(result.gateResults.map((g) => g.name)).toEqual([
        "data_sufficient",
        "contradiction_free",
        "capacity_available",
        "cash_runway_safe",
        "legal_compliance_ok",
      ]);
    });
  });
});
