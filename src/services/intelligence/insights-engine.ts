import { OperatorItem } from "@/domain/operator/types";
import { ProblemType } from "@/domain/decision/types";

export interface TypeInsights {
  problemType: ProblemType;
  frequency: number;
  successRate: number;
  avgAccuracy: number;
  avgImpact: number;
  failureCount: number;
}

export interface SystemicInsights {
  timeframe: {
    days: number;
    startDate: string;
    endDate: string;
  };
  worstPerformingType: ProblemType | null;
  bestPerformingType: ProblemType | null;
  avgAccuracyByType: Record<ProblemType, number>;
  insights: {
    byType: TypeInsights[];
    totalDecisions: number;
    overallSuccessRate: number;
    overallAvgAccuracy: number;
  };
}

function getOutcomeValue(item: OperatorItem): number {
  if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
    return Number(item.actualOutcomeValue);
  }
  if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
    return Number(item.outcomeDelta);
  }
  return item.status === "done" ? 1 : -1;
}

function getAccuracy(item: OperatorItem): number {
  // If decisionAccuracy is available, use it
  if (item.decisionAccuracy !== null && item.decisionAccuracy !== undefined) {
    return Number(item.decisionAccuracy);
  }

  // Otherwise infer from outcome
  const outcome = getOutcomeValue(item);
  if (outcome > 0) {
    // Positive outcome: assume 80% accuracy
    return 80;
  } else if (outcome === 0) {
    // Neutral: assume 50% accuracy
    return 50;
  } else {
    // Negative: assume 20% accuracy
    return 20;
  }
}

export function calculateSystemicInsights(items: OperatorItem[]): SystemicInsights {
  // Group items by problemType
  const byType = new Map<ProblemType, OperatorItem[]>();

  for (const item of items) {
    if (!item.problemType) continue;

    if (!byType.has(item.problemType)) {
      byType.set(item.problemType, []);
    }
    byType.get(item.problemType)!.push(item);
  }

  // Calculate metrics for each type
  const typeInsights: TypeInsights[] = [];
  let totalSuccessCount = 0;
  let totalAccuracySum = 0;
  let worstType: ProblemType | null = null;
  let bestType: ProblemType | null = null;
  let worstAccuracy = 100;
  let bestAccuracy = 0;

  const avgAccuracyByType: Record<ProblemType, number> = {} as Record<
    ProblemType,
    number
  >;

  for (const [type, typeItems] of byType.entries()) {
    if (typeItems.length === 0) continue;

    // Calculate success rate
    const successCount = typeItems.filter(
      (item) => getOutcomeValue(item) > 0
    ).length;
    const successRate = (successCount / typeItems.length) * 100;

    // Calculate average accuracy
    const accuracies = typeItems.map((item) => getAccuracy(item));
    const avgAccuracy =
      accuracies.reduce((a, b) => a + b, 0) / accuracies.length;

    // Calculate average impact
    const impacts = typeItems.map((item) => {
      if (item.actualOutcomeValue !== null && item.actualOutcomeValue !== undefined) {
        return Math.abs(Number(item.actualOutcomeValue));
      }
      if (item.outcomeDelta !== null && item.outcomeDelta !== undefined) {
        return Math.abs(Number(item.outcomeDelta));
      }
      return Math.abs(Number(item.impactExpected));
    });
    const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;

    const failureCount = typeItems.length - successCount;

    typeInsights.push({
      problemType: type,
      frequency: typeItems.length,
      successRate: Math.round(successRate * 100) / 100,
      avgAccuracy: Math.round(avgAccuracy * 100) / 100,
      avgImpact: Math.round(avgImpact),
      failureCount,
    });

    avgAccuracyByType[type] = Math.round(avgAccuracy * 100) / 100;

    // Track worst/best
    if (avgAccuracy < worstAccuracy) {
      worstAccuracy = avgAccuracy;
      worstType = type;
    }
    if (avgAccuracy > bestAccuracy) {
      bestAccuracy = avgAccuracy;
      bestType = type;
    }

    totalSuccessCount += successCount;
    totalAccuracySum += avgAccuracy;
  }

  // Sort by frequency descending
  typeInsights.sort((a, b) => b.frequency - a.frequency);

  // Calculate overall metrics
  const totalDecisions = items.length;
  const overallSuccessRate =
    totalDecisions > 0 ? (totalSuccessCount / totalDecisions) * 100 : 0;
  const overallAvgAccuracy =
    typeInsights.length > 0
      ? typeInsights.reduce((sum, t) => sum + t.avgAccuracy, 0) /
        typeInsights.length
      : 0;

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  return {
    timeframe: {
      days: 30,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    worstPerformingType: worstType,
    bestPerformingType: bestType,
    avgAccuracyByType,
    insights: {
      byType: typeInsights,
      totalDecisions,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      overallAvgAccuracy: Math.round(overallAvgAccuracy * 100) / 100,
    },
  };
}
