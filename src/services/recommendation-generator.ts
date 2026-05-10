/**
 * Recommendation Generator Engine (Phase 6 Slice 2)
 *
 * Generates recommendations by analyzing business context, survival factors,
 * financial health, and constraints. Integrates Phase 4-5 assessments into
 * actionable recommendations with priority scoring.
 *
 * Non-DB foundation: pure TypeScript recommendation generation logic.
 * Tenant-scoped: all recommendations bound to workspaceId.
 */

import {
  Recommendation,
  RecommendationCategory,
  RecommendationStatus,
  ImpactDimension,
  EffortScale,
  ConfidenceLevel,
  PriorityLevel,
  ActionItem,
  RecommendationEvidence,
  ImpactAssessment,
  UrgencyAssessment,
  PriorityScore,
  RiskAssessment,
  ResourceRequirement,
  ConstraintFactor,
  RECOMMENDATION_THRESHOLDS,
} from "@/domain/recommendation/recommendation";
import { SurvivalFactorHealth } from "@/domain/reality/survival-factors";
import { FinancialHealthStatus } from "@/domain/financial/financial-health";

/**
 * Recommendation generation context
 */
export interface RecommendationContext {
  workspaceId: string;
  userId: string;
  survival_health?: SurvivalFactorHealth; // From Phase 4
  financial_health?: FinancialHealthStatus; // From Phase 5
  current_cash_runway_months?: number; // From Phase 5
  monthly_burn_rate?: number; // From Phase 5
  customer_churn_rate?: number;
  team_retention_risk?: number; // 0-1 scale
  market_opportunity?: number; // 0-100 scale
  competitive_pressure?: number; // 0-100 scale
  regulatory_risk?: number; // 0-100 scale
}

/**
 * Recommendation generator service
 */
export class RecommendationGeneratorEngine {
  /**
   * Generate survival recommendations based on health crisis
   */
  static generateSurvivalRecommendations(context: RecommendationContext): Recommendation[] {
    if (!context.workspaceId) {
      throw new Error("Recommendation generation requires workspaceId");
    }

    const recommendations: Recommendation[] = [];

    // CRITICAL: Cash runway < 3 months
    if (context.current_cash_runway_months !== undefined && context.current_cash_runway_months < 3) {
      recommendations.push(
        this.createCashSurvivalRecommendation(context, context.current_cash_runway_months)
      );
    }

    // HIGH: Cash runway 3-6 months
    if (
      context.current_cash_runway_months !== undefined &&
      context.current_cash_runway_months >= 3 &&
      context.current_cash_runway_months < 6
    ) {
      recommendations.push(this.createCashExtensionRecommendation(context));
    }

    // HIGH: Profitability below breakeven
    if (context.financial_health === FinancialHealthStatus.CRITICAL) {
      recommendations.push(this.createProfitabilityRecommendation(context));
    }

    return recommendations;
  }

  /**
   * Generate growth recommendations based on opportunity
   */
  static generateGrowthRecommendations(context: RecommendationContext): Recommendation[] {
    if (!context.workspaceId) {
      throw new Error("Recommendation generation requires workspaceId");
    }

    const recommendations: Recommendation[] = [];

    // Only generate growth recs if survival is not critical
    const survivalOK =
      context.survival_health !== SurvivalFactorHealth.CRITICAL &&
      context.financial_health !== FinancialHealthStatus.CRITICAL &&
      (context.current_cash_runway_months === undefined || context.current_cash_runway_months > 6);

    if (!survivalOK) return [];

    // Market expansion opportunity
    if ((context.market_opportunity ?? 0) > 70) {
      recommendations.push(this.createMarketExpansionRecommendation(context));
    }

    // Competitive response needed
    if ((context.competitive_pressure ?? 0) > 70) {
      recommendations.push(this.createCompetitiveResponseRecommendation(context));
    }

    return recommendations;
  }

