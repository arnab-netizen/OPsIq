import { v4 as uuidv4 } from "uuid";
import { logger } from "@/infra/logger";
import {
  MaturityLevel,
  ExecutionCapabilities,
  MaturityAnalysis,
  ExecutionComplexity,
  StrategyType,
} from "@/domain/diagnostic/maturity";

export interface DataSufficiencyCheck {
  isSufficient: boolean;
  missingFields: string[];
}

export interface MaturityIndicators {
  processDocumentation: number; // 0-100 (% of critical processes documented)
  processConsistency: number; // 0-100 (% of executions following process)
  teamTraining: number; // 0-100 (% team trained on processes)
  toolsAvailable: number; // 0-100 (% of needed tools implemented)
  dataQuality: number; // 0-100 (quality of available data)
  decisionTracking: number; // 0-100 (% decisions tracked and reviewed)
  riskManagement: number; // 0-100 (quality of risk assessment)
  governanceStructure: number; // 0-100 (completeness of governance)
  executionTrackRecord: number; // 0-100 (success rate of past execution)
}

export class MaturityEngine {
  async analyzeMaturity(
    engagementId: string,
    workspaceId: string,
    indicators: MaturityIndicators
  ): Promise<MaturityAnalysis | null> {
    const analysisId = uuidv4();

    // Step 1: Data sufficiency gate (STRICT)
    const sufficiencyCheck = this.checkDataSufficiency(indicators);

    if (!sufficiencyCheck.isSufficient) {
      logger.warn("Maturity analysis failed: insufficient data", {
        analysisId,
        missingFields: sufficiencyCheck.missingFields,
      });
      return null;
    }

    // Step 2: Calculate maturity dimensions
    const processMaturity = this.scoreProcessMaturity(indicators);
    const teamMaturity = this.scoreTeamMaturity(indicators);
    const systemsMaturity = this.scoreSystemsMaturity(indicators);
    const governanceMaturity = this.scoreGovernanceMaturity(indicators);

    // Step 3: Determine overall maturity level
    const overallScore =
      (processMaturity + teamMaturity + systemsMaturity + governanceMaturity) /
      4;
    const maturityLevel = this.levelFromScore(overallScore);

    // Step 4: Generate capability profiles for current and alternatives
    const currentCapabilities = this.generateCapabilities(
      maturityLevel,
      processMaturity,
      teamMaturity,
      systemsMaturity,
      governanceMaturity
    );

    const alternatives = this.generateAlternativeAssessments(
      maturityLevel,
      overallScore,
      processMaturity,
      teamMaturity,
      systemsMaturity,
      governanceMaturity
    );

    // Step 5: Calculate confidence and gaps
    const confidence = Math.min(
      1,
      Math.max(0.5, overallScore) // Confidence is at least 50%
    );

    const gaps = this.identifyMaturityGaps(
      processMaturity,
      teamMaturity,
      systemsMaturity,
      governanceMaturity
    );

    logger.info("Maturity analysis complete", {
      analysisId,
      engagementId,
      maturityLevel,
      overallScore: Math.round(overallScore * 100),
      confidence: Math.round(confidence * 100),
      gapCount: gaps.length,
    });

    return {
      analysisId,
      engagementId,
      workspaceId,
      dataValidation: sufficiencyCheck,
      currentMaturity: currentCapabilities,
      alternativeAssessments: alternatives,
      overallMaturityScore: overallScore,
      overallConfidence: confidence,
      maturityGaps: gaps,
      uncertaintyExposure: this.exposeUncertainty(
        currentCapabilities,
        confidence,
        sufficiencyCheck
      ),
      analyzedAt: new Date(),
    };
  }

  private checkDataSufficiency(
    indicators: MaturityIndicators
  ): DataSufficiencyCheck {
    const missingFields: string[] = [];

    // Check all required indicators
    const requiredFields = [
      "processDocumentation",
      "processConsistency",
      "teamTraining",
      "toolsAvailable",
      "dataQuality",
      "decisionTracking",
      "riskManagement",
      "governanceStructure",
      "executionTrackRecord",
    ];

    for (const field of requiredFields) {
      if (
        indicators[field as keyof MaturityIndicators] === undefined ||
        indicators[field as keyof MaturityIndicators] === null
      ) {
        missingFields.push(field);
      }
    }

    return {
      isSufficient: missingFields.length === 0,
      missingFields,
    };
  }

