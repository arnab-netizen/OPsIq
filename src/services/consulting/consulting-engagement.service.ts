/**
 * Bundle 6 — Consulting Engagement lifecycle service.
 *
 * Governs: idempotent engagement creation, phase FSM, finding creation
 * (evidence required), recommendation generation (finding required),
 * consulting action assignment (CLIENT vs CONSULTANT), engagement closure
 * gate (all critical actions resolved), and DTO boundary enforcement.
 *
 * Auth: CONSULTING_WRITE for consultants, CONSULTING_READ for clients.
 * All operations are workspace-scoped.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Engagement, Finding, Action } from "@/generated/prisma/client";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  InvalidStateTransitionError,
} from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  type ConsultingPhase,
  type ConsultingEngagementClientDTO,
  type ConsultingEngagementConsultantDTO,
  type ConsultingFindingConsultantDTO,
  type ConsultingRecommendationDTO,
  type ConsultingActionDTO,
  type ConsultingActionTarget,
  type ConsultingEngagementHealth,
  type HumanFactors,
  isValidPhaseTransition,
  toClientDTO,
  toConsultantDTO,
} from "@/domain/consulting/consulting-contracts";

// Extended engagement row type including Bundle 6 fields
type EngagementRow = Engagement & {
  consultingPhase: string;
  consultantNotes: string | null;
  humanFactors: unknown;
};

function toRow(e: Engagement): EngagementRow {
  return e as EngagementRow;
}

// ─── Engagement: create ───────────────────────────────────────────────────────

export async function createConsultingEngagement(
  params: {
    title: string;
    clientId: string;
    workspaceId: string;
    assignedConsultantId?: string;
    description?: string;
    interventionMode?: string;
    interventionPhase?: string;
    humanFactors?: HumanFactors;
  },
  actorId: string
): Promise<ConsultingEngagementConsultantDTO> {
  const existing = await db.engagement.findFirst({
    where: {
      workspaceId: params.workspaceId,
      clientId: params.clientId,
      title: params.title,
      status: { not: "CLOSED" },
    },
  });

  if (existing) {
    const r = toRow(existing);
    return toConsultantDTO({
      ...r,
      consultantNotes: r.consultantNotes,
      humanFactors: r.humanFactors,
      consultingPhase: r.consultingPhase,
      assignedConsultantId: existing.assignedConsultantId ?? null,
      createdBy: existing.createdBy ?? null,
    });
  }

  const id = randomUUID();
  const now = new Date();
  const code = `ENG-${Date.now().toString(36).toUpperCase()}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = await (db.engagement as any).create({
    data: {
      id,
      code,
      title: params.title,
      clientId: params.clientId,
      workspaceId: params.workspaceId,
      assignedConsultantId: params.assignedConsultantId ?? null,
      description: params.description ?? null,
      interventionMode: params.interventionMode ?? "recovery",
      interventionPhase: params.interventionPhase ?? "triage",
      consultingPhase: "DISCOVERY",
      status: "ACTIVE",
      healthStatus: "HEALTHY",
      serviceTier: "standard",
      engagementMode: "consulting",
      humanFactors: (params.humanFactors ?? null) as object | null,
      createdBy: actorId,
      updatedAt: now,
    },
  }) as Engagement;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_ENGAGEMENT_CREATED,
    actorId,
    entityType: "Engagement",
    entityId: created.id,
    workspaceId: params.workspaceId,
    payload: { title: params.title, clientId: params.clientId, consultingPhase: "DISCOVERY" },
  });

  return toConsultantDTO({
    ...toRow(created),
    consultantNotes: null,
    humanFactors: params.humanFactors ?? null,
    consultingPhase: "DISCOVERY",
    assignedConsultantId: params.assignedConsultantId ?? null,
    createdBy: actorId,
  });
}

// ─── Engagement: get ──────────────────────────────────────────────────────────

export async function getConsultingEngagement(
  params: { engagementId: string; workspaceId: string },
  forConsultant: boolean
): Promise<ConsultingEngagementConsultantDTO | ConsultingEngagementClientDTO> {
  const row = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!row) throw new NotFoundError("Engagement", params.engagementId);

  const r = toRow(row);
  const enriched = {
    ...r,
    consultantNotes: r.consultantNotes,
    humanFactors: r.humanFactors,
    consultingPhase: r.consultingPhase,
    assignedConsultantId: row.assignedConsultantId ?? null,
    createdBy: row.createdBy ?? null,
  };

  return forConsultant ? toConsultantDTO(enriched) : toClientDTO(enriched);
}

export async function listConsultingEngagements(
  params: { workspaceId: string },
  forConsultant: boolean
): Promise<Array<ConsultingEngagementConsultantDTO | ConsultingEngagementClientDTO>> {
  const rows = await db.engagement.findMany({
    where: { workspaceId: params.workspaceId, engagementMode: "consulting" },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row: Engagement) => {
    const r = toRow(row);
    const enriched = {
      ...r,
      consultantNotes: r.consultantNotes,
      humanFactors: r.humanFactors,
      consultingPhase: r.consultingPhase,
      assignedConsultantId: row.assignedConsultantId ?? null,
      createdBy: row.createdBy ?? null,
    };
    return forConsultant ? toConsultantDTO(enriched) : toClientDTO(enriched);
  });
}

// ─── Phase FSM: advance ───────────────────────────────────────────────────────

export async function advanceConsultingPhase(
  params: { engagementId: string; workspaceId: string; targetPhase: ConsultingPhase; rationale: string },
  actorId: string
): Promise<ConsultingEngagementConsultantDTO> {
  const row = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!row) throw new NotFoundError("Engagement", params.engagementId);
  if (row.status === "CLOSED") throw new ConflictError("Engagement is already closed");

  const currentPhase = (toRow(row).consultingPhase ?? "DISCOVERY") as ConsultingPhase;

  if (!isValidPhaseTransition(currentPhase, params.targetPhase)) {
    throw new InvalidStateTransitionError("ConsultingPhase", currentPhase, params.targetPhase);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await (db.engagement as any).update({
    where: { id: params.engagementId },
    data: { consultingPhase: params.targetPhase, updatedAt: new Date() },
  }) as Engagement;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_PHASE_ADVANCED,
    actorId,
    entityType: "Engagement",
    entityId: params.engagementId,
    workspaceId: params.workspaceId,
    payload: { from: currentPhase, to: params.targetPhase, rationale: params.rationale },
  });

  return toConsultantDTO({
    ...toRow(updated),
    consultantNotes: toRow(updated).consultantNotes,
    humanFactors: toRow(updated).humanFactors,
    consultingPhase: params.targetPhase,
    assignedConsultantId: updated.assignedConsultantId ?? null,
    createdBy: updated.createdBy ?? null,
  });
}

// ─── Finding: create (requires evidence) ─────────────────────────────────────

export async function createConsultingFinding(
  params: {
    engagementId: string;
    workspaceId: string;
    primaryEvidenceId: string;
    title: string;
    summary: string;
    severity: "critical" | "high" | "medium" | "low";
    impactArea: string;
    confidenceScore?: number;
    hypothesis?: string;
    rootCause?: string;
    consequence?: string;
    consultantNotes?: string;
  },
  actorId: string
): Promise<ConsultingFindingConsultantDTO> {
  const engagement = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", params.engagementId);
  if (engagement.status === "CLOSED") throw new ConflictError("Cannot add findings to a closed engagement");

  const evidence = await db.evidence.findFirst({
    where: { id: params.primaryEvidenceId, engagementId: params.engagementId },
  });

  if (!evidence) {
    throw new ValidationError(
      `Evidence ${params.primaryEvidenceId} not found in engagement ${params.engagementId}. Evidence must be linked before creating a finding.`
    );
  }

  const existing = await db.finding.findFirst({
    where: { engagementId: params.engagementId, title: params.title },
  });

  if (existing) {
    return buildFindingDTO(existing, params.consultantNotes);
  }

  const id = randomUUID();
  const now = new Date();

  const created = await db.finding.create({
    data: {
      id,
      engagementId: params.engagementId,
      primaryEvidenceId: params.primaryEvidenceId,
      title: params.title,
      summary: params.summary,
      severity: params.severity,
      impactArea: params.impactArea,
      status: "identified",
      confidenceScore: params.confidenceScore ?? null,
      hypothesis: params.hypothesis ?? null,
      rootCause: params.rootCause ?? null,
      consequence: params.consequence ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_FINDING_CREATED,
    actorId,
    entityType: "Finding",
    entityId: created.id,
    workspaceId: params.workspaceId,
    payload: { engagementId: params.engagementId, severity: params.severity, title: params.title },
  });

  return buildFindingDTO(created, params.consultantNotes);
}

function buildFindingDTO(f: Finding, consultantNotes?: string): ConsultingFindingConsultantDTO {
  return {
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
    consultantNotes,
    createdAt: f.createdAt.toISOString(),
  };
}

// ─── Recommendation: generate (requires finding) ──────────────────────────────

export async function generateConsultingRecommendation(
  params: {
    engagementId: string;
    workspaceId: string;
    findingId: string;
    title: string;
    description?: string;
    rationale: string;
    priority: "critical" | "high" | "medium" | "low";
    estimatedImpact?: string;
    consultingTarget: ConsultingActionTarget;
    visibility?: string;
  },
  actorId: string
): Promise<ConsultingRecommendationDTO> {
  const engagement = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", params.engagementId);
  if (engagement.status === "CLOSED") throw new ConflictError("Cannot generate recommendations for a closed engagement");

  const finding = await db.finding.findFirst({
    where: { id: params.findingId, engagementId: params.engagementId },
  });

  if (!finding) {
    throw new ValidationError(
      `Finding ${params.findingId} not found in engagement. A validated finding is required before generating a recommendation.`
    );
  }

  const existing = await db.recommendation.findFirst({
    where: { findingId: params.findingId, title: params.title },
  });

  if (existing) {
    return {
      id: existing.id,
      engagementId: existing.engagementId,
      findingId: existing.findingId!,
      title: existing.title,
      description: existing.description ?? null,
      rationale: existing.rationale ?? params.rationale,
      priority: existing.priority,
      estimatedImpact: existing.estimatedImpact ?? null,
      status: existing.status,
      consultingTarget: params.consultingTarget,
      visibility: existing.visibility,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  const id = randomUUID();

  const created = await db.recommendation.create({
    data: {
      id,
      engagementId: params.engagementId,
      workspaceId: params.workspaceId,
      findingId: params.findingId,
      title: params.title,
      description: params.description ?? null,
      rationale: params.rationale,
      priority: params.priority,
      estimatedImpact: params.estimatedImpact ?? null,
      status: "pending",
      visibility: params.visibility ?? "client",
      version: 1,
      createdBy: actorId,
      metadata: { consultingTarget: params.consultingTarget },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_RECOMMENDATION_GENERATED,
    actorId,
    entityType: "Recommendation",
    entityId: created.id,
    workspaceId: params.workspaceId,
    payload: {
      engagementId: params.engagementId,
      findingId: params.findingId,
      priority: params.priority,
      consultingTarget: params.consultingTarget,
    },
  });

  return {
    id: created.id,
    engagementId: created.engagementId,
    findingId: created.findingId!,
    title: created.title,
    description: created.description ?? null,
    rationale: created.rationale!,
    priority: created.priority,
    estimatedImpact: created.estimatedImpact ?? null,
    status: created.status,
    consultingTarget: params.consultingTarget,
    visibility: created.visibility,
    createdAt: created.createdAt.toISOString(),
  };
}

// ─── Action: assign (CLIENT or CONSULTANT) ────────────────────────────────────

export async function assignConsultingAction(
  params: {
    engagementId: string;
    workspaceId: string;
    recommendationId?: string;
    title: string;
    description?: string;
    priority: "critical" | "high" | "medium" | "low";
    consultingTarget: ConsultingActionTarget;
    assignedToUserId?: string;
    dueAt?: string;
  },
  actorId: string
): Promise<ConsultingActionDTO> {
  const engagement = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", params.engagementId);
  if (engagement.status === "CLOSED") throw new ConflictError("Cannot assign actions to a closed engagement");

  const id = randomUUID();
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = await (db.action as any).create({
    data: {
      id,
      engagementId: params.engagementId,
      recommendationId: params.recommendationId ?? null,
      title: params.title,
      description: params.description ?? null,
      status: "pending",
      assignedTo: params.assignedToUserId ?? null,
      dueAt: params.dueAt ? new Date(params.dueAt) : null,
      metadata: {
        consultingTarget: params.consultingTarget,
        priority: params.priority,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  }) as Action;

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_ACTION_ASSIGNED,
    actorId,
    entityType: "Action",
    entityId: created.id,
    workspaceId: params.workspaceId,
    payload: {
      engagementId: params.engagementId,
      consultingTarget: params.consultingTarget,
      priority: params.priority,
      title: params.title,
    },
  });

  return {
    id: created.id,
    engagementId: created.engagementId,
    title: created.title,
    description: created.description ?? null,
    status: created.status,
    priority: params.priority,
    consultingTarget: params.consultingTarget,
    assignedToUserId: created.assignedTo ?? null,
    dueAt: created.dueAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}

// ─── Health: compute ──────────────────────────────────────────────────────────

export async function computeConsultingEngagementHealth(
  params: { engagementId: string; workspaceId: string }
): Promise<ConsultingEngagementHealth> {
  const engagement = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", params.engagementId);

  const [findings, actions] = await Promise.all([
    db.finding.findMany({ where: { engagementId: params.engagementId } }),
    db.action.findMany({ where: { engagementId: params.engagementId } }),
  ]);

  const criticalUnresolved = findings.filter(
    (f: Finding) => f.severity === "critical" && f.status !== "resolved" && f.status !== "superseded"
  ).length;

  const getActionMeta = (a: Action): Record<string, unknown> =>
    (a.metadata as Record<string, unknown> | null) ?? {};

  const criticalActionsUnresolved = actions.filter(
    (a: Action) =>
      getActionMeta(a).priority === "critical" && a.status !== "completed" && a.status !== "cancelled"
  ).length;

  const overdueActions = actions.filter((a: Action) => {
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (!a.dueAt) return false;
    return a.dueAt < new Date();
  }).length;

  const reasons: string[] = [];
  let status: ConsultingEngagementHealth["status"] = "HEALTHY";

  if (criticalUnresolved > 0) {
    status = "BLOCKED";
    reasons.push(`${criticalUnresolved} unresolved critical finding(s)`);
  } else if (criticalActionsUnresolved > 0 || overdueActions > 0) {
    status = "AT_RISK";
    if (criticalActionsUnresolved > 0) reasons.push(`${criticalActionsUnresolved} critical action(s) unresolved`);
    if (overdueActions > 0) reasons.push(`${overdueActions} overdue action(s)`);
  }

  return { status, reasons, criticalFindingsUnresolved: criticalUnresolved, criticalActionsUnresolved, overdueActions };
}

// ─── Health: update (recompute + persist + audit) ────────────────────────────

export async function updateConsultingEngagementHealth(
  params: { engagementId: string; workspaceId: string },
  actorId: string
): Promise<ConsultingEngagementHealth> {
  const health = await computeConsultingEngagementHealth(params);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.engagement as any).update({
    where: { id: params.engagementId },
    data: { healthStatus: health.status.toLowerCase(), updatedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_HEALTH_UPDATED,
    actorId,
    entityType: "Engagement",
    entityId: params.engagementId,
    workspaceId: params.workspaceId,
    payload: {
      status: health.status,
      reasons: health.reasons,
      criticalFindingsUnresolved: health.criticalFindingsUnresolved,
      criticalActionsUnresolved: health.criticalActionsUnresolved,
      overdueActions: health.overdueActions,
    },
  });

  return health;
}

// ─── Engagement: close (gate: all critical actions resolved) ──────────────────

export async function closeConsultingEngagement(
  params: {
    engagementId: string;
    workspaceId: string;
    closureRationale: string;
    outcomeSummary?: string;
  },
  actorId: string
): Promise<ConsultingEngagementConsultantDTO> {
  const engagement = await db.engagement.findFirst({
    where: { id: params.engagementId, workspaceId: params.workspaceId },
  });

  if (!engagement) throw new NotFoundError("Engagement", params.engagementId);
  if (engagement.status === "CLOSED") throw new ConflictError("Engagement is already closed");

  const actions = await db.action.findMany({
    where: { engagementId: params.engagementId },
  });

  const unresolvedCritical = actions.filter((a: Action) => {
    const meta = (a.metadata as Record<string, unknown> | null) ?? {};
    return meta.priority === "critical" && a.status !== "completed" && a.status !== "cancelled";
  });

  if (unresolvedCritical.length > 0) {
    throw new ConflictError(
      `Cannot close engagement: ${unresolvedCritical.length} critical action(s) are not yet resolved. Resolve or cancel all critical actions before closing.`
    );
  }

  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await (db.engagement as any).update({
    where: { id: params.engagementId },
    data: { status: "CLOSED", actualEndDate: now, updatedAt: now },
  }) as Engagement;

  const r = toRow(updated);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONSULTING_ENGAGEMENT_CLOSED,
    actorId,
    entityType: "Engagement",
    entityId: params.engagementId,
    workspaceId: params.workspaceId,
    payload: {
      closureRationale: params.closureRationale,
      outcomeSummary: params.outcomeSummary ?? null,
      consultingPhase: toRow(engagement).consultingPhase ?? "DISCOVERY",
    },
  });

  return toConsultantDTO({
    ...r,
    consultantNotes: r.consultantNotes,
    humanFactors: r.humanFactors,
    consultingPhase: r.consultingPhase,
    assignedConsultantId: updated.assignedConsultantId ?? null,
    createdBy: updated.createdBy ?? null,
  });
}
