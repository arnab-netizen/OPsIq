import { db } from "@/lib/db";
import { runConsultingEngine } from "./orchestrator";
import type { ConsultingEngineInput, ConsultingEngineOutput } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { createRecommendationsFromInterventions } from "@/services/recommendation";
import { createActionsFromInterventions } from "@/services/action";
import { emitAuditEvent } from "@/infra/audit";
import type { RecommendationRecord, ActionRecord } from "@/generated/prisma/client";

export interface ConsultingEnginePipelineResult {
  status: "SUCCESS" | "INSUFFICIENT_DATA" | "ERROR";
  decisionMemo: ConsultingEngineOutput["decisionMemo"] | null;
  recommendations: RecommendationRecord[];
  actions: ActionRecord[];
  warnings: string[];
}

export async function runConsultingPipeline(
  engagementId: string,
  createdByUserId?: string
): Promise<ConsultingEnginePipelineResult> {
  // 1. Load engagement
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: {
        select: { industry: true, size: true },
      },
      conditionProfiles: {
        where: { isCurrent: true },
        take: 1,
      },
    },
  });

  if (!engagement) {
    return {
      status: "ERROR",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: ["Engagement not found"],
    };
  }

  // 2. Load findings
  const findings = await db.findingRecord.findMany({
    where: {
      engagementId,
      status: "VALIDATED",
    },
  });

  if (findings.length === 0) {
    return {
      status: "INSUFFICIENT_DATA",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: ["No validated findings available. Run evidence gathering first."],
    };
  }

  // 3. Map findings to ConsultingEngineInput
  const evidenceItems = findings.map((finding) => ({
    id: finding.id,
    dimension: mapSeverityToDimension(finding.severity),
    finding: finding.statement,
    confidence:
      finding.confidenceLabel === "HIGH"
        ? ConfidenceLevel.HIGH
        : finding.confidenceLabel === "MEDIUM"
          ? ConfidenceLevel.MEDIUM
          : finding.confidenceLabel === "LOW"
            ? ConfidenceLevel.LOW
            : ConfidenceLevel.PROVISIONAL,
    source: `Finding: ${finding.title}`,
    timestamp: finding.createdAt,
    isCritical: finding.severity === "critical",
    supportingData: {},
  }));

  const businessCondition = engagement.conditionProfiles[0];

  const input: ConsultingEngineInput = {
    engagementId,
    businessProblem: engagement.description || engagement.title,
    evidence: evidenceItems,
    clientContext: {
      industry: engagement.client.industry || "unknown",
      size: engagement.client.size || "unknown",
      revenueImpactUrgency:
        businessCondition?.urgencyLevel.toUpperCase() || "HIGH",
    },
  };

  // 4. Run consulting engine
  const engineOutput = await runConsultingEngine(input);

  if (engineOutput.status !== "SUCCESS") {
    return {
      status: "ERROR",
      decisionMemo: null,
      recommendations: [],
      actions: [],
      warnings: engineOutput.warnings,
    };
  }

  let recommendations: RecommendationRecord[] = [];
  let actions: ActionRecord[] = [];

  try {
    // 5. Store recommendations
    recommendations = await createRecommendationsFromInterventions(
      engagementId,
      engineOutput.decisionMemo.recommendedInterventions,
      createdByUserId
    );

    // 6. Generate and store actions
    actions = await createActionsFromInterventions(
      engagementId,
      engineOutput.decisionMemo.recommendedInterventions,
      createdByUserId || "system",
      createdByUserId
    );

    // 7. Emit audit event
    await emitAuditEvent({
      eventName: "CONSULTING_PIPELINE_COMPLETED",
      actorId: createdByUserId,
      entityType: "Engagement",
      entityId: engagementId,
      payload: {
        businessProblem: input.businessProblem,
        rootCause: engineOutput.decisionMemo.rootCauseDiagnosis.type,
        diagnosisConfidence: engineOutput.decisionMemo.diagnosisConfidence,
        interventionCount: engineOutput.decisionMemo.recommendedInterventions.length,
        recommendationCount: recommendations.length,
        actionCount: actions.length,
        status: engineOutput.status,
      },
      visibility: "internal",
    });

    return {
      status: "SUCCESS",
      decisionMemo: engineOutput.decisionMemo,
      recommendations,
      actions,
      warnings: engineOutput.warnings,
    };
  } catch (error) {
    // Emit error event
    await emitAuditEvent({
      eventName: "CONSULTING_PIPELINE_FAILED",
      actorId: createdByUserId,
      entityType: "Engagement",
      entityId: engagementId,
      payload: {
        error: error instanceof Error ? error.message : "Unknown error",
        stage: "persistence",
      },
      visibility: "internal",
    });

    throw error;
  }
}

function mapSeverityToDimension(severity: string): string {
  const mapping: Record<string, string> = {
    critical: "operational_efficiency",
    high: "financial_health",
    medium: "process_maturity",
    low: "quality_delivery",
  };
  return mapping[severity.toLowerCase()] || "operational_efficiency";
}
