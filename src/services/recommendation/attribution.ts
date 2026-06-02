import { db } from "@/lib/db";
import type { OperatorItem, Recommendation } from "@/generated/prisma";

export interface RecommendationOutcomeTrace {
  operatorItemId: string;
  operatorItemStatus: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationPriority: string;
  decisionMade: boolean;
  outcomeAchieved: boolean;
  actualOutcomeValue: number | null;
  verificationStatus: string;
  impactExpected: number;
  confidence: number;
  timeFromRecommendationToDays: number | null;
}

export interface RecommendationExecutionMetrics {
  recommendationId: string;
  recommendationTitle: string;
  totalOperatorItems: number;
  itemsCreated: number;
  itemsCompleted: number;
  itemsVerified: number;
  totalOutcomeValue: number;
  averageOutcomeValue: number;
  executionRate: number;
  completionRate: number;
  verificationRate: number;
}

export async function linkDecisionToRecommendation(
  operatorItemId: string,
  recommendationId: string
): Promise<void> {
  await db.operatorItem.update({
    where: { id: operatorItemId },
    data: { recommendationId },
  });
}

export async function traceOutcomeToRecommendation(
  operatorItemId: string
): Promise<RecommendationOutcomeTrace | null> {
  const item = await db.operatorItem.findUnique({
    where: { id: operatorItemId },
    include: {
      recommendation: true,
    },
  });

  if (!item || !item.recommendation) {
    return null;
  }

  const daysElapsed = item.completedAt && item.createdAt
    ? Math.floor((item.completedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    operatorItemId: item.id,
    operatorItemStatus: item.status,
    recommendationId: item.recommendation.id,
    recommendationTitle: item.recommendation.title,
    recommendationPriority: item.recommendation.priority,
    decisionMade: item.status !== "pending",
    outcomeAchieved: item.status === "done" && item.actualOutcomeValue !== null && item.actualOutcomeValue > 0,
    actualOutcomeValue: item.actualOutcomeValue,
    verificationStatus: item.verificationStatus,
    impactExpected: item.impactExpected,
    confidence: item.confidence,
    timeFromRecommendationToDays: daysElapsed,
  };
}

export async function getRecommendationExecutionMetrics(
  recommendationId: string
): Promise<RecommendationExecutionMetrics | null> {
  const recommendation = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });

  if (!recommendation) {
    return null;
  }

  const items = await db.operatorItem.findMany({
    where: { recommendationId },
  });

  const itemsCompleted = items.filter((i) => i.status === "done");
  const itemsVerified = itemsCompleted.filter((i) => i.verificationStatus === "verified");
  const totalOutcomeValue = itemsCompleted.reduce((sum, i) => sum + (i.actualOutcomeValue || 0), 0);

  return {
    recommendationId,
    recommendationTitle: recommendation.title,
    totalOperatorItems: items.length,
    itemsCreated: items.length,
    itemsCompleted: itemsCompleted.length,
    itemsVerified: itemsVerified.length,
    totalOutcomeValue,
    averageOutcomeValue: itemsCompleted.length > 0 ? totalOutcomeValue / itemsCompleted.length : 0,
    executionRate: items.length > 0 ? (itemsCompleted.length / items.length) * 100 : 0,
    completionRate: items.length > 0 ? (itemsCompleted.length / items.length) * 100 : 0,
    verificationRate: itemsCompleted.length > 0 ? (itemsVerified.length / itemsCompleted.length) * 100 : 0,
  };
}

export async function getRecommendationAttributionSummary(
  workspaceId: string
): Promise<{
  recommendationsIssued: number;
  recommendationsAccepted: number;
  recommendationsWithOutcomes: number;
  averageExecutionRate: number;
  averageOutcomeValue: number;
}> {
  const recommendations = await db.recommendation.findMany({
    where: { workspaceId },
    include: {
      operatorItems: true,
    },
  });

  let totalAccepted = 0;
  let totalWithOutcomes = 0;
  let totalOutcomeValue = 0;
  let totalCompleted = 0;

  for (const rec of recommendations) {
    const accepted = rec.operatorItems.length > 0;
    if (accepted) totalAccepted++;

    const withOutcomes = rec.operatorItems.filter(
      (i) => i.status === "done" && i.actualOutcomeValue !== null
    );
    if (withOutcomes.length > 0) {
      totalWithOutcomes++;
      totalOutcomeValue += withOutcomes.reduce((sum, i) => sum + (i.actualOutcomeValue || 0), 0);
      totalCompleted += withOutcomes.length;
    }
  }

  const averageExecutionRate = recommendations.length > 0
    ? (totalAccepted / recommendations.length) * 100
    : 0;

  const averageOutcomeValue = totalCompleted > 0 ? totalOutcomeValue / totalCompleted : 0;

  return {
    recommendationsIssued: recommendations.length,
    recommendationsAccepted: totalAccepted,
    recommendationsWithOutcomes: totalWithOutcomes,
    averageExecutionRate,
    averageOutcomeValue,
  };
}