  /**
   * Generate operational recommendations
   */
  static generateOperationalRecommendations(context: RecommendationContext): Recommendation[] {
    if (!context.workspaceId) {
      throw new Error("Recommendation generation requires workspaceId");
    }

    const recommendations: Recommendation[] = [];

    // Team retention risk
    if ((context.team_retention_risk ?? 0) > 0.5) {
      recommendations.push(this.createTeamRetentionRecommendation(context));
    }

    // Churn problem
    if ((context.customer_churn_rate ?? 0) > 0.05) {
      recommendations.push(this.createChurnReductionRecommendation(context));
    }

    return recommendations;
  }

  /**
   * Create cash survival recommendation (critical: <3 months)
   */
  private static createCashSurvivalRecommendation(
    context: RecommendationContext,
    runway_months: number
  ): Recommendation {
    const id = `rec-${context.workspaceId}-cash-${Date.now()}`;
    const urgency_days = runway_months * 30;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.SURVIVAL,
      status: RecommendationStatus.PENDING,
      title: "URGENT: Secure funding or reduce burn immediately",
      summary: `Cash runway depletes in ${Math.ceil(runway_months)} months (${urgency_days} days)`,
      detailed_rationale:
        "Current cash balance will not sustain operations beyond the next 3 months at current burn rate. Immediate action required.",
      expected_outcome: "Extend runway to 12+ months through funding and/or cost reduction",
      success_criteria: [
        "Funding secured OR monthly burn reduced by 30%+",
        "Runway extended to minimum 6 months",
        "Operating plan updated with new financial targets",
      ],
      priority_score: {
        impact_score: 100,
        urgency_score: 100,
        confidence_score: 95,
        effort_score: 20,
        risk_score: 30,
        constraint_friction: 2.0,
        composite_priority: (100 * 100 * 95) / (20 * 30 * 2.0),
        priority_level: PriorityLevel.CRITICAL,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.SURVIVAL,
          baseline: runway_months,
          projected: 12,
          improvement_percent: ((12 - runway_months) / runway_months) * 100,
          confidence: ConfidenceLevel.VERY_HIGH,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: urgency_days,
        penalty_if_delayed_percent: 100,
        rationale: "Company runs out of cash at current burn rate",
      },
      action_items: [
        {
          id: "a1",
          title: "Immediate fundraising outreach",
          description: "Contact investors, strategic partners, customers for bridge funding",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 40,
          dependencies: [],
          owner_capability: "fundraising",
          is_parallel_safe: true,
          success_criteria: ["Meetings scheduled with 10+ potential funders"],
        },
        {
          id: "a2",
          title: "Emergency cost reduction sprint",
          description: "Identify and cut non-essential burn: subscriptions, contractor retainers, discretionary spend",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 16,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["$50k+ monthly burn reduction identified"],
        },
        {
          id: "a3",
          title: "Cash flow management optimization",
          description: "Accelerate receivables, negotiate payment terms, delay non-critical payables",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 8,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["$25k+ cash injection through flow optimization"],
        },
      ],
      resource_requirements: [
        {
          type: "PEOPLE",
          quantity: 1,
          unit: "FTE CEO/Founder for fundraising",
          bottleneck_risk: "high",
        },
        {
          type: "CAPITAL",
          estimated_cost: 500000,
          unit: "Target funding amount",
          bottleneck_risk: "high",
        },
      ],
      constraints: [
        {
          type: "OWNER_AVAILABILITY",
          severity: "high",
          description: "CEO must dedicate 80% time to fundraising immediately",
        },
        {
          type: "MARKET",
          severity: "high",
          description: "Funding market conditions may limit availability",
        },
      ],
      evidence: [
        {
          type: "KPI",
          source: "Financial projections",
          finding: `Cash runway ${runway_months.toFixed(1)} months`,
          measurement: runway_months,
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "high",
        market_risk: "high",
        financial_risk: "high",
        customer_risk: "high",
        total_risk_level: "critical",
        mitigations: [
          "Run multiple fundraising tracks simultaneously",
          "Prepare cost cut plan in advance",
          "Communicate transparently with stakeholders",
        ],
      },
    };
  }

