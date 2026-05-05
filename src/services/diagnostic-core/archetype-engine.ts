import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  Archetype,
  ArchetypeAnalysis,
  RiskProfile,
  CapitalSensitivity,
  GrowthMode,
  ExecutionComplexity,
  StrategyType,
  DecisionConstraints,
} from "@/domain/diagnostic/archetype";

export interface DataSufficiencyCheck {
  isSufficient: boolean;
  missingFields: string[];
}

export interface ArchetypeIndicators {
  revenueTrend: number; // % change
  profitMargin: number; // 0-100
  cashFlow: number; // $ positive or negative
  debtToEquity: number; // ratio
  marketShare: number; // % of addressable market
  customerAcquisitionCost: number; // $ per customer
  customerLifetimeValue: number; // $
  burnRate: number; // $ per month
  runwayMonths: number; // months until capital exhaustion
}

export class ArchetypeEngine {
  async analyzeArchetype(
    engagementId: string,
    workspaceId: string,
    indicators: ArchetypeIndicators
  ): Promise<ArchetypeAnalysis | null> {
    const analysisId = uuidv4();

    // Step 1: Data sufficiency gate (STRICT)
    const sufficiencyCheck = this.checkDataSufficiency(indicators);

    if (!sufficiencyCheck.isSufficient) {
      logger.warn("Archetype analysis failed: insufficient data", {
        analysisId,
        missingFields: sufficiencyCheck.missingFields,
      });
      return null;
    }

    // Step 2: Generate archetype candidates
    const archetypes = this.generateArchetypeOptions(indicators);

    if (archetypes.length < 2) {
      logger.warn("Archetype analysis failed: insufficient archetypes", {
        analysisId,
        generatedCount: archetypes.length,
      });
      return null;
    }

    // Step 3: Score and rank archetypes
    const scoredArchetypes = archetypes.map((a) =>
      this.scoreArchetype(a, indicators)
    );

    const sorted = [...scoredArchetypes].sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );

    const selectedArchetype = sorted[0];
    const alternatives = sorted.slice(1);

    logger.info("Archetype analysis complete", {
      analysisId,
      engagementId,
      selectedArchetype: selectedArchetype.archetyppe,
      confidence: selectedArchetype.confidenceScore,
      riskProfile: selectedArchetype.riskProfile,
      growthMode: selectedArchetype.growthMode,
      alternativeCount: alternatives.length,
    });

