import { DecisionResult } from "@/domain/decision/types";
import { OperatorItem } from "@/domain/operator/types";
import { DetectedPattern } from "./pattern-engine";
import { getVariableRegistry } from "@/services/control/variable-registry";
import { ScenarioComparison } from "@/services/control/scenario-comparison";
import {
  isDataSufficient,
  getPatternsByProblemType,
  VariableWithConfidence,
} from "@/services/control/recommendation";

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
  blocked?: boolean;
  blockReason?: string;
  blockDetails?: {
    patternCount?: number;
    minPatternsRequired?: number;
    lowConfidenceVariables?: string[];
    minConfidenceRequired?: number;
  };
  /** True when prior realized failures for this problem type lowered the confidence (B6 learning read-back). */
  learningApplied?: boolean;
  /** How many prior realized failures for this problem type were found in the workspace history. */
  priorFailureCount?: number;
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

/**
 * Count prior REALIZED failures for a problem type in the workspace's decision history (B6 learning read-back).
 * A realized failure is a terminal `failed` decision, or a completed one whose measured outcome moved the wrong
 * way (`outcomeDelta < 0`). Pure over the already-loaded, workspace-scoped `items` — no new store, no new query.
 */
function priorRealizedFailures(items: OperatorItem[], problemType: OperatorItem["problemType"]): number {
  if (!problemType) return 0;
  let failures = 0;
  for (const it of items) {
    if (it.problemType !== problemType) continue;
    const failed = it.status === "failed";
    const negativeOutcome = typeof it.outcomeDelta === "number" && it.outcomeDelta < 0;
    if (failed || negativeOutcome) failures++;
  }
  return failures;
}

/**
 * Fold the prior-failure signal into a finalized recommendation: repeated realized failures for the same problem
 * type demonstrably lower confidence and annotate why (B6). Mirrors the owner-plan learning shape
 * (read → annotate → lower confidence). Each prior failure removes 15% of confidence, capped at 60%, so a single
 * bad outcome nudges and a repeated pattern of failure materially tempers the recommendation. No-op when there are
 * no prior failures, so behaviour is unchanged for a clean history.
 */
function applyPriorFailureLearning(
  base: ActionRecommendation,
  items: OperatorItem[],
  problemType: OperatorItem["problemType"],
): ActionRecommendation {
  const failures = priorRealizedFailures(items, problemType);
  if (failures <= 0) return base;
  const penalty = Math.min(0.6, 0.15 * failures);
  const adjusted = Math.max(0, base.confidenceScore * (1 - penalty));
  return {
    ...base,
    confidenceScore: adjusted,
    learningApplied: true,
    priorFailureCount: failures,
    explanation: `${base.explanation} Confidence lowered ${Math.round(penalty * 100)}% from prior learning: ${failures} realized failure(s) recorded for this problem type.`,
  };
}

export function generateRecommendation(
  decision: DecisionResult,
  patterns: DetectedPattern[],
  items: OperatorItem[],
  inputVariables?: Record<string, unknown>,
  scenarios?: ScenarioComparison,
  variableConfidences?: Record<string, number>
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

  // CONTROL GATE: Validate data sufficiency before recommendation (fail-closed)
  const variablesForValidation: VariableWithConfidence[] = usedVariables.map(
    (varName) => ({
      name: varName,
      confidence: variableConfidences?.[varName] ?? 0.75,
    })
  );

  const sufficiencyResult = isDataSufficient(patterns, variablesForValidation);
  if (!sufficiencyResult.sufficient) {
    return {
      confidenceScore: 0,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "insufficient",
      explanation: `Recommendation blocked: ${sufficiencyResult.reason}`,
      blocked: true,
      blockReason: sufficiencyResult.reason,
      blockDetails: sufficiencyResult.details,
      scenarioContext: undefined,
    };
  }

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

  // B6: fold the decision-path learning read-back into the finalized recommendation — prior realized failures for
  // this problem type lower confidence and are annotated, so the recommendation demonstrably learns from history.
  return applyPriorFailureLearning(
    {
      recommendedAction,
      confidenceScore: bestPattern.successRate / 100,
      basedOnPatternId: bestPattern.patternId,
      variablesUsed: usedVariables,
      variablesIgnored: ignoredVariables,
      dataSufficiency: "sufficient",
      explanation: `Recommendation based on ${bestPattern.patternId} pattern with ${bestPattern.successRate}% success rate`,
      scenarioContext,
    },
    items,
    decision.problemType,
  );
}

export function generateMultipleRecommendations(
  decision: DecisionResult,
  patterns: DetectedPattern[],
  items: OperatorItem[],
  inputVariables?: Record<string, unknown>,
  scenarios?: ScenarioComparison,
  variableConfidences?: Record<string, number>
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

  // CONTROL GATE: Validate data sufficiency before recommendation (fail-closed)
  const variablesForValidation: VariableWithConfidence[] = usedVariables.map(
    (varName) => ({
      name: varName,
      confidence: variableConfidences?.[varName] ?? 0.75,
    })
  );

  const sufficiencyResult = isDataSufficient(patterns, variablesForValidation);
  if (!sufficiencyResult.sufficient) {
    return [
      {
        confidenceScore: 0,
        variablesUsed: usedVariables,
        variablesIgnored: ignoredVariables,
        dataSufficiency: "insufficient",
        explanation: `Recommendations blocked: ${sufficiencyResult.reason}`,
        blocked: true,
        blockReason: sufficiencyResult.reason,
        blockDetails: sufficiencyResult.details,
        scenarioContext: undefined,
      },
    ];
  }

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
