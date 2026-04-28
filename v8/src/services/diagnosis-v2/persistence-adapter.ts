import { NotFoundError } from "@/infra/errors";
import { db } from "@/lib/db";
import type { DiagnosisV2Input, DiagnosisV2Result } from "@/domain/diagnosis-v2/types";

export async function buildDiagnosisInputFromEngagement(
  engagementId: string,
  body: Omit<DiagnosisV2Input, "engagementId">,
): Promise<DiagnosisV2Input> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: true,
      conditionProfiles: { where: { isCurrent: true }, take: 1 },
      evidence: { take: 20, orderBy: { createdAt: "desc" } },
    },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return {
    engagementId,
    nowIso: body.nowIso ?? new Date().toISOString(),
    businessName: body.businessName ?? engagement.client.name,
    businessType: body.businessType ?? engagement.client.industry ?? undefined,
    problemStatement: body.problemStatement ?? engagement.description ?? engagement.title,
    evidenceLabels: engagement.evidence.map((item) => `${item.evidenceType}:${item.title}`),
    ...body,
  };
}

function findingSeverity(confidence: number): "critical" | "high" | "medium" {
  if (confidence >= 0.78) return "critical";
  if (confidence >= 0.65) return "high";
  return "medium";
}

export async function persistDiagnosisV2AsExistingEntities(
  result: DiagnosisV2Result,
  actorId: string,
): Promise<{ findingIds: string[]; recommendationIds: string[]; reusedFindingIds: string[]; reusedRecommendationIds: string[] }> {
  const findingIds: string[] = [];
  const recommendationIds: string[] = [];
  const reusedFindingIds: string[] = [];
  const reusedRecommendationIds: string[] = [];

  for (const hypothesis of result.hypotheses.slice(0, 3)) {
    const title = `[V2] ${hypothesis.title}`;
    const existingFinding = await db.finding.findFirst({
      where: { engagementId: result.run.engagementId, title, rootCause: hypothesis.hypothesisKey },
    });
    const finding = existingFinding ?? await db.finding.create({
      data: {
        engagementId: result.run.engagementId,
        title,
        description: `${hypothesis.description}\n\nEvidence for: ${hypothesis.evidenceFor.map((e) => e.label).join("; ")}\nEvidence against: ${hypothesis.evidenceAgainst.map((e) => e.label).join("; ")}\nEngine: ${result.audit.engineVersion}`,
        findingType: "operational",
        impactArea: hypothesis.hypothesisKey.includes("liquidity") ? "risk" : "execution",
        severity: findingSeverity(hypothesis.confidence),
        rootCause: hypothesis.hypothesisKey,
        linkedEvidence: [],
        createdBy: actorId,
      },
    });
    if (existingFinding) reusedFindingIds.push(finding.id);
    else findingIds.push(finding.id);

    const linkedRecommendations = result.recommendations.filter((rec) => rec.linkedHypothesisKeys.includes(hypothesis.hypothesisKey));
    for (const rec of linkedRecommendations) {
      const recTitle = `[V2] ${rec.title}`;
      const existingRecommendation = await db.recommendation.findFirst({
        where: { engagementId: result.run.engagementId, findingId: finding.id, title: recTitle },
      });
      if (existingRecommendation) {
        reusedRecommendationIds.push(existingRecommendation.id);
        continue;
      }
      const policy = result.policyDecisions.find((decision) => decision.recommendationKey === rec.recommendationKey)?.outcome ?? "not_evaluated";
      const created = await db.recommendation.create({
        data: {
          engagementId: result.run.engagementId,
          findingId: finding.id,
          title: recTitle,
          description: rec.description,
          rationale: `${rec.rationale}\n\nPreconditions: ${rec.preconditions.join("; ")}\nPolicy: ${policy}`,
          priority: rec.priority,
          estimatedImpact: rec.priority === "critical" ? "high" : "medium",
          status: "pending",
        },
      });
      recommendationIds.push(created.id);
    }
  }

  return { findingIds, recommendationIds, reusedFindingIds, reusedRecommendationIds };
}
