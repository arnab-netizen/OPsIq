import type { ServiceCapabilityContext } from '@/lib/auth-guard';
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { withVersionIncrement } from "@/lib/optimistic-lock";
import { validateStageTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import { requireCapabilityForService } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import type { GovernedStageState, BlockerSeverity, BlockerType } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateStageInput {
  engagementId: string;
  title: string;
  description?: string;
  status: GovernedStageState;
}

export interface UpdateStageInput {
  title?: string;
  description?: string;
  status?: GovernedStageState;
  version: number;
}

export interface BlockStageInput {
  blockerSeverity: BlockerSeverity;
  blockerType: BlockerType;
  blockerReason: string;
  version: number;
}

export interface UnblockStageInput {
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createStage(
  input: CreateStageInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_CREATE);

  const actorId = authContext.verifiedActorId;
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const stage = await db.stage.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_CREATED,
    actorId,
    workspaceId: validatedWorkspaceId,
    capability: 'STAGE_CREATE',
    decision: 'stage_created',
    requestId: authContext?.requestId,
    entityType: "stage",
    entityId: stage.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
      status: input.status,
    },
    visibility: "internal",
  });

  logger.info("Stage created", {
    stageId: stage.id,
    engagementId: input.engagementId,
  });

  return { id: stage.id };
}

export async function getStage(id: string, authContext: CanonicalAuthContext, workspaceId: string) {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_VIEW);

  const stage = await db.stage.findFirst({
    where: { id, engagement: { workspaceId } },
    include: {
      engagement: true,
    },
  });
  if (!stage) throw new NotFoundError("Stage", id);

  return stage;
}

export async function getStagesForEngagement(engagementId: string, authContext: CanonicalAuthContext, workspaceId: string) {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_VIEW);

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.stage.findMany({
    where: { engagementId, engagement: { workspaceId } },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateStage(
  id: string,
  input: UpdateStageInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_TRANSITION);

  const actorId = authContext.verifiedActorId;
  const stage = await db.stage.findFirst({
    where: { id, engagement: { workspaceId } },
    include: { engagement: true },
  });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  if (input.status && input.status !== stage.status) {
    validateStageTransition(stage.status as GovernedStageState, input.status);
  }

  const updateData = {
    title: input.title ?? undefined,
    description: input.description ?? undefined,
    status: input.status ?? undefined,
  };

  await db.stage.update({
    where: { id },
    data: withVersionIncrement(updateData),
  });

  const hasPropertyChanges = input.title !== undefined || input.description !== undefined;
  const hasStatusChange = input.status && input.status !== stage.status;

  if (hasStatusChange) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.STAGE_TRANSITIONED,
      actorId,
      entityType: "stage",
      entityId: id,
      workspaceId: stage.engagement.workspaceId,
      payload: {
        fromStatus: stage.status,
        toStatus: input.status,
      },
      visibility: "internal",
    capability: 'mutation',
    decision: 's_t_a_g_e__t_r_a_n_s_i_t_i_o_n_e_d',
    requestId: randomUUID(),

    });
  }

  if (hasPropertyChanges && !hasStatusChange) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.STAGE_UPDATED,
      actorId,
      entityType: "stage",
      entityId: id,
      workspaceId: stage.engagement.workspaceId,
      capability: \'mutation\',
      decision: \'stage_transitioned\',
      requestId: randomUUID(),
      payload: {
        title: input.title,
        description: input.description,
      },
      visibility: "internal",
    });
  }

  logger.info("Stage updated", {
    stageId: id,
    engagementId: stage.engagementId,
  });
}

export async function blockStage(
  id: string,
  input: BlockStageInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_TRANSITION);

  const actorId = authContext.verifiedActorId;
  const stage = await db.stage.findFirst({
    where: { id, engagement: { workspaceId } },
    include: { engagement: true },
  });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  // Block the engagement (source of truth for blocking state)
  const engagement = await db.engagement.findUnique({
    where: { id: stage.engagementId, workspaceId },
    select: { version: true, isBlocked: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", stage.engagementId);

  if (!engagement.isBlocked) {
    await db.engagement.update({
      where: { id: stage.engagementId },
      data: {
        isBlocked: true,
        blockerReason: input.blockerReason,
        blockedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ENGAGEMENT_BLOCKED,
      actorId,
      entityType: "engagement",
      entityId: stage.engagementId,
      workspaceId: stage.engagement.workspaceId,
      capability: \'mutation\',
      decision: \'stage_updated\',
      requestId: randomUUID(),
      payload: {
        blockerReason: input.blockerReason,
        blockerSeverity: input.blockerSeverity,
      },
      visibility: "internal",
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_BLOCKED,
    actorId,
    entityType: "stage",
    entityId: id,
    workspaceId: stage.engagement.workspaceId,
      capability: \'mutation\',
      decision: \'engagement_blocked\',
      requestId: randomUUID(),
    payload: {
      engagementId: stage.engagementId,
      blockerSeverity: input.blockerSeverity,
      blockerType: input.blockerType,
      blockerReason: input.blockerReason,
    },
    visibility: "internal",
  });

  await triggerReEvaluation({
    changeType: "stage_blocked",
    entityType: "stage",
    entityId: id,
    engagementId: stage.engagementId,
    workspaceId: stage.engagement.workspaceId,
    severity: input.blockerSeverity === "critical" ? "critical" : "high",
    description: `Stage blocked: ${input.blockerReason}`,
    triggeredBy: actorId,
  });

  logger.info("Stage blocked", {
    stageId: id,
    engagementId: stage.engagementId,
  });
}

export async function unblockStage(
  id: string,
  input: UnblockStageInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  requireCapabilityForService(authContext, CAPABILITIES.STAGE_TRANSITION);

  const actorId = authContext.verifiedActorId;
  const stage = await db.stage.findFirst({
    where: { id, engagement: { workspaceId } },
    include: { engagement: true },
  });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  // Unblock the engagement (source of truth for blocking state)
  const engagement = await db.engagement.findUnique({
    where: { id: stage.engagementId, workspaceId },
    select: { version: true, isBlocked: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", stage.engagementId);

  if (engagement.isBlocked) {
    await db.engagement.update({
      where: { id: stage.engagementId },
      data: {
        isBlocked: false,
        blockerReason: null,
        blockedAt: null,
        version: { increment: 1 },
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ENGAGEMENT_UNBLOCKED,
      actorId,
      entityType: "engagement",
      entityId: stage.engagementId,
      workspaceId: stage.engagement.workspaceId,
      capability: \'mutation\',
      decision: \'stage_blocked\',
      requestId: randomUUID(),
      payload: {},
      visibility: "internal",
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_UNBLOCKED,
    actorId,
    entityType: "stage",
    entityId: id,
    workspaceId: stage.engagement.workspaceId,
    payload: {
      engagementId: stage.engagementId,
    },
    visibility: "internal",
    capability: 'mutation',
    decision: 's_t_a_g_e__u_n_b_l_o_c_k_e_d',
    requestId: randomUUID(),

  });

  logger.info("Stage unblocked", {
    stageId: id,
    engagementId: stage.engagementId,
  });
}
