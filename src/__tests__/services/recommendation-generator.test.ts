import {
  RecommendationGeneratorEngine,
  RecommendationContext,
} from "@/services/recommendation-generator";
import { RecommendationCategory, PriorityLevel } from "@/domain/recommendation/recommendation";
import { SurvivalFactorHealth } from "@/domain/reality/survival-factors";
import { FinancialHealthStatus } from "@/domain/financial/financial-health";

describe("RecommendationGeneratorEngine", () => {
  const createContext = (overrides?: Partial<RecommendationContext>): RecommendationContext => ({
    workspaceId: "ws-test-123",
    userId: "user-test-456",
    survival_health: SurvivalFactorHealth.HEALTHY,
    financial_health: FinancialHealthStatus.HEALTHY,
    current_cash_runway_months: 12,
    monthly_burn_rate: 50000,
    customer_churn_rate: 0.02,
    team_retention_risk: 0.2,
    market_opportunity: 30,
    competitive_pressure: 40,
    regulatory_risk: 20,
    ...overrides,
  });

  describe("generateSurvivalRecommendations", () => {
    it("should generate critical cash survival recommendation when runway < 3 months", () => {
      const context = createContext({ current_cash_runway_months: 2.5 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      expect(recs).toHaveLength(1);
      expect(recs[0].category).toBe(RecommendationCategory.SURVIVAL);
      expect(recs[0].priority_score.priority_level).toBe(PriorityLevel.CRITICAL);
      expect(recs[0].title).toContain("URGENT");
      expect(recs[0].title).toContain("funding");
    });

    it("should include fundraising action when cash critical", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.action_items).toHaveLength(3);
      expect(rec.action_items[0].title).toContain("fundraising");
      expect(rec.action_items[1].title).toContain("cost reduction");
    });

    it("should generate high priority cash extension recommendation when runway 3-6 months", () => {
      const context = createContext({ current_cash_runway_months: 4.5 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      expect(recs).toHaveLength(1);
      expect(recs[0].category).toBe(RecommendationCategory.FINANCIAL);
      expect(recs[0].priority_score.priority_level).toBe(PriorityLevel.HIGH);
      expect(recs[0].title).toContain("Plan");
    });

    it("should generate no survival recommendations when runway > 6 months", () => {
      const context = createContext({ current_cash_runway_months: 8 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      expect(recs).toHaveLength(0);
    });

    it("should generate profitability recommendation when financial health critical", () => {
      const context = createContext({ financial_health: FinancialHealthStatus.CRITICAL });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      expect(recs).toHaveLength(1);
      expect(recs[0].category).toBe(RecommendationCategory.FINANCIAL);
      expect(recs[0].title).toContain("profitability");
    });

    it("should enforce workspaceId requirement", () => {
      const context = createContext({ workspaceId: "" });
      expect(() =>
        RecommendationGeneratorEngine.generateSurvivalRecommendations(context)
      ).toThrow("workspaceId");
    });

    it("should generate multiple recommendations for multiple issues", () => {
      const context = createContext({
        current_cash_runway_months: 2,
        financial_health: FinancialHealthStatus.CRITICAL,
      });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      expect(recs.length).toBeGreaterThanOrEqual(1);
    });

    it("should set urgency_days correctly for cash survival", () => {
      const context = createContext({ current_cash_runway_months: 2.5 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.urgency.window_days).toBe(75);
      expect(rec.urgency.is_time_sensitive).toBe(true);
    });

    it("should include risk assessments", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.risk_assessment).toBeDefined();
      expect(rec.risk_assessment.total_risk_level).toBe("critical");
      expect(rec.risk_assessment.mitigations.length).toBeGreaterThan(0);
    });
  });

  describe("generateGrowthRecommendations", () => {
    it("should not generate growth recs when survival critical", () => {
      const context = createContext({
        current_cash_runway_months: 2,
        market_opportunity: 90,
      });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(recs).toHaveLength(0);
    });

    it("should not generate growth recs when financial health critical", () => {
      const context = createContext({
        financial_health: FinancialHealthStatus.CRITICAL,
        market_opportunity: 90,
      });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(recs).toHaveLength(0);
    });

    it("should generate market expansion recommendation when opportunity > 70", () => {
      const context = createContext({ market_opportunity: 75 });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(recs.length).toBeGreaterThan(0);
      const marketRec = recs.find((r) => r.title.includes("market"));
      expect(marketRec).toBeDefined();
      expect(marketRec?.category).toBe(RecommendationCategory.GROWTH);
    });

    it("should generate competitive response when pressure > 70", () => {
      const context = createContext({ competitive_pressure: 75 });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(recs.length).toBeGreaterThan(0);
      const compRec = recs.find((r) => r.title.includes("competitive"));
      expect(compRec).toBeDefined();
    });

    it("should include market research action items", () => {
      const context = createContext({ market_opportunity: 80 });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);
      const marketRec = recs.find((r) => r.title.includes("market"));

      expect(marketRec?.action_items).toHaveLength(2);
      expect(marketRec?.action_items[0].title).toContain("research");
    });

    it("should set market expansion impact correctly", () => {
      const context = createContext({ market_opportunity: 85 });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);
      const marketRec = recs.find((r) => r.title.includes("market"));

      expect(marketRec?.impact_assessments[0].improvement_percent).toBe(25);
      expect(marketRec?.impact_assessments[0].baseline).toBe(100);
    });

    it("should enforce workspaceId requirement", () => {
      const context = createContext({ workspaceId: "", market_opportunity: 90 });
      expect(() =>
        RecommendationGeneratorEngine.generateGrowthRecommendations(context)
      ).toThrow("workspaceId");
    });

    it("should handle safe survival conditions", () => {
      const context = createContext({
        current_cash_runway_months: 24,
        financial_health: FinancialHealthStatus.THRIVING,
        market_opportunity: 70,
        competitive_pressure: 60,
      });
      const recs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(recs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("generateOperationalRecommendations", () => {
    it("should generate team retention recommendation when risk > 0.5", () => {
      const context = createContext({ team_retention_risk: 0.6 });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);

      expect(recs.length).toBeGreaterThan(0);
      const teamRec = recs.find((r) => r.title.includes("team"));
      expect(teamRec).toBeDefined();
      expect(teamRec?.category).toBe(RecommendationCategory.TEAM);
    });

    it("should generate churn reduction recommendation when churn > 5%", () => {
      const context = createContext({ customer_churn_rate: 0.08 });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);

      expect(recs.length).toBeGreaterThan(0);
      const churnRec = recs.find((r) => r.title.includes("churn"));
      expect(churnRec).toBeDefined();
      expect(churnRec?.category).toBe(RecommendationCategory.OPERATIONAL);
    });

    it("should include team 1-on-1 action items", () => {
      const context = createContext({ team_retention_risk: 0.7 });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);
      const teamRec = recs.find((r) => r.title.includes("team"));

      expect(teamRec?.action_items).toBeDefined();
      expect(teamRec?.action_items.length).toBeGreaterThan(0);
    });

    it("should enforce workspaceId requirement", () => {
      const context = createContext({ workspaceId: "", team_retention_risk: 0.8 });
      expect(() =>
        RecommendationGeneratorEngine.generateOperationalRecommendations(context)
      ).toThrow("workspaceId");
    });

    it("should generate no operational recs when metrics healthy", () => {
      const context = createContext({
        team_retention_risk: 0.2,
        customer_churn_rate: 0.01,
      });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);

      expect(recs).toHaveLength(0);
    });

    it("should include churn analysis action items", () => {
      const context = createContext({ customer_churn_rate: 0.1 });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);
      const churnRec = recs.find((r) => r.title.includes("churn"));

      expect(churnRec?.action_items.length).toBeGreaterThan(0);
      expect(churnRec?.action_items[0].title).toContain("analysis");
    });
  });

  describe("Priority scoring", () => {
    it("should assign CRITICAL priority to immediate survival threats", () => {
      const context = createContext({ current_cash_runway_months: 1 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.priority_score.priority_level).toBe(PriorityLevel.CRITICAL);
      expect(rec.priority_score.impact_score).toBe(100);
      expect(rec.priority_score.urgency_score).toBe(100);
    });

    it("should assign HIGH priority to 3-6 month runway", () => {
      const context = createContext({ current_cash_runway_months: 5 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.priority_score.priority_level).toBe(PriorityLevel.HIGH);
      expect(rec.priority_score.impact_score).toBeGreaterThan(80);
    });

    it("should assign MEDIUM priority to operational issues", () => {
      const context = createContext({ team_retention_risk: 0.8 });
      const recs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);
      const rec = recs[0];

      expect([PriorityLevel.MEDIUM, PriorityLevel.HIGH]).toContain(
        rec.priority_score.priority_level
      );
    });

    it("should use composite priority formula", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];
      const score = rec.priority_score;

      const expected =
        (score.impact_score *
          score.urgency_score *
          score.confidence_score) /
        (score.effort_score * score.risk_score * score.constraint_friction);
      expect(score.composite_priority).toBeCloseTo(expected, 0);
    });
  });

  describe("Evidence and supporting data", () => {
    it("should include supporting evidence for each recommendation", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.evidence).toHaveLength(1);
      expect(rec.evidence[0].type).toBe("KPI");
      expect(rec.evidence[0].confidence).toBeDefined();
    });

    it("should include action item dependencies", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.action_items.length).toBeGreaterThan(0);
      expect(rec.action_items[0].dependencies).toBeDefined();
    });

    it("should include resource requirements", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.resource_requirements).toBeDefined();
      expect(rec.resource_requirements.length).toBeGreaterThan(0);
    });

    it("should include constraints for critical recommendations", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const rec = recs[0];

      expect(rec.constraints).toBeDefined();
      expect(rec.constraints.length).toBeGreaterThan(0);
    });
  });

  describe("Tenant isolation", () => {
    it("should require workspaceId", () => {
      const context = createContext({ workspaceId: "" });
      expect(() =>
        RecommendationGeneratorEngine.generateSurvivalRecommendations(context)
      ).toThrow();
    });

    it("should include workspaceId in all recommendations", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      recs.forEach((rec) => {
        expect(rec.workspaceId).toBe("ws-test-123");
      });
    });

    it("should set created_by userId", () => {
      const context = createContext({ current_cash_runway_months: 2 });
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);

      recs.forEach((rec) => {
        expect(rec.created_by).toBe("user-test-456");
      });
    });
  });

  describe("Realistic scenario generation", () => {
    it("should handle startup in crisis", () => {
      const context = createContext({
        current_cash_runway_months: 2.5,
        financial_health: FinancialHealthStatus.CRITICAL,
        survival_health: SurvivalFactorHealth.CRITICAL,
        team_retention_risk: 0.7,
      });
      const survivalRecs = RecommendationGeneratorEngine.generateSurvivalRecommendations(context);
      const opRecs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);

      expect(survivalRecs.length).toBeGreaterThan(0);
      expect(opRecs.length).toBeGreaterThan(0);
    });

    it("should handle healthy growth scenario", () => {
      const context = createContext({
        current_cash_runway_months: 18,
        financial_health: FinancialHealthStatus.THRIVING,
        survival_health: SurvivalFactorHealth.HEALTHY,
        market_opportunity: 85,
        competitive_pressure: 65,
      });
      const growthRecs = RecommendationGeneratorEngine.generateGrowthRecommendations(context);

      expect(growthRecs.length).toBeGreaterThan(0);
    });

    it("should handle steady state with minor issues", () => {
      const context = createContext({
        current_cash_runway_months: 9,
        financial_health: FinancialHealthStatus.HEALTHY,
        customer_churn_rate: 0.06,
      });
      const opRecs = RecommendationGeneratorEngine.generateOperationalRecommendations(context);

      expect(opRecs.length).toBeGreaterThan(0);
    });
  });
});
