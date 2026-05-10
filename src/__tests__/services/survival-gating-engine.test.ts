import { SurvivalGatingEngine } from "@/services/survival-gating-engine";
import { SurvivalFactorHealth, SurvivalFactorAssessment } from "@/domain/reality/survival-factors";
import { GatingAction, CrisisState } from "@/domain/survival/gating-policy";

describe("SurvivalGatingEngine", () => {
  const workspaceId = "ws-test-789";

  describe("evaluateGatingDecision", () => {
    it("should permit all actions in healthy state", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.HIRE_KEY_ROLE,
        workspaceId
      );

      expect(decision.permitted).toBe(true);
      expect(decision.crisisState).toBe(CrisisState.HEALTHY);
    });

    it("should block growth actions in elevated risk state", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.EXPAND_TO_NEW_MARKET,
        workspaceId
      );

      expect(decision.permitted).toBe(false);
      expect([CrisisState.ELEVATED_RISK, CrisisState.FRAGILE]).toContain(decision.crisisState);
    });

    it("should permit stabilization actions even in elevated risk", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.COST_REDUCTION,
        workspaceId
      );

      expect(decision.permitted).toBe(true);
    });

    it("should block ALL actions in survival crisis", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 5,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 35,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      // Growth action should be blocked
      const growthDecision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.LAUNCH_NEW_PRODUCT,
        workspaceId
      );
      expect(growthDecision.permitted).toBe(false);
      expect(growthDecision.crisisState).toBe(CrisisState.SURVIVAL_CRISIS);

      // Even stabilization action should be blocked
      const stabilizationDecision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.COST_REDUCTION,
        workspaceId
      );
      expect(stabilizationDecision.permitted).toBe(false);
      expect(stabilizationDecision.crisisState).toBe(CrisisState.SURVIVAL_CRISIS);
    });

    it("should require workspaceId for tenant scoping", () => {
      const assessments: SurvivalFactorAssessment[] = [];

      expect(() => {
        SurvivalGatingEngine.evaluateGatingDecision(
          assessments,
          GatingAction.HIRE_KEY_ROLE,
          ""
        );
      }).toThrow("workspaceId");
    });

    it("should generate appropriate rationale for decisions", () => {
      const healthyAssessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision = SurvivalGatingEngine.evaluateGatingDecision(
        healthyAssessments,
        GatingAction.HIRE_KEY_ROLE,
        workspaceId
      );

      expect(decision.rationale).toContain("HEALTHY");
      expect(decision.rationale).toContain("permitted");
    });

    it("should set unique IDs for gating decisions", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision1 = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.HIRE_KEY_ROLE,
        workspaceId
      );
      const decision2 = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.HIRE_KEY_ROLE,
        workspaceId
      );

      expect(decision1.id).not.toBe(decision2.id);
    });

    it("should include workspaceId in gating decision", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const decision = SurvivalGatingEngine.evaluateGatingDecision(
        assessments,
        GatingAction.HIRE_KEY_ROLE,
        workspaceId
      );

      expect(decision.workspaceId).toBe(workspaceId);
    });
  });

  describe("isInSurvivalCrisis", () => {
    it("should return true when in survival crisis", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 5,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      expect(SurvivalGatingEngine.isInSurvivalCrisis(assessments)).toBe(true);
    });

    it("should return false when not in crisis", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      expect(SurvivalGatingEngine.isInSurvivalCrisis(assessments)).toBe(false);
    });
  });

  describe("getGatingPolicyDocument", () => {
    it("should return policy document with workspace context", () => {
      const policy = SurvivalGatingEngine.getGatingPolicyDocument(workspaceId);

      expect(policy).toContain("SURVIVAL GATING POLICY");
      expect(policy).toContain(workspaceId);
      expect(policy).toContain("CRISIS STATES");
      expect(policy).toContain("BLOCKED GROWTH ACTIONS");
      expect(policy).toContain("PERMITTED ACTIONS");
    });

    it("should require workspaceId for policy document", () => {
      expect(() => {
        SurvivalGatingEngine.getGatingPolicyDocument("");
      }).toThrow("workspaceId");
    });
  });
});
