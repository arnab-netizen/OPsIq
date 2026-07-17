import { logger } from "@/infra/logger";
import {
  ScenarioAnalysis,
  ScenarioCase,
  PathWithScenarios,
} from "@/domain/decision/scenario";

export interface PathDimensions {
  pathId: string;
  impactValue: number; // Base financial impact ($)
  probability: number; // Success probability (0-1)
  riskScore: number; // Risk/failure probability (0-1)
  timeToResultDays: number;
  dependencyCount: number;
  bottleneckImpactPercent?: number; // How much bottleneck reduces impact
}

export class ScenariosEngine {
  /**
   * Calculate scenario analysis for a single path
   * Best case: optimistic (impact boosted), prob 0.2
   * Base case: realistic (base impact), prob 0.6
   * Worst case: pessimistic (impact reduced), prob 0.2
   */
  analyzePathScenarios(dimensions: PathDimensions): ScenarioAnalysis {
    const {
      pathId,
      impactValue,
      probability,
      riskScore,
      dependencyCount,
      bottleneckImpactPercent = 0,
    } = dimensions;

    // Best case: impact boosted by 30%, all risks mitigated
    const bestCaseValue = Math.round(impactValue * 1.3);
    const bestCase: ScenarioCase = {
      value: bestCaseValue,
      prob: 0.2,
      trigger: "All risks mitigated, full team engagement, optimal market conditions",
    };

    // Base case: realistic outcome with current conditions
    const baseCaseValue = Math.round(
      impactValue * probability * (1 - bottleneckImpactPercent / 100)
    );
    const baseCase: ScenarioCase = {
      value: baseCaseValue,
      prob: 0.6,
      trigger: "Normal execution, standard adoption rate, expected market response",
    };

    // Worst case: impact reduced by 50%, key risks materialize
    const worstCaseValue = Math.round(impactValue * 0.5 * (1 - riskScore));
    const worstCase: ScenarioCase = {
      value: worstCaseValue,
      prob: 0.2,
      trigger: "Execution delays, team resistance, market headwinds, dependencies fail",
    };

    // Expected value: weighted average
    const expectedValue = Math.round(
      bestCase.value * bestCase.prob +
        baseCase.value * baseCase.prob +
        worstCase.value * worstCase.prob
    );

    // Downside exposure: worst case value
    const downsideExposure = worstCase.value;

    // Failure triggers
    const failureTriggers = this.generateFailureTriggers(
      dependencyCount,
      riskScore,
      bottleneckImpactPercent
    );

    logger.info("Scenario analysis completed", {
      pathId,
      expectedValue,
      downsideExposure,
      bestCaseValue,
      baseCaseValue,
      worstCaseValue,
    });

    return {
      pathId,
      bestCase,
      baseCase,
      worstCase,
      expectedValue,
      downsideExposure,
      failureTriggers,
      scenarios: {
        best: bestCase,
        base: baseCase,
        worst: worstCase,
      },
    };
  }

  /**
   * Analyze multiple paths and calculate scenario analysis for each
   */
  analyzeMultiplePathScenarios(
    pathDimensions: PathDimensions[]
  ): PathWithScenarios[] {
    return pathDimensions.map((dims) => ({
      pathId: dims.pathId,
      impactValue: dims.impactValue,
      probability: dims.probability,
      riskScore: dims.riskScore,
      scenarios: this.analyzePathScenarios(dims),
    }));
  }

  /**
   * Calculate expected value for a scenario
   */
  calculateExpectedValue(
    bestValue: number,
    baseValue: number,
    worstValue: number,
    bestProb: number = 0.2,
    baseProb: number = 0.6,
    worstProb: number = 0.2
  ): number {
    // Validate probabilities sum to 1.0
    const probSum = bestProb + baseProb + worstProb;
    if (Math.abs(probSum - 1.0) > 0.01) {
      logger.warn("Scenario probabilities do not sum to 1.0", {
        bestProb,
        baseProb,
        worstProb,
        sum: probSum,
      });
    }

    return Math.round(
      bestValue * bestProb + baseValue * baseProb + worstValue * worstProb
    );
  }

  /**
   * Compare two scenarios: return true if scenario1 has better EV
   */
  compareScenarios(scenario1: ScenarioAnalysis, scenario2: ScenarioAnalysis): boolean {
    return scenario1.expectedValue > scenario2.expectedValue;
  }

  /**
   * Rank paths by expected value (highest first)
   */
  rankPathsByExpectedValue(scenarios: PathWithScenarios[]): PathWithScenarios[] {
    return [...scenarios].sort(
      (a, b) => b.scenarios.expectedValue - a.scenarios.expectedValue
    );
  }

  /**
   * Generate explicit failure triggers based on path characteristics
   */
  private generateFailureTriggers(
    dependencyCount: number,
    riskScore: number,
    bottleneckImpactPercent: number
  ): string[] {
    const triggers: string[] = [];

    if (dependencyCount >= 3) {
      triggers.push("One or more external dependencies fail to deliver");
    }

    if (riskScore > 0.5) {
      triggers.push("Key execution risks materialize (team turnover, market shift)");
    }

    if (bottleneckImpactPercent > 20) {
      triggers.push("Bottleneck condition worsens, reducing throughput further");
    }

    if (dependencyCount > 0) {
      triggers.push("Timeline delays accumulate due to dependency coordination");
    }

    // Ensure at least one trigger
    if (triggers.length === 0) {
      triggers.push("Execution delays or market conditions change");
    }

    return triggers;
  }

  /**
   * Calculate risk-adjusted expected value accounting for confidence
   */
  calculateRiskAdjustedEV(
    expectedValue: number,
    diagnosticConfidence: number
  ): number {
    // Lower confidence = higher uncertainty discount
    const confidenceAdjustment = diagnosticConfidence; // 0-1
    return Math.round(expectedValue * confidenceAdjustment);
  }

  /**
   * Identify paths with negative worst-case exposure
   */
  identifyDownsideRisks(scenarios: PathWithScenarios[]): PathWithScenarios[] {
    return scenarios.filter((s) => s.scenarios.downsideExposure < 0);
  }

  /**
   * Validate scenario probabilities and values
   */
  validateScenarioAnalysis(analysis: ScenarioAnalysis): boolean {
    // Probabilities must sum to 1.0
    const probSum = analysis.bestCase.prob + analysis.baseCase.prob + analysis.worstCase.prob;
    if (Math.abs(probSum - 1.0) > 0.01) {
      logger.warn("Invalid scenario probabilities", {
        pathId: analysis.pathId,
        probSum,
      });
      return false;
    }

    // All probabilities must be between 0 and 1
    const allValidProbs = [
      analysis.bestCase.prob,
      analysis.baseCase.prob,
      analysis.worstCase.prob,
    ].every((p) => p >= 0 && p <= 1);

    if (!allValidProbs) {
      logger.warn("Invalid scenario probability values", {
        pathId: analysis.pathId,
      });
      return false;
    }

    // Expected value must be a valid number
    if (!Number.isFinite(analysis.expectedValue)) {
      logger.warn("Invalid expected value", {
        pathId: analysis.pathId,
        expectedValue: analysis.expectedValue,
      });
      return false;
    }

    // Worst case should typically be lowest (but not always - if EV is negative)
    // This is a soft check, not a hard failure

    return true;
  }
}

export const scenariosEngine = new ScenariosEngine();
