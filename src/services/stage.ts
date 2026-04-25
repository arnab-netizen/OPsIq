import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { withVersionIncrement } from "@/lib/optimistic-lock";
import { validateStageTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { GovernedStageState, BlockerSeverity, BlockerType } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateStageInput {
  engagementId: string;
  title: string;
  description?: string;
  status: GovernedStageState;
  dueAt?: string;
  ownerId?: string;
}

export interface UpdateStageInput {
  title?: string;
  description?: string;
  status?: GovernedStageState;
  dueAt?: string;
  ownerId?: string;
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
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const stage = await db.stage.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      ownerId: input.ownerId ?? null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_CREATED,
    actorId,
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

export async function getStage(id: string) {
  const stage = await db.stage.findUnique({
    where: { id },
    include: {
      engagement: true,
    },
  });
  if (!stage) throw new NotFoundError("Stage", id);
  return stage;
}

export async function getStagesForEngagement(engagementId: string) {
  return db.stage.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateStage(
  id: string,
  input: UpdateStageInput,
  actorId: string
): Promise<void> {
  const stage = await db.stage.findUnique({ where: { id } });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  if (input.status && input.status !== stage.status) {
    validateStageTransition(stage.status as GovernedStageState, input.status);

    if (stage.isBlocked && input.status !== "active" && input.status !== "deferred") {
      throw new ValidationError("Cannot transition blocked stage to this status");
    }
  }

  await db.stage.update({
    where: { id },
    data: withVersionIncrement({
      title: input.title ?? undefined,
      description: input.description ?? undefined,
      status: input.status ?? undefined,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      ownerId: input.ownerId ?? undefined,
    }),
  });

  if (input.status && input.status !== stage.status) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.STAGE_TRANSITIONED,
      actorId,
      entityType: "stage",
      entityId: id,
      payload: {
        fromStatus: stage.status,
        toStatus: input.status,
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
  actorId: string
): Promise<void> {
  const stage = await db.stage.findUnique({ where: { id } });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  if (stage.isBlocked) {
    throw new ValidationError("Stage is already blocked");
  }

  await db.stage.update({
    where: { id },
    data: withVersionIncrement({
      isBlocked: true,
      blockerSeverity: input.blockerSeverity,
      blockerType: input.blockerType,
      blockerReason: input.blockerReason,
      blockedAt: new Date(),
    }),
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_BLOCKED,
    actorId,
    entityType: "stage",
    entityId: id,
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
  actorId: string
): Promise<void> {
  const stage = await db.stage.findUnique({ where: { id } });
  if (!stage) throw new NotFoundError("Stage", id);

  if (input.version !== stage.version) {
    throw new ValidationError("Version mismatch");
  }

  if (!stage.isBlocked) {
    throw new ValidationError("Stage is not blocked");
  }

  await db.stage.update({
    where: { id },
    data: withVersionIncrement({
      isBlocked: false,
      blockerSeverity: null,
      blockerType: null,
      blockerReason: null,
      unblockedAt: new Date(),
    }),
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.STAGE_UNBLOCKED,
    actorId,
    entityType: "stage",
    entityId: id,
    payload: {
      engagementId: stage.engagementId,
    },
    visibility: "internal",
  });

  logger.info("Stage unblocked", {
    stageId: id,
    engagementId: stage.engagementId,
  });
}
