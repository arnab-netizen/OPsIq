import { DecisionResult } from "@/domain/decision/types";
import { OperatorItem } from "@/domain/operator/types";
import { DetectedPattern } from "./pattern-engine";
import { getVariableRegistry } from "@/services/control/variable-registry";
import { ScenarioComparison } from "@/services/control/scenario-comparison";

export interface ActionRecommendation {
  recommendedAction?: string;
  confidenceScore: number;
  basedOnPatternId?: string;
  variablesUsed: string[];
  variablesIgnored: string[];
  dataSufficiency: "sufficient" | "insufficient";
  explanation: string;
  scenarioContext?: {
    baselineImpact: number;
    recommendedImpact: number;
    impactRange: { min: number; max: number; spread: number };
  };
}

interface ActionFrequency {
  action: string;
  count: number;
}

function getMostFrequentAction(items: OperatorItem[]): string | null {
  if (items.length === 0) return null;

  const actionFreq = new Map<string, number>();

  for (const item of items) {
    const count = actionFreq.get(item.action) || 0;
    actionFreq.set(item.action, count + 1);
  }

  let mostFrequent = "";
  let maxCount = 0;

  for (const [action, count] of actionFreq.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = action;
    }
  }

  return mostFrequent || null;
}

export function generateRecommendation(
  decision: DecisionResult,
  patterns: DetectedPattern[],
  items: OperatorItem[],
  inputVariables?: Record<string, unknown>,
  scenarios?: ScenarioComparison
): ActionRecommendation {
  const registry = getVariableRegistry();
  const allVariableKeys = Object.keys(registry).sort();

  // Determine which variables were used in input
  const usedVariables = inputVariables
    ? Object.keys(inputVariables)
        .filter((key) => key in registry)
        .sort()
    : [];

  // Determine which variables were ignored (registered but not in input)
  const ignoredVariables = allVariableKeys.filter(
    (key) => !usedVariables.includes(key)
  );

  // Build scenario context if available
  const scenarioContext = scenarios
    ? {
        baselineImpact: scenarios.baseline.impact,
        recommendedImpact: scenarios.recommended.impact,
        impactRange: {
          min: Math.min(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
          max: Math.max(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
          spread: Math.max(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ) - Math.min(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
        },
      }
    : undefined;

  // Rule: if no matching pattern or successRate <= 0.6 -> dataSufficiency="insufficient"
  if (!decision.problemType) {
    return {
      confidenceScore: 0,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: "No problem type available for recommendations",
      scenarioContext,
    };
  }

  // Find patterns matching this problem type with high success rate (successRate > 60%)
  const matchingPatterns = patterns.filter(
    (pattern) =>
      pattern.problemType === decision.problemType && pattern.successRate > 60
  );

  if (matchingPatterns.length === 0) {
    return {
      confidenceScore: 0,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: `No matching patterns found for problem type: ${decision.problemType}`,
      scenarioContext,
    };
  }

  // Sort by success rate (descending) and take the best one
  const bestPattern = matchingPatterns.sort(
    (a, b) => b.successRate - a.successRate
  )[0];

  // Check if success rate meets threshold (> 0.6)
  if (bestPattern.successRate / 100 <= 0.6) {
    return {
      confidenceScore: bestPattern.successRate / 100,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: `Pattern success rate (${bestPattern.successRate}%) does not meet minimum threshold for recommendation`,
      basedOnPatternId: bestPattern.patternId,
      scenarioContext,
    };
  }

  // Get the items in this pattern
  const patternItems = items.filter((item) =>
    bestPattern.itemIds.includes(item.id)
  );

  if (patternItems.length === 0) {
    return {
      confidenceScore: bestPattern.successRate / 100,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: "No items found matching the best pattern",
      basedOnPatternId: bestPattern.patternId,
      scenarioContext,
    };
  }

  // Get the most frequent action from successful pattern items
  const recommendedAction = getMostFrequentAction(patternItems);

  if (!recommendedAction) {
    return {
      confidenceScore: bestPattern.successRate / 100,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: "Unable to determine recommended action from pattern items",
      basedOnPatternId: bestPattern.patternId,
      scenarioContext,
    };
  }

  return {
    recommendedAction,
    confidenceScore: bestPattern.successRate / 100,
    basedOnPatternId: bestPattern.patternId,
    variablesUsed: usedVariables,
    variablesIgnored: ignoredVariables,
    dataSufficiency: "sufficient",
    explanation: `Recommendation based on ${bestPattern.patternId} pattern with ${bestPattern.successRate}% success rate`,
    scenarioContext,
  };
}

export function generateMultipleRecommendations(
  decision: DecisionResult,
  patterns: DetectedPattern[],
  items: OperatorItem[],
  inputVariables?: Record<string, unknown>,
  scenarios?: ScenarioComparison
): ActionRecommendation[] {
  const registry = getVariableRegistry();
  const allVariableKeys = Object.keys(registry).sort();

  // Determine which variables were used in input
  const usedVariables = inputVariables
    ? Object.keys(inputVariables)
        .filter((key) => key in registry)
        .sort()
    : [];

  // Determine which variables were ignored (registered but not in input)
  const ignoredVariables = allVariableKeys.filter(
    (key) => !usedVariables.includes(key)
  );

  // Build scenario context if available
  const scenarioContext = scenarios
    ? {
        baselineImpact: scenarios.baseline.impact,
        recommendedImpact: scenarios.recommended.impact,
        impactRange: {
          min: Math.min(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
          max: Math.max(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
          spread: Math.max(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ) - Math.min(
            scenarios.baseline.impact,
            scenarios.recommended.impact,
            ...scenarios.alternatives.map((a) => a.impact)
          ),
        },
      }
    : undefined;

  // Must have a problem type to make recommendations
  if (!decision.problemType) {
    return [
      {
        confidenceScore: 0,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "insufficient",
        explanation: "No problem type available for recommendations",
        scenarioContext,
      },
    ];
  }

  // Find patterns matching this problem type with high success rate
  const matchingPatterns = patterns.filter(
    (pattern) =>
      pattern.problemType === decision.problemType && pattern.successRate > 60
  );

  if (matchingPatterns.length === 0) {
    return [
      {
        confidenceScore: 0,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "insufficient",
        explanation: `No matching patterns found for problem type: ${decision.problemType}`,
        scenarioContext,
      },
    ];
  }

  // Sort by success rate (descending)
  const sortedPatterns = matchingPatterns.sort(
    (a, b) => b.successRate - a.successRate
  );

  const recommendations: ActionRecommendation[] = [];

  for (const pattern of sortedPatterns) {
    // Check if success rate meets threshold (> 0.6 = > 60%)
    if (pattern.successRate / 100 <= 0.6) {
      recommendations.push({
        confidenceScore: pattern.successRate / 100,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "insufficient",
        explanation: `Pattern success rate (${pattern.successRate}%) does not meet minimum threshold for recommendation`,
        basedOnPatternId: pattern.patternId,
        scenarioContext,
      });
      continue;
    }

    // Get the items in this pattern
    const patternItems = items.filter((item) =>
      pattern.itemIds.includes(item.id)
    );

    if (patternItems.length === 0) {
      recommendations.push({
        confidenceScore: pattern.successRate / 100,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "insufficient",
        explanation: "No items found matching the pattern",
        basedOnPatternId: pattern.patternId,
        scenarioContext,
      });
      continue;
    }

    // Get the most frequent action from pattern items
    const recommendedAction = getMostFrequentAction(patternItems);

    if (recommendedAction) {
      recommendations.push({
        recommendedAction,
        confidenceScore: pattern.successRate / 100,
        basedOnPatternId: pattern.patternId,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "sufficient",
        explanation: `Recommendation based on ${pattern.patternId} pattern with ${pattern.successRate}% success rate`,
        scenarioContext,
      });
    }
  }

  return recommendations.length > 0
    ? recommendations
    : [
        {
          confidenceScore: 0,
          variablesUsed: usedVariables,
          variablesIgnored: ignoredVariables,
          dataSufficiency: "insufficient",
          explanation: "Unable to generate recommendations from available patterns",
          scenarioContext,
        },
      ];
}