  private scoreProcessMaturity(indicators: MaturityIndicators): number {
    return (
      (indicators.processDocumentation * 0.4 +
        indicators.processConsistency * 0.4 +
        indicators.decisionTracking * 0.2) /
      100
    );
  }

  private scoreTeamMaturity(indicators: MaturityIndicators): number {
    return (
      (indicators.teamTraining * 0.5 +
        indicators.executionTrackRecord * 0.5) /
      100
    );
  }

  private scoreSystemsMaturity(indicators: MaturityIndicators): number {
    return (
      (indicators.toolsAvailable * 0.5 + indicators.dataQuality * 0.5) / 100
    );
  }

  private scoreGovernanceMaturity(indicators: MaturityIndicators): number {
    return (
      (indicators.governanceStructure * 0.6 +
        indicators.riskManagement * 0.4) /
      100
    );
  }

  private levelFromScore(score: number): MaturityLevel {
    if (score < 0.2) return 1;
    if (score < 0.4) return 2;
    if (score < 0.6) return 3;
    if (score < 0.8) return 4;
    return 5;
  }

  private generateCapabilities(
    level: MaturityLevel,
    processScore: number,
    teamScore: number,
    systemsScore: number,
    governanceScore: number
  ): ExecutionCapabilities {
    const config = this.getMaturityConfig(level);

    return {
      maturityLevel: level,
      maxExecutionComplexity: config.maxComplexity,
      maxDecisionHorizonDays: config.maxHorizonDays,
      maxPlanSizeActions: config.maxPlanSize,
      allowedStrategyTypes: config.allowedStrategies,
      blockedStrategyTypes: config.blockedStrategies,
      processMaturityScore: Math.round(processScore * 100) / 100,
      teamCapabilityScore: Math.round(teamScore * 100) / 100,
      systemsMaturityScore: Math.round(systemsScore * 100) / 100,
      governanceMaturityScore: Math.round(governanceScore * 100) / 100,
    };
  }

  private getMaturityConfig(level: MaturityLevel) {
    const configs = {
      1: {
        maxComplexity: "simple" as ExecutionComplexity,
        maxHorizonDays: 7,
        maxPlanSize: 3,
        allowedStrategies: ["cost_reduction", "customer_retention"] as StrategyType[],
        blockedStrategies: [
          "market_expansion",
          "product_innovation",
          "infrastructure_investment",
          "team_building",
        ] as StrategyType[],
      },
      2: {
        maxComplexity: "moderate" as ExecutionComplexity,
        maxHorizonDays: 30,
        maxPlanSize: 10,
        allowedStrategies: [
          "cost_reduction",
          "customer_retention",
          "operational_efficiency",
          "revenue_growth",
        ] as StrategyType[],
        blockedStrategies: [
          "market_expansion",
          "product_innovation",
          "infrastructure_investment",
        ] as StrategyType[],
      },
      3: {
        maxComplexity: "complex" as ExecutionComplexity,
        maxHorizonDays: 90,
        maxPlanSize: 30,
        allowedStrategies: [
          "cost_reduction",
          "revenue_growth",
          "operational_efficiency",
          "customer_retention",
          "product_innovation",
          "strategic_partnership",
        ] as StrategyType[],
        blockedStrategies: [
          "market_expansion",
          "infrastructure_investment",
        ] as StrategyType[],
      },
      4: {
        maxComplexity: "complex" as ExecutionComplexity,
        maxHorizonDays: 180,
        maxPlanSize: 75,
        allowedStrategies: [
          "cost_reduction",
          "revenue_growth",
          "market_expansion",
          "product_innovation",
          "operational_efficiency",
          "customer_retention",
          "infrastructure_investment",
          "team_building",
          "strategic_partnership",
          "debt_reduction",
        ] as StrategyType[],
        blockedStrategies: [] as StrategyType[],
      },
      5: {
        maxComplexity: "expert" as ExecutionComplexity,
        maxHorizonDays: 365,
        maxPlanSize: 200,
        allowedStrategies: [
          "cost_reduction",
          "revenue_growth",
          "market_expansion",
          "product_innovation",
          "operational_efficiency",
          "customer_retention",
          "infrastructure_investment",
          "team_building",
          "strategic_partnership",
          "debt_reduction",
        ] as StrategyType[],
        blockedStrategies: [] as StrategyType[],
      },
    };

    return configs[level];
  }