  /**
   * Create cash extension recommendation (3-6 months runway)
   */
  private static createCashExtensionRecommendation(context: RecommendationContext): Recommendation {
    const id = `rec-${context.workspaceId}-ext-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.FINANCIAL,
      status: RecommendationStatus.PENDING,
      title: "Plan fundraising and cost optimization",
      summary: "Current runway 3-6 months. Begin fundraising and burn reduction planning.",
      detailed_rationale:
        "While not immediately critical, 3-6 month runway requires proactive planning. Start fundraising process now.",
      expected_outcome: "Runway extended to 12+ months, financial stability restored",
      success_criteria: [
        "Fundraising strategy finalized",
        "Cost reduction roadmap created",
        "Investor conversations started",
      ],
      priority_score: {
        impact_score: 90,
        urgency_score: 75,
        confidence_score: 85,
        effort_score: 60,
        risk_score: 50,
        constraint_friction: 1.2,
        composite_priority: 425,
        priority_level: PriorityLevel.HIGH,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.SURVIVAL,
          baseline: 4.5,
          projected: 12,
          improvement_percent: 167,
          confidence: ConfidenceLevel.HIGH,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: 30,
        penalty_if_delayed_percent: 50,
        rationale: "Fundraising takes 3-6 months; must start immediately",
      },
      action_items: [
        {
          id: "a1",
          title: "Develop fundraising strategy",
          description: "Define funding target, investor types, messaging",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 12,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Strategy doc completed"],
        },
        {
          id: "a2",
          title: "Build cost optimization plan",
          description: "Map all spend, identify reduction opportunities",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 24,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["20-30% burn reduction identified"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "KPI",
          source: "Cash projections",
          finding: "4.5 month runway",
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "medium",
        market_risk: "medium",
        financial_risk: "high",
        customer_risk: "low",
        total_risk_level: "high",
        mitigations: ["Start planning immediately", "Run multiple scenarios"],
      },
    };
  }

  /**
   * Create profitability recommendation
   */
  private static createProfitabilityRecommendation(context: RecommendationContext): Recommendation {
    const id = `rec-${context.workspaceId}-prof-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.FINANCIAL,
      status: RecommendationStatus.PENDING,
      title: "Achieve profitability or close unit economics gap",
      summary:
        "Business is unprofitable. Urgent focus needed on revenue growth or cost reduction to reach breakeven.",
      detailed_rationale:
        "Negative unit economics cannot sustain operations long-term. Either increase revenue per unit or reduce cost per unit.",
      expected_outcome: "Reach positive contribution margin and path to profitability",
      success_criteria: [
        "Unit economics model updated with improvement targets",
        "Revenue growth initiatives launched",
        "Cost reduction plan implemented",
      ],
      priority_score: {
        impact_score: 95,
        urgency_score: 85,
        confidence_score: 80,
        effort_score: 30,
        risk_score: 40,
        constraint_friction: 1.5,
        composite_priority: 1020,
        priority_level: PriorityLevel.CRITICAL,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.PROFITABILITY,
          baseline: 0,
          projected: 10,
          improvement_percent: 100,
          confidence: ConfidenceLevel.HIGH,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: 60,
        penalty_if_delayed_percent: 60,
        rationale: "Unprofitable burn rate exhausts runway quickly",
      },
      action_items: [
        {
          id: "a1",
          title: "Unit economics diagnostic",
          description: "Deep dive into CAC, LTV, margins by product/customer segment",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 32,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Detailed unit economics model by segment"],
        },
        {
          id: "a2",
          title: "Revenue optimization experiments",
          description: "Test pricing, product packaging, customer acquisition channels",
          estimated_effort: EffortScale.LARGE,
          estimated_hours: 80,
          dependencies: ["a1"],
          is_parallel_safe: false,
          success_criteria: ["3+ experiments launched"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "KPI",
          source: "Financial analysis",
          finding: "Negative unit economics",
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "high",
        market_risk: "high",
        financial_risk: "high",
        customer_risk: "medium",
        total_risk_level: "critical",
        mitigations: [
          "Test before scaling",
          "Focus on highest-leverage improvements first",
        ],
      },
    };
  }

  /**
   * Create market expansion recommendation
   */
  private static createMarketExpansionRecommendation(
    context: RecommendationContext
  ): Recommendation {
    const id = `rec-${context.workspaceId}-mkt-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.GROWTH,
      status: RecommendationStatus.PENDING,
      title: "Expand to new market segment",
      summary: "Strong market opportunity identified. Expansion could drive 20-30% revenue growth.",
      detailed_rationale: "Market analysis shows underserved segment with high demand and weak competition.",
      expected_outcome: "+25% revenue from new market within 12 months",
      success_criteria: [
        "Market entry plan created",
        "Pilot customer cohort acquired",
        "Revenue target achieved",
      ],
      priority_score: {
        impact_score: 80,
        urgency_score: 60,
        confidence_score: 70,
        effort_score: 40,
        risk_score: 60,
        constraint_friction: 1.2,
        composite_priority: 336,
        priority_level: PriorityLevel.HIGH,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.REVENUE,
          baseline: 100,
          projected: 125,
          improvement_percent: 25,
          confidence: ConfidenceLevel.MEDIUM,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: 90,
        penalty_if_delayed_percent: 30,
        rationale: "Competitor may enter market; first-mover advantage valuable",
      },
      action_items: [
        {
          id: "a1",
          title: "Market research and validation",
          description: "Interview 20+ prospects in target segment",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 40,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Validation report completed"],
        },
        {
          id: "a2",
          title: "Adapt product for segment",
          description: "Modify pricing, features for new segment",
          estimated_effort: EffortScale.LARGE,
          estimated_hours: 120,
          dependencies: ["a1"],
          is_parallel_safe: false,
          success_criteria: ["Product pilot ready"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "ANALYSIS",
          source: "Market research",
          finding: "Segment growing 50%/year with unmet needs",
          measured_at: new Date(),
          confidence: ConfidenceLevel.MEDIUM,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "medium",
        market_risk: "medium",
        financial_risk: "low",
        customer_risk: "medium",
        total_risk_level: "medium",
        mitigations: ["Run pilot before full commitment", "Plan withdrawal if market changes"],
      },
    };
  }

  /**
   * Create competitive response recommendation
   */
  private static createCompetitiveResponseRecommendation(
    context: RecommendationContext
  ): Recommendation {
    const id = `rec-${context.workspaceId}-comp-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.MARKET,
      status: RecommendationStatus.PENDING,
      title: "Respond to competitive threat",
      summary:
        "Competitive pressure high. Strategic response needed to defend market position.",
      detailed_rationale:
        "Competitors entering market or upgrading offerings. Delay in response risks market share loss.",
      expected_outcome: "Maintain or grow market share despite competitive entry",
      success_criteria: ["Competitive differentiation strategy defined", "Customer retention >95%"],
      priority_score: {
        impact_score: 85,
        urgency_score: 80,
        confidence_score: 75,
        effort_score: 50,
        risk_score: 55,
        constraint_friction: 1.3,
        composite_priority: 405,
        priority_level: PriorityLevel.HIGH,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.MARKET_POSITION,
          baseline: 50,
          projected: 60,
          improvement_percent: 20,
          confidence: ConfidenceLevel.MEDIUM,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: 60,
        penalty_if_delayed_percent: 70,
        rationale: "Competitive window closing; delayed response risks market loss",
      },
      action_items: [
        {
          id: "a1",
          title: "Competitive analysis and positioning",
          description: "Analyze competitive offerings and identify differentiation",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 16,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Positioning strategy document"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "ANALYSIS",
          source: "Competitive intelligence",
          finding: "2 new competitors with similar offerings",
          measured_at: new Date(),
          confidence: ConfidenceLevel.HIGH,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "medium",
        market_risk: "high",
        financial_risk: "medium",
        customer_risk: "high",
        total_risk_level: "high",
        mitigations: ["Move fast", "Communicate value to customers proactively"],
      },
    };
  }

  /**
   * Create team retention recommendation
   */
  private static createTeamRetentionRecommendation(
    context: RecommendationContext
  ): Recommendation {
    const id = `rec-${context.workspaceId}-team-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.TEAM,
      status: RecommendationStatus.PENDING,
      title: "Address team retention risk",
      summary: "High team turnover risk detected. Implement retention strategy immediately.",
      detailed_rationale:
        "Team turnover could delay critical initiatives and increase costs. Proactive retention measures needed.",
      expected_outcome: "Stabilize team, reduce turnover, maintain execution capacity",
      success_criteria: ["Retention measures implemented", "Turnover rate <10% annually"],
      priority_score: {
        impact_score: 75,
        urgency_score: 70,
        confidence_score: 80,
        effort_score: 60,
        risk_score: 65,
        constraint_friction: 1.1,
        composite_priority: 280,
        priority_level: PriorityLevel.MEDIUM,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.TEAM_CAPACITY,
          baseline: 0,
          projected: 0,
          improvement_percent: 0,
          confidence: ConfidenceLevel.MEDIUM,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: false,
        rationale: "Ongoing priority",
      },
      action_items: [
        {
          id: "a1",
          title: "Team conversation and feedback",
          description: "1-on-1s to understand retention risks",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 12,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["1-on-1s completed"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "KPI",
          source: "Turnover analysis",
          finding: "Higher than baseline team turnover risk",
          measured_at: new Date(),
          confidence: ConfidenceLevel.MEDIUM,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "low",
        market_risk: "low",
        financial_risk: "medium",
        customer_risk: "medium",
        total_risk_level: "medium",
        mitigations: ["Regular check-ins", "Career development planning"],
      },
    };
  }

  /**
   * Create churn reduction recommendation
   */
  private static createChurnReductionRecommendation(
    context: RecommendationContext
  ): Recommendation {
    const id = `rec-${context.workspaceId}-churn-${Date.now()}`;

    return {
      id,
      workspaceId: context.workspaceId,
      category: RecommendationCategory.OPERATIONAL,
      status: RecommendationStatus.PENDING,
      title: "Reduce customer churn",
      summary: "Customer churn rate elevated. Implement retention program.",
      detailed_rationale:
        "Churn rate above industry benchmark. Retention initiatives could recover 10-15% revenue.",
      expected_outcome: "Reduce churn rate to <3%, retain key accounts",
      success_criteria: [
        "Churn analysis completed",
        "Retention program launched",
        "Churn reduced by 30%+",
      ],
      priority_score: {
        impact_score: 70,
        urgency_score: 65,
        confidence_score: 75,
        effort_score: 70,
        risk_score: 70,
        constraint_friction: 1.0,
        composite_priority: 214,
        priority_level: PriorityLevel.MEDIUM,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.REVENUE,
          baseline: 100,
          projected: 112,
          improvement_percent: 12,
          confidence: ConfidenceLevel.MEDIUM,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: false,
        rationale: "Ongoing priority",
      },
      action_items: [
        {
          id: "a1",
          title: "Churn analysis and segmentation",
          description: "Identify churn patterns by customer segment",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 24,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Analysis report completed"],
        },
        {
          id: "a2",
          title: "Retention program design",
          description: "Create targeted retention interventions",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 32,
          dependencies: ["a1"],
          is_parallel_safe: false,
          success_criteria: ["Program launched"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "KPI",
          source: "Customer metrics",
          finding: "Churn rate elevated vs benchmark",
          measured_at: new Date(),
          confidence: ConfidenceLevel.MEDIUM,
        },
      ],
      created_at: new Date(),
      created_by: context.userId,
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "low",
        market_risk: "low",
        financial_risk: "medium",
        customer_risk: "high",
        total_risk_level: "medium",
        mitigations: [
          "Proactive customer engagement",
          "Win-back campaigns for at-risk customers",
        ],
      },
    };
  }
}
