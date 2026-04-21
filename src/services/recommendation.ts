import { db } from "@/lib/db";
import type { PrioritizedIntervention, Intervention } from "@/domain/consulting-engine/types";
import type { RecommendationRecord } from "@/generated/prisma/client";
import { RecommendationClass } from "@/generated/prisma/client";

export interface CreateRecommendationInput {
  engagementId: string;
  title: string;
  recommendationClass: RecommendationClass;
  rationale: string;
  businessCriticality: number;
  timeToEffect: number;
  cashRequirement: number;
  ownerDependency: number;
  staffingDependency: number;
  resistanceRisk: number;
  executionFeasibility: number;
  failureConsequence: number;
  contingencyAvailability: number;
  findingId?: string;
  createdByUserId?: string;
}

export async function createRecommendation(
  input: CreateRecommendationInput
): Promise<RecommendationRecord> {
  const recommendationCode = `REC-${Date.now().toString(36).toUpperCase()}`;

  const recommendation = await db.recommendationRecord.create({
    data: {
      engagementId: input.engagementId,
      recommendationCode,
      title: input.title,
      recommendationClass: input.recommendationClass,
      rationale: input.rationale,
      businessCriticality: input.businessCriticality,
      timeToEffect: input.timeToEffect,
      cashRequirement: input.cashRequirement,
      ownerDependency: input.ownerDependency,
      staffingDependency: input.staffingDependency,
      resistanceRisk: input.resistanceRisk,
      executionFeasibility: input.executionFeasibility,
      failureConsequence: input.failureConsequence,
      contingencyAvailability: input.contingencyAvailability,
      findingId: input.findingId,
      createdByUserId: input.createdByUserId,
    },
  });

  return recommendation;
}

export async function createRecommendationsFromInterventions(
  engagementId: string,
  interventions: PrioritizedIntervention[],
  createdByUserId?: string
): Promise<RecommendationRecord[]> {
  const recommendations = await Promise.all(
    interventions.map((item) =>
      createRecommendation({
        engagementId,
        title: item.intervention.title,
        recommendationClass: item.intervention.class as RecommendationClass,
        rationale: item.intervention.rationale,
        businessCriticality: mapImpactToCriticality(
          item.intervention.expectedImpactOnRevenue
        ),
        timeToEffect: item.intervention.estimatedTotalDays,
        cashRequirement: mapCostBandToNumber(
          item.intervention.estimatedCostBand
        ),
        ownerDependency: 5,
        staffingDependency: 6,
        resistanceRisk: item.intervention.failureRisks.length * 2,
        executionFeasibility: item.priorityScore,
        failureConsequence: calculateFailureConsequence(item.intervention),
        contingencyAvailability: item.intervention.fallbackPlan ? 8 : 4,
        createdByUserId,
      })
    )
  );

  return recommendations;
}

function mapImpactToCriticality(impact: string): number {
  const mapping: Record<string, number> = {
    NONE: 1,
    MINOR: 3,
    SIGNIFICANT: 7,
    TRANSFORMATIVE: 10,
  };
  return mapping[impact] || 5;
}

function mapCostBandToNumber(costBand: string): number {
  const mapping: Record<string, number> = {
    MINIMAL: 1,
    LOW: 3,
    MEDIUM: 6,
    HIGH: 9,
  };
  return mapping[costBand] || 5;
}

function calculateFailureConsequence(intervention: Intervention): number {
  return Math.min(10, intervention.failureRisks.length * 1.5);
}

export async function getRecommendationsByEngagement(engagementId: string) {
  return db.recommendationRecord.findMany({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
  });
}
