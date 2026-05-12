import { describe, it, expect } from "vitest";
import {
  FinancialHealth,
  OwnerAvailability,
  OwnerCommitment,
  TeamCapability,
  assessFinancialHealth,
  scoreOwnerHealth,
  scoreTeamCapability,
  scoreCustomerHealth,
  calculateOverallHealth,
  healthScoreToStatus,
  identifyRiskFactors,
  identifyStrengths,
} from "@/domain/business-condition/business-condition";

describe("Business Condition Model", () => {
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const engagementId = "660e8400-e29b-41d4-a716-446655440001";
  const userId = "770e8400-e29b-41d4-a716-446655440002";

  describe("Financial Health Assessment", () => {
    it("should assess critical health with <1 month runway", () => {
      const health = assessFinancialHealth({
        monthlyRecurringRevenue: 50000,
        monthlyExpenses: 60000,
        cashOnHand: 20000,
        burnRate: 10000,
        cashRunwayMonths: 0.5,
        grossMargin: 60,
        customerConcentration: 30,
        operatingMargin: -20,
        dataSource: "accounting_software",
        lastUpdated: new Date(),
      });
      expect(health).toBe(FinancialHealth.CRITICAL);
    });

    it("should assess stressed health with 1-3 months runway", () => {
      const health = assessFinancialHealth({
        monthlyRecurringRevenue: 50000,
        monthlyExpenses: 60000,
        cashOnHand: 100000,
        burnRate: 10000,
        cashRunwayMonths: 2,
        grossMargin: 60,
        customerConcentration: 30,
        operatingMargin: -20,
        dataSource: "accounting_software",
        lastUpdated: new Date(),
      });
      expect(health).toBe(FinancialHealth.STRESSED);
    });

    it("should assess stable health with 6-12 months runway", () => {
      const health = assessFinancialHealth({
        monthlyRecurringRevenue: 100000,
        monthlyExpenses: 40000,
        cashOnHand: 360000,
        burnRate: 0,
        cashRunwayMonths: 9,
        grossMargin: 80,
        customerConcentration: 20,
        operatingMargin: 60,
        dataSource: "accounting_software",
        lastUpdated: new Date(),
      });
      expect(health).toBe(FinancialHealth.STABLE);
    });

    it("should assess healthy with 12+ months runway", () => {
      const health = assessFinancialHealth({
        monthlyRecurringRevenue: 200000,
        monthlyExpenses: 80000,
        cashOnHand: 1440000,
        burnRate: 0,
        cashRunwayMonths: 24,
        grossMargin: 80,
        customerConcentration: 20,
        operatingMargin: 60,
        dataSource: "accounting_software",
        lastUpdated: new Date(),
      });
      expect(health).toBe(FinancialHealth.HEALTHY);
    });

    it("should assess thriving with 18+ months runway and growth", () => {
      const health = assessFinancialHealth({
        monthlyRecurringRevenue: 300000,
        monthlyExpenses: 100000,
        cashOnHand: 2000000,
        burnRate: -100000,
        cashRunwayMonths: 36,
        grossMargin: 85,
        customerConcentration: 15,
        operatingMargin: 70,
        dataSource: "accounting_software",
        lastUpdated: new Date(),
      });
      expect(health).toBe(FinancialHealth.THRIVING);
    });
  });

  describe("Owner Health Scoring", () => {
    it("should score relentless full-time owner with no bottleneck highly", () => {
      const score = scoreOwnerHealth({
        availability: OwnerAvailability.FULL_TIME,
        commitment: OwnerCommitment.RELENTLESS,
        capabilityLevel: "exceptional",
        isBottleneck: false,
        burnoutRisk: 10,
        hasSuccessor: true,
        lastAssessmentAt: new Date(),
      });
      expect(score).toBeGreaterThan(80);
    });

    it("should score unavailable uncommitted owner with bottleneck low", () => {
      const score = scoreOwnerHealth({
        availability: OwnerAvailability.UNAVAILABLE,
        commitment: OwnerCommitment.UNCOMMITTED,
        capabilityLevel: "weak",
        isBottleneck: true,
        burnoutRisk: 90,
        hasSuccessor: false,
        lastAssessmentAt: new Date(),
      });
      expect(score).toBeLessThan(30);
    });

    it("should penalize high burnout risk", () => {
      const healthyBurnout = scoreOwnerHealth({
        availability: OwnerAvailability.FULL_TIME,
        commitment: OwnerCommitment.COMMITTED,
        capabilityLevel: "strong",
        isBottleneck: false,
        burnoutRisk: 10,
        hasSuccessor: true,
        lastAssessmentAt: new Date(),
      });

      const highBurnout = scoreOwnerHealth({
        availability: OwnerAvailability.FULL_TIME,
        commitment: OwnerCommitment.COMMITTED,
        capabilityLevel: "strong",
        isBottleneck: false,
        burnoutRisk: 80,
        hasSuccessor: true,
        lastAssessmentAt: new Date(),
      });

      expect(healthyBurnout).toBeGreaterThan(highBurnout + 15);
    });

    it("should reward founder with documented successor", () => {
      const withSuccessor = scoreOwnerHealth({
        availability: OwnerAvailability.FULL_TIME,
        commitment: OwnerCommitment.COMMITTED,
        capabilityLevel: "strong",
        isBottleneck: true,
        burnoutRisk: 30,
        hasSuccessor: true,
        lastAssessmentAt: new Date(),
      });

      const noSuccessor = scoreOwnerHealth({
        availability: OwnerAvailability.FULL_TIME,
        commitment: OwnerCommitment.COMMITTED,
        capabilityLevel: "strong",
        isBottleneck: true,
        burnoutRisk: 30,
        hasSuccessor: false,
        lastAssessmentAt: new Date(),
      });

      expect(withSuccessor).toBeGreaterThan(noSuccessor + 5);
    });
  });

  describe("Team Capability Scoring", () => {
    it("should score exceptional team high", () => {
      const score = scoreTeamCapability({
        teamSize: 50,
        capabilityLevel: TeamCapability.EXCEPTIONAL,
        engineeringCapability: "strong",
        productCapability: "strong",
        salesCapability: "strong",
        operationsCapability: "strong",
        keyPersonDependency: [],
        turnoverRate: 5,
        recentHires: 5,
        recentDepartures: 0,
        culturHealth: "excellent",
      });
      expect(score).toBeGreaterThan(90);
    });

    it("should score minimal team low", () => {
      const score = scoreTeamCapability({
        teamSize: 1,
        capabilityLevel: TeamCapability.MINIMAL,
        engineeringCapability: "minimal",
        productCapability: "minimal",
        salesCapability: "minimal",
        operationsCapability: "minimal",
        keyPersonDependency: ["founder"],
        turnoverRate: 0,
        recentHires: 0,
        recentDepartures: 0,
        culturHealth: "neutral",
      });
      expect(score).toBeLessThan(20);
    });

    it("should penalize high turnover", () => {
      const lowTurnover = scoreTeamCapability({
        teamSize: 20,
        capabilityLevel: TeamCapability.STRONG,
        engineeringCapability: "strong",
        productCapability: "strong",
        salesCapability: "competent",
        operationsCapability: "competent",
        keyPersonDependency: [],
        turnoverRate: 5,
        recentHires: 2,
        recentDepartures: 0,
        culturHealth: "good",
      });

      const highTurnover = scoreTeamCapability({
        teamSize: 20,
        capabilityLevel: TeamCapability.STRONG,
        engineeringCapability: "strong",
        productCapability: "strong",
        salesCapability: "competent",
        operationsCapability: "competent",
        keyPersonDependency: [],
        turnoverRate: 40,
        recentHires: 2,
        recentDepartures: 0,
        culturHealth: "good",
      });

      expect(lowTurnover).toBeGreaterThan(highTurnover + 8);
    });

    it("should penalize net departures", () => {
      const netPositive = scoreTeamCapability({
        teamSize: 15,
        capabilityLevel: TeamCapability.COMPETENT,
        engineeringCapability: "competent",
        productCapability: "competent",
        salesCapability: "competent",
        operationsCapability: "emerging",
        keyPersonDependency: [],
        turnoverRate: 10,
        recentHires: 5,
        recentDepartures: 0,
        culturHealth: "good",
      });

      const netNegative = scoreTeamCapability({
        teamSize: 15,
        capabilityLevel: TeamCapability.COMPETENT,
        engineeringCapability: "competent",
        productCapability: "competent",
        salesCapability: "competent",
        operationsCapability: "emerging",
        keyPersonDependency: [],
        turnoverRate: 10,
        recentHires: 0,
        recentDepartures: 3,
        culturHealth: "good",
      });

      expect(netPositive).toBeGreaterThan(netNegative + 3);
    });

    it("should reward excellent culture health", () => {
      const excellentCulture = scoreTeamCapability({
        teamSize: 20,
        capabilityLevel: TeamCapability.STRONG,
        engineeringCapability: "strong",
        productCapability: "strong",
        salesCapability: "competent",
        operationsCapability: "competent",
        keyPersonDependency: [],
        turnoverRate: 8,
        recentHires: 2,
        recentDepartures: 0,
        culturHealth: "excellent",
      });

      const toxicCulture = scoreTeamCapability({
        teamSize: 20,
        capabilityLevel: TeamCapability.STRONG,
        engineeringCapability: "strong",
        productCapability: "strong",
        salesCapability: "competent",
        operationsCapability: "competent",
        keyPersonDependency: [],
        turnoverRate: 8,
        recentHires: 2,
        recentDepartures: 0,
        culturHealth: "toxic",
      });

      expect(excellentCulture).toBeGreaterThan(toxicCulture + 25);
    });
  });

  describe("Customer Health Scoring", () => {
    it("should score healthy customer metrics highly", () => {
      const score = scoreCustomerHealth({
        totalCustomers: 500,
        activeCustomers: 480,
        monthlyChurn: 2,
        netRetentionRate: 120,
        npsScore: 65,
        customerAcquisitionCost: 500,
        customerLifetimeValue: 50000,
        paybackMonths: 2,
        marketShare: 15,
        marketPosition: "strong",
        competitiveAdvantage: ["Better UX", "Lower price", "Faster support"],
        lastAssessmentAt: new Date(),
      });
      expect(score).toBeGreaterThan(70);
    });

    it("should score poor customer metrics low", () => {
      const score = scoreCustomerHealth({
        totalCustomers: 50,
        activeCustomers: 30,
        monthlyChurn: 15,
        netRetentionRate: 70,
        npsScore: -45,
        customerAcquisitionCost: 2000,
        customerLifetimeValue: 5000,
        paybackMonths: 24,
        marketShare: 0.1,
        marketPosition: "lost",
        competitiveAdvantage: [],
        lastAssessmentAt: new Date(),
      });
      expect(score).toBeLessThan(35);
    });

    it("should reward dominant market position", () => {
      const dominant = scoreCustomerHealth({
        totalCustomers: 1000,
        activeCustomers: 950,
        monthlyChurn: 1,
        netRetentionRate: 115,
        npsScore: 60,
        customerAcquisitionCost: 400,
        customerLifetimeValue: 40000,
        paybackMonths: 1,
        marketShare: 40,
        marketPosition: "dominant",
        competitiveAdvantage: ["Market leader", "Network effects"],
        lastAssessmentAt: new Date(),
      });

      const weak = scoreCustomerHealth({
        totalCustomers: 1000,
        activeCustomers: 950,
        monthlyChurn: 1,
        netRetentionRate: 115,
        npsScore: 60,
        customerAcquisitionCost: 400,
        customerLifetimeValue: 40000,
        paybackMonths: 1,
        marketShare: 2,
        marketPosition: "weak",
        competitiveAdvantage: [],
        lastAssessmentAt: new Date(),
      });

      expect(dominant).toBeGreaterThan(weak + 20);
    });

    it("should heavily penalize lost market position", () => {
      const intact = scoreCustomerHealth({
        totalCustomers: 100,
        activeCustomers: 90,
        monthlyChurn: 3,
        netRetentionRate: 100,
        npsScore: 30,
        customerAcquisitionCost: 800,
        customerLifetimeValue: 15000,
        paybackMonths: 3,
        marketShare: 1,
        marketPosition: "viable",
        competitiveAdvantage: ["Price competitive"],
        lastAssessmentAt: new Date(),
      });

      const lost = scoreCustomerHealth({
        totalCustomers: 100,
        activeCustomers: 90,
        monthlyChurn: 3,
        netRetentionRate: 100,
        npsScore: 30,
        customerAcquisitionCost: 800,
        customerLifetimeValue: 15000,
        paybackMonths: 3,
        marketShare: 0.5,
        marketPosition: "lost",
        competitiveAdvantage: [],
        lastAssessmentAt: new Date(),
      });

      expect(intact).toBeGreaterThan(lost + 20);
    });

    it("should reward strong NPS", () => {
      const strongNps = scoreCustomerHealth({
        totalCustomers: 200,
        activeCustomers: 190,
        monthlyChurn: 3,
        netRetentionRate: 105,
        npsScore: 65,
        customerAcquisitionCost: 600,
        customerLifetimeValue: 25000,
        paybackMonths: 2,
        marketShare: 3,
        marketPosition: "viable",
        competitiveAdvantage: ["Good support"],
        lastAssessmentAt: new Date(),
      });

      const poorNps = scoreCustomerHealth({
        totalCustomers: 200,
        activeCustomers: 190,
        monthlyChurn: 3,
        netRetentionRate: 105,
        npsScore: -30,
        customerAcquisitionCost: 600,
        customerLifetimeValue: 25000,
        paybackMonths: 2,
        marketShare: 3,
        marketPosition: "viable",
        competitiveAdvantage: ["Good support"],
        lastAssessmentAt: new Date(),
      });

      expect(strongNps).toBeGreaterThan(poorNps + 25);
    });
  });

  describe("Overall Health Calculation", () => {
    it("should calculate weighted overall health", () => {
      const condition = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        financials: {
          monthlyRecurringRevenue: 100000,
          monthlyExpenses: 50000,
          cashOnHand: 500000,
          burnRate: 0,
          cashRunwayMonths: 10,
          grossMargin: 75,
          customerConcentration: 25,
          operatingMargin: 50,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.COMMITTED,
          capabilityLevel: "strong" as const,
          isBottleneck: false,
          burnoutRisk: 20,
          hasSuccessor: true,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 20,
          capabilityLevel: TeamCapability.STRONG,
          engineeringCapability: "strong" as const,
          productCapability: "competent" as const,
          salesCapability: "competent" as const,
          operationsCapability: "competent" as const,
          keyPersonDependency: [],
          turnoverRate: 8,
          recentHires: 2,
          recentDepartures: 0,
          culturHealth: "good" as const,
        },
        customer: {
          totalCustomers: 300,
          activeCustomers: 290,
          monthlyChurn: 2,
          netRetentionRate: 110,
          npsScore: 50,
          customerAcquisitionCost: 500,
          customerLifetimeValue: 30000,
          paybackMonths: 1,
          marketShare: 5,
          marketPosition: "strong" as const,
          competitiveAdvantage: ["Better product"],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const overall = calculateOverallHealth(condition);
      expect(overall).toBeGreaterThan(60);
      expect(overall).toBeLessThan(100);
    });

    it("should weight financial health heavily", () => {
      const healthyFinance = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        financials: {
          monthlyRecurringRevenue: 200000,
          monthlyExpenses: 50000,
          cashOnHand: 1000000,
          burnRate: -50000,
          cashRunwayMonths: 24,
          grossMargin: 80,
          customerConcentration: 20,
          operatingMargin: 75,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.LIMITED,
          commitment: OwnerCommitment.CONDITIONAL,
          capabilityLevel: "weak" as const,
          isBottleneck: true,
          burnoutRisk: 50,
          hasSuccessor: false,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 3,
          capabilityLevel: TeamCapability.EMERGING,
          engineeringCapability: "emerging" as const,
          productCapability: "emerging" as const,
          salesCapability: "emerging" as const,
          operationsCapability: "minimal" as const,
          keyPersonDependency: ["founder", "lead engineer"],
          turnoverRate: 20,
          recentHires: 0,
          recentDepartures: 2,
          culturHealth: "neutral" as const,
        },
        customer: {
          totalCustomers: 50,
          activeCustomers: 45,
          monthlyChurn: 8,
          netRetentionRate: 90,
          npsScore: -10,
          customerAcquisitionCost: 2000,
          customerLifetimeValue: 5000,
          paybackMonths: 8,
          marketShare: 0.5,
          marketPosition: "weak" as const,
          competitiveAdvantage: [],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const overall = calculateOverallHealth(healthyFinance);
      expect(overall).toBeGreaterThan(50); // Good finance helps despite weak other areas
    });
  });

  describe("Health Status Conversion", () => {
    it("should convert scores to status levels", () => {
      expect(healthScoreToStatus(10)).toBe("critical");
      expect(healthScoreToStatus(30)).toBe("stressed");
      expect(healthScoreToStatus(50)).toBe("stable");
      expect(healthScoreToStatus(70)).toBe("healthy");
      expect(healthScoreToStatus(90)).toBe("thriving");
    });

    it("should handle boundary values", () => {
      expect(healthScoreToStatus(19)).toBe("critical");
      expect(healthScoreToStatus(20)).toBe("stressed");
      expect(healthScoreToStatus(60)).toBe("healthy");
      expect(healthScoreToStatus(80)).toBe("thriving");
    });
  });

  describe("Risk Factor Identification", () => {
    it("should identify critical cash runway risk", () => {
      const condition = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "critical" as const,
        financials: {
          monthlyRecurringRevenue: 10000,
          monthlyExpenses: 30000,
          cashOnHand: 10000,
          burnRate: 20000,
          cashRunwayMonths: 0.5,
          grossMargin: 40,
          customerConcentration: 30,
          operatingMargin: -200,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.COMMITTED,
          capabilityLevel: "capable" as const,
          isBottleneck: false,
          burnoutRisk: 30,
          hasSuccessor: true,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 10,
          capabilityLevel: TeamCapability.COMPETENT,
          engineeringCapability: "competent" as const,
          productCapability: "competent" as const,
          salesCapability: "competent" as const,
          operationsCapability: "competent" as const,
          keyPersonDependency: [],
          turnoverRate: 5,
          recentHires: 0,
          recentDepartures: 0,
          culturHealth: "good" as const,
        },
        customer: {
          totalCustomers: 100,
          activeCustomers: 95,
          monthlyChurn: 3,
          netRetentionRate: 105,
          npsScore: 40,
          customerAcquisitionCost: 600,
          customerLifetimeValue: 20000,
          paybackMonths: 2,
          marketShare: 1,
          marketPosition: "viable" as const,
          competitiveAdvantage: [],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const risks = identifyRiskFactors(condition);
      expect(risks.some((r) => r.includes("Critical cash runway"))).toBe(true);
      expect(risks.some((r) => r.includes("Burn exceeds revenue"))).toBe(true);
    });

    it("should identify owner risks", () => {
      const condition = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "stressed" as const,
        financials: {
          monthlyRecurringRevenue: 50000,
          monthlyExpenses: 40000,
          cashOnHand: 200000,
          burnRate: 0,
          cashRunwayMonths: 5,
          grossMargin: 70,
          customerConcentration: 35,
          operatingMargin: 20,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.UNAVAILABLE,
          commitment: OwnerCommitment.UNCOMMITTED,
          capabilityLevel: "weak" as const,
          isBottleneck: true,
          burnoutRisk: 80,
          hasSuccessor: false,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 5,
          capabilityLevel: TeamCapability.COMPETENT,
          engineeringCapability: "competent" as const,
          productCapability: "competent" as const,
          salesCapability: "emerging" as const,
          operationsCapability: "emerging" as const,
          keyPersonDependency: ["founder"],
          turnoverRate: 5,
          recentHires: 0,
          recentDepartures: 0,
          culturHealth: "neutral" as const,
        },
        customer: {
          totalCustomers: 120,
          activeCustomers: 115,
          monthlyChurn: 2,
          netRetentionRate: 108,
          npsScore: 45,
          customerAcquisitionCost: 700,
          customerLifetimeValue: 25000,
          paybackMonths: 2,
          marketShare: 2,
          marketPosition: "viable" as const,
          competitiveAdvantage: ["Reliable"],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const risks = identifyRiskFactors(condition);
      expect(risks.some((r) => r.includes("Owner unavailable"))).toBe(true);
      expect(risks.some((r) => r.includes("Owner uncommitted"))).toBe(true);
      expect(risks.some((r) => r.includes("High burnout"))).toBe(true);
      expect(risks.some((r) => r.includes("Key person"))).toBe(true);
    });
  });

  describe("Strength Identification", () => {
    it("should identify financial strengths", () => {
      const condition = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "thriving" as const,
        financials: {
          monthlyRecurringRevenue: 500000,
          monthlyExpenses: 150000,
          cashOnHand: 5000000,
          burnRate: -200000,
          cashRunwayMonths: 36,
          grossMargin: 85,
          customerConcentration: 15,
          operatingMargin: 70,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.RELENTLESS,
          capabilityLevel: "exceptional" as const,
          isBottleneck: false,
          burnoutRisk: 10,
          hasSuccessor: true,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 50,
          capabilityLevel: TeamCapability.EXCEPTIONAL,
          engineeringCapability: "strong" as const,
          productCapability: "strong" as const,
          salesCapability: "strong" as const,
          operationsCapability: "strong" as const,
          keyPersonDependency: [],
          turnoverRate: 5,
          recentHires: 8,
          recentDepartures: 0,
          culturHealth: "excellent" as const,
        },
        customer: {
          totalCustomers: 2000,
          activeCustomers: 1900,
          monthlyChurn: 1,
          netRetentionRate: 125,
          npsScore: 70,
          customerAcquisitionCost: 300,
          customerLifetimeValue: 100000,
          paybackMonths: 1,
          marketShare: 25,
          marketPosition: "dominant" as const,
          competitiveAdvantage: ["Innovative", "Market leader", "Superior UX"],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const strengths = identifyStrengths(condition);
      expect(strengths.some((s) => s.includes("Strong cash"))).toBe(true);
      expect(strengths.some((s) => s.includes("Expansion revenue"))).toBe(true);
      expect(strengths.some((s) => s.includes("Committed founder"))).toBe(true);
      expect(strengths.some((s) => s.includes("Strong team"))).toBe(true);
      expect(strengths.some((s) => s.includes("Strong NPS"))).toBe(true);
      expect(strengths.some((s) => s.includes("Strong market"))).toBe(true);
    });

    it("should identify low turnover as strength", () => {
      const condition = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "healthy" as const,
        financials: {
          monthlyRecurringRevenue: 100000,
          monthlyExpenses: 50000,
          cashOnHand: 600000,
          burnRate: 0,
          cashRunwayMonths: 12,
          grossMargin: 70,
          customerConcentration: 35,
          operatingMargin: 50,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.COMMITTED,
          capabilityLevel: "capable" as const,
          isBottleneck: false,
          burnoutRisk: 25,
          hasSuccessor: true,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 20,
          capabilityLevel: TeamCapability.STRONG,
          engineeringCapability: "strong" as const,
          productCapability: "competent" as const,
          salesCapability: "competent" as const,
          operationsCapability: "competent" as const,
          keyPersonDependency: [],
          turnoverRate: 5,
          recentHires: 1,
          recentDepartures: 0,
          culturHealth: "good" as const,
        },
        customer: {
          totalCustomers: 400,
          activeCustomers: 380,
          monthlyChurn: 2,
          netRetentionRate: 112,
          npsScore: 55,
          customerAcquisitionCost: 500,
          customerLifetimeValue: 35000,
          paybackMonths: 1,
          marketShare: 8,
          marketPosition: "strong" as const,
          competitiveAdvantage: ["Good support", "Reliable"],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const strengths = identifyStrengths(condition);
      expect(strengths.some((s) => s.includes("Low turnover"))).toBe(true);
    });
  });

  describe("Real-world scenarios", () => {
    it("should assess early-stage startup correctly", () => {
      const earlyStage = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "stressed" as const,
        financials: {
          monthlyRecurringRevenue: 0,
          monthlyExpenses: 30000,
          cashOnHand: 60000,
          burnRate: 30000,
          cashRunwayMonths: 2,
          grossMargin: 0,
          customerConcentration: 50,
          operatingMargin: -100,
          dataSource: "estimate" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.RELENTLESS,
          capabilityLevel: "capable" as const,
          isBottleneck: true,
          burnoutRisk: 70,
          hasSuccessor: false,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 3,
          capabilityLevel: TeamCapability.EMERGING,
          engineeringCapability: "emerging" as const,
          productCapability: "minimal" as const,
          salesCapability: "minimal" as const,
          operationsCapability: "minimal" as const,
          keyPersonDependency: ["founder", "lead engineer"],
          turnoverRate: 0,
          recentHires: 2,
          recentDepartures: 0,
          culturHealth: "good" as const,
        },
        customer: {
          totalCustomers: 20,
          activeCustomers: 18,
          monthlyChurn: 10,
          netRetentionRate: 80,
          npsScore: 20,
          customerAcquisitionCost: 5000,
          customerLifetimeValue: 2000,
          paybackMonths: 12,
          marketShare: 0.01,
          marketPosition: "lost" as const,
          competitiveAdvantage: [],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const risks = identifyRiskFactors(earlyStage);
      expect(risks.length).toBeGreaterThan(3);
      expect(risks.some((r) => r.includes("Critical cash"))).toBe(true);
    });

    it("should assess scale-up company correctly", () => {
      const scaleUp = {
        workspaceId,
        engagementId,
        assessedAt: new Date(),
        assessedByUserId: userId,
        overallHealth: "healthy" as const,
        financials: {
          monthlyRecurringRevenue: 250000,
          monthlyExpenses: 100000,
          cashOnHand: 1500000,
          burnRate: -50000,
          cashRunwayMonths: 18,
          grossMargin: 80,
          customerConcentration: 20,
          operatingMargin: 60,
          dataSource: "accounting_software" as const,
          lastUpdated: new Date(),
        },
        owner: {
          availability: OwnerAvailability.FULL_TIME,
          commitment: OwnerCommitment.COMMITTED,
          capabilityLevel: "strong" as const,
          isBottleneck: false,
          burnoutRisk: 35,
          hasSuccessor: true,
          lastAssessmentAt: new Date(),
        },
        capacity: {
          teamSize: 35,
          capabilityLevel: TeamCapability.STRONG,
          engineeringCapability: "strong" as const,
          productCapability: "strong" as const,
          salesCapability: "competent" as const,
          operationsCapability: "competent" as const,
          keyPersonDependency: [],
          turnoverRate: 10,
          recentHires: 8,
          recentDepartures: 2,
          culturHealth: "good" as const,
        },
        customer: {
          totalCustomers: 1200,
          activeCustomers: 1100,
          monthlyChurn: 2,
          netRetentionRate: 115,
          npsScore: 60,
          customerAcquisitionCost: 400,
          customerLifetimeValue: 50000,
          paybackMonths: 1,
          marketShare: 15,
          marketPosition: "strong" as const,
          competitiveAdvantage: ["Scale advantage", "Brand", "Product quality"],
          lastAssessmentAt: new Date(),
        },
        riskFactors: [],
        strengths: [],
      };

      const overall = calculateOverallHealth(scaleUp);
      expect(overall).toBeGreaterThan(65);

      const strengths = identifyStrengths(scaleUp);
      expect(strengths.length).toBeGreaterThan(3);
    });
  });
});
