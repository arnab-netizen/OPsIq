/**
 * Bundle 7 Slice 5 — Consulting Engagement Export Service.
 *
 * Aggregates a consulting engagement with all associated findings,
 * recommendations, and actions into a single structured export packet.
 *
 * Auth: CONSULTING_READ (read-only export; consultant view always).
 * Workspace: params.workspaceId must match engagement.workspaceId.
 * Audit: emits consulting.engagement_exported on every successful export.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import type { Action, Finding } from "@/generated/prisma/client";
import {
  toConsultantDTO,
  type ConsultingEngagementConsultantDTO,
  type ConsultingFindingConsultantDTO,
  type ConsultingRecommendationDTO,
  type ConsultingActionDTO,
  type ConsultingActionTarget,
} from "@/domain/consulting/consulting-contracts";

type EngagementRow = {
  id: string;
  title: string;
  clientId: string;
  workspaceId: string;
  consultingPhase: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  interventionPhase: string;
  description: string | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedConsultantId: string | null;
  consultantNotes: string | null;
  createdBy: string | null;
  humanFactors: unknown;
};

export type ConsultingEngagementExport = {
  exportedAt: string;
  workspaceId: string;
  engagement: ConsultingEngagementConsultantDTO & {
    findings: ConsultingFindingConsultantDTO[];
    recommendations: ConsultingRecommendationDTO[];
    actions: ConsultingActionDTO[];
  };
};

export async function exportConsultingEngagement(
  params: { engagementId: string; workspaceId: string },
  actorId: string
): Promise<ConsultingEngagementExport> {
  const row = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!row) throw new NotFoundError("Engagement", params.engagementId);

  const [findings, recommendations, actions] = await Promise.all([
    db.finding.findMany({
      where: { engagementId: params.engagementId },
      orderBy: { createdAt: "asc" },
    }),
    db.recommendation.findMany({
      where: { engagementId: params.engagementId },
      orderBy: { createdAt: "asc" },
    }),
    db.action.findMany({
      where: { engagementId: params.engagementId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const engRow = row as unknown as EngagementRow;
  const engagementDTO = toConsultantDTO({
    ...engRow,
    consultingPhase: engRow.consultingPhase ?? "DISCOVERY",
  });

  const findingDTOs: ConsultingFindingConsultantDTO[] = (findings as Finding[]).map((f) => ({
    id: f.id,
    engagementId: f.engagementId,
    title: f.title,
    summary: f.summary,
    severity: f.severity,
    impactArea: f.impactArea,
    status: f.status,
    confidenceScore: f.confidenceScore ?? null,
    primaryEvidenceId: f.primaryEvidenceId,
    hypothesis: f.hypothesis ?? null,
    rootCause: f.rootCause ?? null,
    consequence: f.consequence ?? null,
    createdAt: f.createdAt.toISOString(),
  }));

  const recommendationDTOs: ConsultingRecommendationDTO[] = (recommendations as {
    id: string;
    engagementId: string;
    findingId: string | null;
    title: string;
    description: string | null;
    rationale: string | null;
    priority: string;
    estimatedImpact: string | null;
    status: string;
    visibility: string;
    metadata: unknown;
    createdAt: Date;
  }[]).map((r) => {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: r.id,
      engagementId: r.engagementId,
      findingId: r.findingId ?? "",
      title: r.title,
      description: r.description ?? null,
      rationale: r.rationale ?? "",
      priority: r.priority,
      estimatedImpact: r.estimatedImpact ?? null,
      status: r.status,
      consultingTarget: (meta.consultingTarget as ConsultingActionTarget) ?? "CLIENT",
      visibility: r.visibility,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const actionDTOs: ConsultingActionDTO[] = (actions as Action[]).map((a) => {
    const meta = (a.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: a.id,
      engagementId: a.engagementId,
      title: a.title,
      description: a.description ?? null,
      status: a.status,
      priority: (meta.priority as string) ?? "medium",
      consultingTarget: (meta.consultingTarget as ConsultingActionTarget) ?? "CLIENT",
      assignedToUserId: a.assignedTo ?? null,
      dueAt: a.dueAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_ENGAGEMENT_EXPORTED,
    actorId,
    entityType: "Engagement",
    entityId: params.engagementId,
    workspaceId: params.workspaceId,
    payload: {
      findingsCount: findingDTOs.length,
      recommendationsCount: recommendationDTOs.length,
      actionsCount: actionDTOs.length,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    workspaceId: params.workspaceId,
    engagement: {
      ...engagementDTO,
      findings: findingDTOs,
      recommendations: recommendationDTOs,
      actions: actionDTOs,
    },
  };
}