  private generateAlternativeAssessments(
    currentLevel: MaturityLevel,
    overallScore: number,
    processScore: number,
    teamScore: number,
    systemsScore: number,
    governanceScore: number
  ): ExecutionCapabilities[] {
    const alternatives: ExecutionCapabilities[] = [];

    // Generate adjacent level assessments if applicable
    if (currentLevel > 1) {
      const lowerLevel = (currentLevel - 1) as MaturityLevel;
      alternatives.push(
        this.generateCapabilities(
          lowerLevel,
          processScore,
          teamScore,
          systemsScore,
          governanceScore
        )
      );
    }

    if (currentLevel < 5) {
      const upperLevel = (currentLevel + 1) as MaturityLevel;
      alternatives.push(
        this.generateCapabilities(
          upperLevel,
          processScore,
          teamScore,
          systemsScore,
          governanceScore
        )
      );
    }

    return alternatives;
  }

  private identifyMaturityGaps(
    processScore: number,
    teamScore: number,
    systemsScore: number,
    governanceScore: number
  ) {
    const gaps = [];
    const targetScore = 0.8;

    if (processScore < targetScore) {
      gaps.push({
        dimension: "Process Maturity",
        currentScore: Math.round(processScore * 100),
        targetScore: Math.round(targetScore * 100),
        gap: Math.round((targetScore - processScore) * 100),
      });
    }

    if (teamScore < targetScore) {
      gaps.push({
        dimension: "Team Capability",
        currentScore: Math.round(teamScore * 100),
        targetScore: Math.round(targetScore * 100),
        gap: Math.round((targetScore - teamScore) * 100),
      });
    }

    if (systemsScore < targetScore) {
      gaps.push({
        dimension: "Systems Maturity",
        currentScore: Math.round(systemsScore * 100),
        targetScore: Math.round(targetScore * 100),
        gap: Math.round((targetScore - systemsScore) * 100),
      });
    }

    if (governanceScore < targetScore) {
      gaps.push({
        dimension: "Governance Maturity",
        currentScore: Math.round(governanceScore * 100),
        targetScore: Math.round(targetScore * 100),
        gap: Math.round((targetScore - governanceScore) * 100),
      });
    }

    return gaps;
  }

  private exposeUncertainty(
    capabilities: ExecutionCapabilities,
    confidence: number,
    dataCheck: DataSufficiencyCheck
  ) {
    const confidenceLevel =
      confidence > 0.8 ? "HIGH" : confidence > 0.6 ? "MEDIUM" : "LOW";

    const missingDataList = [];
    if (dataCheck.missingFields.length > 0) {
      missingDataList.push(...dataCheck.missingFields);
    }

    return {
      assessmentConfidence: `${confidenceLevel} confidence in maturity level ${capabilities.maturityLevel}. Based on ${capabilities.processMaturityScore.toFixed(0)}% process, ${capabilities.teamCapabilityScore.toFixed(0)}% team, ${capabilities.systemsMaturityScore.toFixed(0)}% systems, ${capabilities.governanceMaturityScore.toFixed(0)}% governance maturity.`,
      missingDataList,
      assumptionsList: [
        "Indicators reflect current organizational state",
        "Assessment period is representative of normal operations",
        "Team composition remains stable",
        "External constraints have not significantly changed",
      ],
    };
  }
}

export const maturityEngine = new MaturityEngine();
