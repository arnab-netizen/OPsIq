import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { validateEngagementTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { initializeInterventionState } from "@/services/intervention-state";
import { logger } from "@/infra/logger";
import type { EngagementStatus, InterventionMode } from "@/domain/constants/statuses";
import { ENGAGEMENT_STATUSES, INTERVENTION_MODES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateEngagementInput {
  title: string;
  clientId: string;
  serviceTier: string;
  engagementMode: string;
  interventionMode: string;
  description?: string;
  startDate?: string;
  targetEndDate?: string;
  ownerId?: string;
  assignedConsultantId?: string;
  parentEngagementId?: string;
}

export interface UpdateEngagementInput {
  title?: string;
  description?: string;
  serviceTier?: string;
  engagementMode?: string;
  startDate?: string;
  targetEndDate?: string;
  ownerId?: string;
  assignedConsultantId?: string;
  healthStatus?: string;
  status?: EngagementStatus;
  interventionMode?: InterventionMode;
  version: number;
}

// ─── Code Generation ──────────────────────────────────────────────────────

async function generateEngagementCode(clientId: string): Promise<string> {
  const client = await db.clientAccount.findUnique({
    where: { id: clientId },
    select: { name: true },
  });

  const prefix = client
    ? client.name
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase()
    : "ENG";

  const count = await db.engagement.count({ where: { clientId } });
  const seq = String(count + 1).padStart(3, "0");
  const code = `${prefix}-${seq}`;

  // Ensure uniqueness
  const existing = await db.engagement.findUnique({ where: { code } });
  if (existing) {
    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    return `${prefix}-${seq}-${ts}`;
  }

  return code;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEngagement(
  input: CreateEngagementInput,
  actorId: string
): Promise<{ id: string; code: string }> {
  // Validate client exists
  const client = await db.clientAccount.findUnique({
    where: { id: input.clientId },
  });
  if (!client) throw new NotFoundError("ClientAccount", input.clientId);
  if (client.status === "archived") {
    throw new ValidationError("Cannot create engagement for an archived client");
  }

  // Validate intervention mode
  if (!INTERVENTION_MODES.includes(input.interventionMode as InterventionMode)) {
    throw new ValidationError(
      `Invalid intervention mode: ${input.interventionMode}. Must be one of: ${INTERVENTION_MODES.join(", ")}`
    );
  }

  // Validate parent engagement if provided
  if (input.parentEngagementId) {
    const parent = await db.engagement.findUnique({
      where: { id: input.parentEngagementId },
    });
    if (!parent) throw new NotFoundError("Engagement", input.parentEngagementId);
  }

  const code = await generateEngagementCode(input.clientId);
  const idempotencyKey = `engagement-create:${input.clientId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "engagement.create",
    async () => {
      return await db.$transaction(async (tx: any) => {
        const engagement = await tx.engagement.create({
          data: {
            code,
            title: input.title,
            clientId: input.clientId,
            serviceTier: input.serviceTier,
            engagementMode: input.engagementMode,
            description: input.description ?? null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            targetEndDate: input.targetEndDate ? new Date(input.targetEndDate) : null,
            ownerId: input.ownerId ?? null,
            assignedConsultantId: input.assignedConsultantId ?? null,
            parentEngagementId: input.parentEngagementId ?? null,
            createdBy: actorId,
            status: "draft",
            healthStatus: "unknown",
          },
        });

        // Initialize intervention state for this engagement (within transaction)
        await initializeInterventionState(
          engagement.id,
          input.interventionMode,
          actorId
        );

        // Emit audit event within transaction
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.ENGAGEMENT_CREATED,
          actorId,
          entityType: "engagement",
          entityId: engagement.id,
          payload: {
            code: engagement.code,
            title: engagement.title,
            clientId: input.clientId,
            interventionMode: input.interventionMode,
          },
          visibility: "internal",
        });

        return { id: engagement.id, code: engagement.code, title: engagement.title };
      });
    },
    input,
    actorId
  );

  // Trigger re-evaluation AFTER transaction commits successfully
  await triggerReEvaluation({
    changeType: "scope_change",
    entityType: "engagement",
    entityId: result.result.id,
    engagementId: result.result.id,
    severity: "high",
    description: `New engagement created: ${result.result.code} (${input.interventionMode})`,
    triggeredBy: actorId,
  });

  logger.info("Engagement created", {
    engagementId: result.result.id,
    code: result.result.code,
    clientId: input.clientId,
  });

  return { id: result.result.id, code: result.result.code };
}

export async function updateEngagement(
  engagementId: string,
  input: UpdateEngagementInput,
  actorId: string
): Promise<void> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const currentStatus = engagement.status as EngagementStatus;

  if (currentStatus === "archived") {
    throw new ValidationError("Cannot update an archived engagement");
  }

  // Validate status transition if changing status
  if (input.status && input.status !== currentStatus) {
    validateEngagementTransition(currentStatus, input.status);
  }

  // Validate intervention mode if changing
  if (
    input.interventionMode &&
    !INTERVENTION_MODES.includes(input.interventionMode)
  ) {
    throw new ValidationError(
      `Invalid intervention mode: ${input.interventionMode}. Must be one of: ${INTERVENTION_MODES.join(", ")}`
    );
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === "startDate" || k === "targetEndDate") {
      data[k] = v ? new Date(v as string) : null;
    } else {
      data[k] = v;
    }
  }

  // Track if intervention mode is changing for re-evaluation
  const interventionModeChanged =
    input.interventionMode &&
    input.interventionMode !== engagement.interventionMode;

  // Track if status is changing for specific audit events
  const statusChanged = input.status && input.status !== currentStatus;

  // Wrap multi-step update in transaction: version check + update + audit events
  await db.$transaction(async (tx: any) => {
    // Duplicate request protection: optimistic locking via version check
    const updateResult = await tx.engagement.updateMany({
      where: withVersionCheck({ id: engagementId }, version),
      data: withVersionIncrement(data),
    });

    if (updateResult.count === 0) {
      throw new Error("OPTIMISTIC_LOCK_FAILED");
    }


    // Emit update audit event
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ENGAGEMENT_UPDATED,
      actorId,
      entityType: "engagement",
      entityId: engagementId,
      payload: data,
      visibility: "internal",
    });

    // Emit specific status-change audit events
    if (statusChanged) {
      if (input.status === "completed") {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.ENGAGEMENT_COMPLETED,
          actorId,
          entityType: "engagement",
          entityId: engagementId,
          payload: { previousStatus: currentStatus },
          visibility: "internal",
        });
      } else if (input.status === "cancelled") {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.ENGAGEMENT_CANCELLED,
          actorId,
          entityType: "engagement",
          entityId: engagementId,
          payload: { previousStatus: currentStatus },
          visibility: "internal",
        });
      }
    }

    // Emit intervention mode change audit event
    if (interventionModeChanged) {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INTERVENTION_MODE_CHANGED,
        actorId,
        entityType: "engagement",
        entityId: engagementId,
        payload: {
          previousMode: engagement.interventionMode,
          newMode: input.interventionMode,
        },
        visibility: "internal",
      });
    }
  });

  // Trigger re-evaluation AFTER transaction commits
  if (interventionModeChanged) {
    await triggerReEvaluation({
      changeType: "intervention_override",
      entityType: "engagement",
      entityId: engagementId,
      engagementId,
      severity: "high",
      description: `Intervention mode changed from ${engagement.interventionMode} to ${input.interventionMode}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Engagement updated", { engagementId });
}

export async function getEngagementById(engagementId: string, hasInternalAccess: boolean = false) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: { select: { id: true, name: true, industry: true } },
      parent: { select: { id: true, code: true, title: true } },
      children: { select: { id: true, code: true, title: true, status: true } },
      conditionProfiles: {
        where: { isCurrent: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      memberships: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: { select: { leads: true } },
    },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);
  if (!hasInternalAccess && engagement.visibility !== "client_visible") {
    throw new NotFoundError("Engagement", engagementId);
  }

  return engagement;
}

export async function listEngagements(
  params: {
    limit?: number;
    offset?: number;
    status?: string;
    clientId?: string;
    search?: string;
  } = {},
  hasInternalAccess: boolean = false
) {
  const { limit = 25, offset = 0, status, clientId, search } = params;

  const visibilityFilter = hasInternalAccess ? { visibility: { in: ["internal", "client_visible"] } } : { visibility: "client_visible" };

  const where = {
    ...visibilityFilter,
    ...(status && { status }),
    ...(clientId && { clientId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { code: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [engagements, total] = await Promise.all([
    db.engagement.findMany({
      where,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        healthStatus: true,
        interventionMode: true,
        serviceTier: true,
        createdAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.engagement.count({ where }),
  ]);

  return { engagements, total, limit, offset };
}

export async function computeNextReviewDate(
  engagementId: string,
  actorId: string
): Promise<{ nextReviewDate: Date; isDueSoon: boolean; daysUntilDue: number }> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    include: {
      conditionProfiles: {
        where: { isCurrent: true },
        select: { urgencyLevel: true },
      },
    },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const baseInterval = 7; // Base interval in days
  let intervalAdjustment = 0;

  const condition = engagement.conditionProfiles[0];
  if (condition) {
    if (condition.urgencyLevel === "critical") {
      intervalAdjustment = -5; // Review in 2 days
    } else if (condition.urgencyLevel === "high") {
      intervalAdjustment = -3; // Review in 4 days
    } else if (condition.urgencyLevel === "medium") {
      intervalAdjustment = 0; // Review in 7 days
    } else {
      intervalAdjustment = 3; // Review in 10 days
    }
  }

  const reviewInterval = Math.max(1, baseInterval + intervalAdjustment);
  const lastReviewDate = engagement.startDate || new Date();
  const nextReviewDate = new Date(lastReviewDate.getTime() + reviewInterval * 24 * 60 * 60 * 1000);

  const now = new Date();
  const daysUntilDue = Math.ceil(
    (nextReviewDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  const isDueSoon = daysUntilDue <= 0 || daysUntilDue <= 2;

  if (isDueSoon) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.REVIEW_DUE_FLAGGED,
      actorId,
      entityType: "engagement",
      entityId: engagementId,
      payload: {
        engagementId,
        nextReviewDate: nextReviewDate.toISOString(),
        daysUntilDue,
        isDueSoon,
      },
      visibility: "internal",
    });

    logger.info("Review due flagged", {
      engagementId,
      nextReviewDate,
      daysUntilDue,
    });
  }

  return {
    nextReviewDate,
    isDueSoon,
    daysUntilDue,
  };
}
