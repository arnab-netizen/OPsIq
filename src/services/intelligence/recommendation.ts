import { DecisionResult } from "@/domain/decision/types";
import { OperatorItem } from "@/domain/operator/types";
import { DetectedPattern } from "./pattern-engine";

export interface ActionRecommendation {
  recommendedAction: string;
  confidenceScore: number;
  basedOnPatternId: string;
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
  items: OperatorItem[]
): ActionRecommendation | null {
  // Must have a problem type to make recommendations
  if (!decision.problemType) {
    return null;
  }

  // Find patterns matching this problem type with high success rate
  const matchingPatterns = patterns.filter(
    (pattern) =>
      pattern.problemType === decision.problemType && pattern.successRate > 60
  );

  if (matchingPatterns.length === 0) {
    return null;
  }

  // Sort by success rate (descending) and take the best one
  const bestPattern = matchingPatterns.sort(
    (a, b) => b.successRate - a.successRate
  )[0];

  // Get the items in this pattern
  const patternItems = items.filter((item) =>
    bestPattern.itemIds.includes(item.id)
  );

  if (patternItems.length === 0) {
    return null;
  }

  // Get the most frequent action from successful pattern items
  const recommendedAction = getMostFrequentAction(patternItems);

  if (!recommendedAction) {
    return null;
  }

  return {
    recommendedAction,
    confidenceScore: bestPattern.successRate,
    basedOnPatternId: bestPattern.patternId,
  };
}

export function generateMultipleRecommendations(
  decision: DecisionResult,
  patterns: DetectedPattern[],
  items: OperatorItem[]
): ActionRecommendation[] {
  // Must have a problem type to make recommendations
  if (!decision.problemType) {
    return [];
  }

  // Find patterns matching this problem type with high success rate
  const matchingPatterns = patterns.filter(
    (pattern) =>
      pattern.problemType === decision.problemType && pattern.successRate > 60
  );

  if (matchingPatterns.length === 0) {
    return [];
  }

  // Sort by success rate (descending)
  const sortedPatterns = matchingPatterns.sort(
    (a, b) => b.successRate - a.successRate
  );

  const recommendations: ActionRecommendation[] = [];

  for (const pattern of sortedPatterns) {
    // Get the items in this pattern
    const patternItems = items.filter((item) =>
      pattern.itemIds.includes(item.id)
    );

    if (patternItems.length === 0) continue;

    // Get the most frequent action from pattern items
    const recommendedAction = getMostFrequentAction(patternItems);

    if (recommendedAction) {
      recommendations.push({
        recommendedAction,
        confidenceScore: pattern.successRate,
        basedOnPatternId: pattern.patternId,
      });
    }
  }

  return recommendations;
}
