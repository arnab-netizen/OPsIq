import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { runConsultingEngine } from "./orchestrator";
import type { ConsultingEngineInput, ConsultingEngineOutput } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { createRecommendationsFromInterventions } from "@/services/recommendation";
import { createActionsFromInterventions } from "@/services/action";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { Recommendation, Action } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { recordDecisionEngineUsage } from "@/services/usage.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export interface ConsultingEnginePipelineResult {
  status: "SUCCESS" | "INSUFFICIENT_DATA" | "ERROR";
  decisionMemo: ConsultingEngineOutput["decisionMemo"] | null;
  recommendations: Recommendation[];
  actions: Action[];
  warnings: string[];
}

export async function runConsultingPipeline(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<ConsultingEnginePipelineResult> {
  // Check capability: decision_engine
  const capabilityCheck = await assertCapability(workspaceId, "decision_engine");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("decision_engine", capabilityCheck.reason || "Plan limit exceeded");
  }

  try {
    // 1. Load engagement
    const engagement = await db.engagement.findFirst({
      where: { id: engagementId, workspaceId },
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
      logger.warn("Consulting pipeline: Engagement not found", { engagementId });
      return {
        status: "ERROR",
        decisionMemo: null,
        recommendations: [],
        actions: [],
        warnings: ["Engagement not found"],
      };
    }

    // 2. Load findings
    const findings = await db.finding.findMany({
      where: {
        engagementId,
        status: "approved", // Align with main's approval flow
        ...(workspaceId && { engagement: { workspaceId } }),
      },
    });

    if (findings.length === 0) {
      logger.warn("Consulting pipeline: No validated findings", { engagementId });
      return {
        status: "INSUFFICIENT_DATA",
        decisionMemo: null,
        recommendations: [],
        actions: [],
        warnings: ["No validated findings available. Run evidence gathering first."],
      };
    }

    // 3. Map findings to ConsultingEngineInput
    const evidenceItems = findings.map((finding: any) => ({
      id: finding.id,
      dimension: mapSeverityToDimension(finding.severity),
      finding: finding.description || finding.title,
      confidence: mapFindingToConfidence(finding.severity),
      source: `Finding: ${finding.title}`,
      timestamp: finding.createdAt,
      isCritical: finding.severity === "critical",
      supportingData: {},
    }));

    const businessCondition = engagement.conditionProfiles[0];

    const input: ConsultingEngineInput = {
      engagementId,
      businessProblem: engagement.description || engagement.title || "Business recovery engagement",
      evidence: evidenceItems,
      clientContext: {
        industry: engagement.client.industry || "unknown",
        size: engagement.client.size || "unknown",
        revenueImpactUrgency:
          businessCondition?.urgencyLevel?.toUpperCase() || "HIGH",
      },
    };

    // 4. Run consulting engine
    const engineOutput = await runConsultingEngine(input);

    if (engineOutput.status !== "SUCCESS") {
      logger.warn("Consulting pipeline: Engine returned non-success status", {
        engagementId,
        status: engineOutput.status,
        warnings: engineOutput.warnings,
      });
      return {
        status: "ERROR",
        decisionMemo: null,
        recommendations: [],
        actions: [],
        warnings: engineOutput.warnings,
      };
    }

    const actorId = authContext?.session?.user?.id || "consulting-engine";
    let recommendations: Recommendation[] = [];
    let actions: Action[] = [];

    try {
      // 5. Store recommendations
      recommendations = await createRecommendationsFromInterventions(
        engagementId,
        engineOutput.decisionMemo.recommendedInterventions,
        authContext,
        workspaceId || engagement.workspaceId
      );

      // 6. Generate and store actions
      actions = await createActionsFromInterventions(
        engagementId,
        engineOutput.decisionMemo.recommendedInterventions,
        authContext,
        workspaceId || engagement.workspaceId
      );

      // 7. Emit audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
        actorId,
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

      // 8. Record usage for decision engine execution
      await recordDecisionEngineUsage(workspaceId || engagement.workspaceId, {
        engagementId,
        interventionCount: engineOutput.decisionMemo.recommendedInterventions.length,
      });

      logger.info("Consulting pipeline completed successfully", {
        engagementId,
        recommendations: recommendations.length,
        actions: actions.length,
      });

      return {
        status: "SUCCESS",
        decisionMemo: engineOutput.decisionMemo,
        recommendations,
        actions,
        warnings: engineOutput.warnings,
      };
    } catch (error) {
      logger.error("Consulting pipeline failed at persistence stage", {
        engagementId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  } catch (error) {
    logger.error("Consulting pipeline failed", {
      engagementId,
      error: error instanceof Error ? error.message : String(error),
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

function mapFindingToConfidence(severity: string): string {
  const mapping: Record<string, string> = {
    critical: ConfidenceLevel.HIGH,
    high: ConfidenceLevel.HIGH,
    medium: ConfidenceLevel.MEDIUM,
    low: ConfidenceLevel.LOW,
  };
  return mapping[severity.toLowerCase()] || ConfidenceLevel.PROVISIONAL;
}