    return {
      analysisId,
      engagementId,
      workspaceId,
      dataValidation: sufficiencyCheck,
      selectedArchetype,
      alternativeArchetypes: alternatives,
      overallConfidence: selectedArchetype.confidenceScore,
      uncertaintyExposure: this.exposeUncertainty(
        selectedArchetype,
        alternatives,
        sufficiencyCheck
      ),
      analyzedAt: new Date(),
    };
  }

  private checkDataSufficiency(
    indicators: ArchetypeIndicators
  ): DataSufficiencyCheck {
    const missingFields: string[] = [];

    // Check all required indicators are present
    if (indicators.revenueTrend === undefined) {
      missingFields.push("revenue_trend");
    }
    if (indicators.profitMargin === undefined) {
      missingFields.push("profit_margin");
    }
    if (indicators.cashFlow === undefined) {
      missingFields.push("cash_flow");
    }
    if (indicators.debtToEquity === undefined) {
      missingFields.push("debt_to_equity");
    }

    return {
      isSufficient: missingFields.length === 0,
      missingFields,
    };
  }

  private generateArchetypeOptions(
    indicators: ArchetypeIndicators
  ): Archetype[] {
    const archetypes: Archetype[] = [];

    // Archetype 1: High-Growth SaaS
    archetypes.push({
      id: uuidv4(),
      archetyppe: "High-Growth SaaS",
      riskProfile: "HIGH",
      capitalSensitivity: "HIGH",
      growthMode: "scale",
      decisionConstraints: {
        allowedStrategyTypes: [
          "revenue_growth",
          "market_expansion",
          "product_innovation",
          "team_building",
        ],
        forbiddenStrategyTypes: ["debt_reduction", "cost_reduction"],
        maximumInvestmentHorizonMonths: 36,
        maximumExecutionComplexity: "expert",
      },
      confidenceScore: 0,
      confidenceReason: "",
    });

    // Archetype 2: Turnaround Play
    archetypes.push({
      id: uuidv4(),
      archetyppe: "Turnaround Play",
      riskProfile: "CRITICAL",
      capitalSensitivity: "MEDIUM",
      growthMode: "survival",
      decisionConstraints: {
        allowedStrategyTypes: [
          "cost_reduction",
          "operational_efficiency",
          "debt_reduction",
          "customer_retention",
        ],
        forbiddenStrategyTypes: [
          "market_expansion",
          "infrastructure_investment",
          "team_building",
        ],
        maximumInvestmentHorizonMonths: 12,
        maximumExecutionComplexity: "moderate",
      },
      confidenceScore: 0,
      confidenceReason: "",
    });

    // Archetype 3: Stable Mature Business
    archetypes.push({
      id: uuidv4(),
      archetyppe: "Stable Mature Business",
      riskProfile: "LOW",
      capitalSensitivity: "LOW",
      growthMode: "stabilize",
      decisionConstraints: {
        allowedStrategyTypes: [
          "operational_efficiency",
          "customer_retention",
          "cost_reduction",
          "strategic_partnership",
        ],
        forbiddenStrategyTypes: [
          "product_innovation",
          "market_expansion",
          "infrastructure_investment",
        ],
        maximumInvestmentHorizonMonths: 24,
        maximumExecutionComplexity: "simple",
      },
      confidenceScore: 0,
      confidenceReason: "",
    });

    // Archetype 4: Growth-Stage Company
    archetypes.push({
      id: uuidv4(),
      archetyppe: "Growth-Stage Company",
      riskProfile: "MEDIUM",
      capitalSensitivity: "HIGH",
      growthMode: "grow",
      decisionConstraints: {
        allowedStrategyTypes: [
          "revenue_growth",
          "operational_efficiency",
          "product_innovation",
          "team_building",
          "customer_retention",
        ],
        forbiddenStrategyTypes: ["debt_reduction"],
        maximumInvestmentHorizonMonths: 24,
        maximumExecutionComplexity: "complex",
      },
      confidenceScore: 0,
      confidenceReason: "",
    });

    return archetypes;
  }

  private scoreArchetype(
    archetype: Archetype,
    indicators: ArchetypeIndicators
  ): Archetype {
    // Score based on alignment of indicators with archetype profile

    // Growth signal alignment
    const growthAlignment = this.scoreGrowthAlignment(
      archetype.growthMode,
      indicators.revenueTrend,
      indicators.burnRate,
      indicators.runwayMonths
    );

    // Risk profile alignment
    const riskAlignment = this.scoreRiskAlignment(
      archetype.riskProfile,
      indicators.debtToEquity,
      indicators.profitMargin,
      indicators.cashFlow
    );

    // Capital sensitivity alignment
    const capitalAlignment = this.scoreCapitalAlignment(
      archetype.capitalSensitivity,
      indicators.customerAcquisitionCost,
      indicators.customerLifetimeValue,
      indicators.burnRate
    );

    const rawScore =
      (growthAlignment * 0.4 + riskAlignment * 0.35 + capitalAlignment * 0.25);
    const confidenceScore = Math.min(1, Math.max(0, rawScore));

    archetype.confidenceScore = confidenceScore;
    archetype.confidenceReason = `Aligned with ${archetype.growthMode} mode (${Math.round(growthAlignment * 100)}%), ${archetype.riskProfile} risk (${Math.round(riskAlignment * 100)}%), and ${archetype.capitalSensitivity} capital needs.`;

    return archetype;
  }

  private scoreGrowthAlignment(
    growthMode: GrowthMode,
    revenueTrend: number,
    burnRate: number,
    runwayMonths: number
  ): number {
    if (growthMode === "scale") {
      // High-growth mode: revenue > 30%, low burn relative to revenue
      return Math.min(0.4, (revenueTrend / 100) * 0.3);
    } else if (growthMode === "grow") {
      // Growth mode: revenue 10-30%, moderate burn
      return Math.min(
        0.4,
        (Math.max(0, revenueTrend - 10) / 20) * 0.3 +
          (Math.min(runwayMonths, 24) / 24) * 0.1
      );
    } else if (growthMode === "stabilize") {
      // Stabilize mode: low growth, positive cash flow
      return Math.min(0.4, (burnRate > 0 ? 0.2 : 0.3) + 0.1);
    } else {
      // Survival mode: declining or low growth, critical runway
      return Math.min(0.4, (Math.max(0, runwayMonths) / 6) * 0.3 + 0.1);
    }
  }

  private scoreRiskAlignment(
    riskProfile: RiskProfile,
    debtToEquity: number,
    profitMargin: number,
    cashFlow: number
  ): number {
    const debtScore = Math.min(1, 1 - debtToEquity / 2);
    const profitScore = Math.min(1, (profitMargin + 50) / 100);
    const cashScore = cashFlow > 0 ? 0.5 : 0.2;

    const health = (debtScore + profitScore + cashScore) / 3;

    if (riskProfile === "CRITICAL") {
      return health < 0.3 ? 0.35 : 0.15;
    } else if (riskProfile === "HIGH") {
      return health < 0.5 ? 0.35 : 0.2;
    } else if (riskProfile === "MEDIUM") {
      return health >= 0.4 && health < 0.7 ? 0.35 : 0.2;
    } else {
      // LOW
      return health > 0.7 ? 0.35 : 0.15;
    }
  }

  private scoreCapitalAlignment(
    capitalSensitivity: CapitalSensitivity,
    customerAcquisitionCost: number,
    customerLifetimeValue: number,
    burnRate: number
  ): number {
    const ltv = Math.max(1, customerLifetimeValue);
    const cac = Math.max(1, customerAcquisitionCost);
    const ltvToCacRatio = ltv / cac;

    if (capitalSensitivity === "HIGH") {
      // Need high CAC relative to LTV
      return Math.min(0.25, ltvToCacRatio > 2 ? 0.15 : 0.25);
    } else if (capitalSensitivity === "MEDIUM") {
      return Math.min(0.25, ltvToCacRatio >= 1.5 ? 0.2 : 0.15);
    } else {
      // LOW
      return Math.min(0.25, ltvToCacRatio >= 3 ? 0.25 : 0.15);
    }
  }

  private exposeUncertainty(
    selected: Archetype,
    alternatives: Archetype[],
    dataCheck: DataSufficiencyCheck
  ) {
    const missingDataList = [];

    if (dataCheck.missingFields.length > 0) {
      missingDataList.push(...dataCheck.missingFields);
    }

    const riskLevel =
      selected.confidenceScore < 0.5
        ? "HIGH"
        : selected.confidenceScore < 0.7
          ? "MEDIUM"
          : "LOW";

    return {
      riskOfMisclassification: `${riskLevel} risk. Alternative archetypes: ${alternatives.map((a) => a.archetyppe).join("; ")}`,
      missingDataList,
      assumptionsList: [
        "Indicators are current as of analysis date",
        "Market conditions remain relatively stable",
        "Management team capability is consistent",
        "Customer retention patterns continue",
      ],
    };
  }
}

export const archetypeEngine = new ArchetypeEngine();
