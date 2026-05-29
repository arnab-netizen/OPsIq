import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError, PlanLimitError } from "@/infra/errors";
import { ClassifiedApiError, hasClassification, extractSafePrismaError } from "@/infra/classified-error";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { validateEngagementTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { initializeInterventionState } from "@/services/intervention-state";
import { computeEngagementHealth, enforceEngagementHealth } from "@/services/engagement-health";
import { logger } from "@/infra/logger";
import type { EngagementStatus, InterventionMode } from "@/domain/constants/statuses";
import { ENGAGEMENT_STATUSES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { assertCapability } from "@/services/entitlement.service";
import { recordEngagementCreationUsage } from "@/services/usage.service";

// Service version for diagnostics
const ENGAGEMENTS_SERVICE_VERSION = "engagements-service-prisma-debug-v1";

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

async function generateEngagementCode(workspaceId: string, clientId: string): Promise<string> {
  enforceWorkspaceId(workspaceId, "generateEngagementCode", "engagement");

  const client = await db.clientAccount.findUnique({
    where: { id: clientId, workspaceId },
    select: { name: true },
  });

  const prefix = client
    ? client.name
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase()
    : "ENG";

  const count = await db.engagement.count({ where: { clientId, workspaceId } });
  const seq = String(count + 1).padStart(3, "0");
  const code = `${prefix}-${seq}`;

  // Ensure uniqueness
  const existing = await db.engagement.findUnique({ where: { code, workspaceId } });
  if (existing) {
    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    return `${prefix}-${seq}-${ts}`;
  }

  return code;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createEngagement(
  input: CreateEngagementInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string; code: string }> {
  // Check capability: create_engagement
  const capabilityCheck = await assertCapability(workspaceId, "create_engagement");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("create_engagement", capabilityCheck.reason || "Plan limit exceeded");
  }

  // Service-layer auth: require authContext, extract userId from it (never from parameters)
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  // Validate client exists
  const client = await db.clientAccount.findUnique({
    where: { id: input.clientId, workspaceId: validatedWorkspaceId },
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
      where: { id: input.parentEngagementId, workspaceId: validatedWorkspaceId },
    });
    if (!parent) throw new NotFoundError("Engagement", input.parentEngagementId);
  }

  const code = await generateEngagementCode(validatedWorkspaceId, input.clientId);
  const idempotencyKey = `engagement-create:${input.clientId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "engagement.create",
    async () => {
      const engagement = await db.engagement.create({
        data: {
          code,
          title: input.title,
          clientId: input.clientId,
          workspaceId: validatedWorkspaceId,
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

      // Initialize intervention state for this engagement
      await initializeInterventionState(
        engagement.id,
        input.interventionMode,
        authContext,
        validatedWorkspaceId
      );

      return { id: engagement.id, code: engagement.code, title: engagement.title };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_CREATED,
    actorId,
    entityType: "engagement",
    entityId: result.result.id,
    workspaceId: validatedWorkspaceId,
    payload: {
      code: result.result.code,
      title: result.result.title,
      clientId: input.clientId,
      interventionMode: input.interventionMode,
    },
    visibility: "internal",
  });

  // New engagement is significant intervention scope change
  await triggerReEvaluation({
    changeType: "scope_change",
    entityType: "engagement",
    entityId: result.result.id,
    engagementId: result.result.id,
    workspaceId: validatedWorkspaceId,
    severity: "high",
    description: `New engagement created: ${result.result.code} (${input.interventionMode})`,
    triggeredBy: actorId,
  });

  // Record usage for engagement creation
  await recordEngagementCreationUsage(validatedWorkspaceId, {
    engagementId: result.result.id,
    code: result.result.code,
    clientId: input.clientId,
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
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  // Service-layer auth: require authContext, extract userId from it (never from parameters)
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const currentStatus = engagement.status as EngagementStatus;

  if (currentStatus === "archived") {
    throw new ValidationError("Cannot update an archived engagement");
  }

  // Validate status transition if changing status
  if (input.status && input.status !== currentStatus) {
    validateEngagementTransition(currentStatus, input.status);

    // Enforce health check for critical transitions
    if (input.status === "completed" || input.status === "archived") {
      const canProceed = await enforceEngagementHealth(engagementId, input.status, validatedWorkspaceId);
      if (!canProceed) {
        const health = await computeEngagementHealth(engagementId, validatedWorkspaceId);
        throw new ValidationError(
          `Cannot transition engagement to ${input.status} due to critical issues: ${health.reasons.join("; ")}`
        );
      }

      // Emit health-related audit events
      const health = await computeEngagementHealth(engagementId, validatedWorkspaceId);
      if (health.status === "blocked") {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.ENGAGEMENT_BLOCKED,
          actorId,
          entityType: "engagement",
          entityId: engagementId,
          workspaceId: validatedWorkspaceId,
          payload: {
            reasons: health.reasons,
            blockingDetails: health.details,
          },
          visibility: "internal",
        });
      } else if (health.status === "at_risk") {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RISK_IDENTIFIED,
          actorId,
          entityType: "engagement",
          entityId: engagementId,
          workspaceId: validatedWorkspaceId,
          payload: {
            reasons: health.reasons,
            riskDetails: health.details,
          },
          visibility: "internal",
        });
      }
    }
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

  // Duplicate request protection: optimistic locking via version check
  // Duplicate requests with old version fail fast with 409 Conflict
  await optimisticUpdate("engagement", engagementId, version, () =>
    db.engagement.update({
      where: withVersionCheck({ id: engagementId, workspaceId: validatedWorkspaceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_UPDATED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    workspaceId: validatedWorkspaceId,
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
        workspaceId: validatedWorkspaceId,
        payload: { previousStatus: currentStatus },
        visibility: "internal",
      });
    } else if (input.status === "cancelled") {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.ENGAGEMENT_CANCELLED,
        actorId,
        entityType: "engagement",
        entityId: engagementId,
        workspaceId: validatedWorkspaceId,
        payload: { previousStatus: currentStatus },
        visibility: "internal",
      });
    }
  }

  // Trigger re-evaluation if intervention mode changed
  if (interventionModeChanged) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.INTERVENTION_MODE_CHANGED,
      actorId,
      entityType: "engagement",
      entityId: engagementId,
      workspaceId: validatedWorkspaceId,
      payload: {
        previousMode: engagement.interventionMode,
        newMode: input.interventionMode,
      },
      visibility: "internal",
    });

    await triggerReEvaluation({
      changeType: "intervention_override",
      entityType: "engagement",
      entityId: engagementId,
      engagementId,
      workspaceId: validatedWorkspaceId,
      severity: "high",
      description: `Intervention mode changed from ${engagement.interventionMode} to ${input.interventionMode}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Engagement updated", { engagementId });
}

export async function getEngagementById(engagementId: string, workspaceId: string, hasInternalAccess: boolean = false) {
  enforceWorkspaceId(workspaceId, "getEngagementById", "engagement");

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    include: {
      client: { select: { id: true, name: true, industry: true } },
      parent: { select: { id: true, code: true, title: true } },
      children: { select: { id: true, code: true, title: true, status: true } },
      conditionProfiles: {
        where: { isCurrent: true, workspaceId },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      memberships: {
        where: { isActive: true, workspaceId },
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

// Typed Prisma select for engagements list to catch relation name errors at compile time
// Using relation name 'clientAccount' which matches the Prisma schema
const engagementListSelect = {
  id: true,
  code: true,
  title: true,
  status: true,
  healthStatus: true,
  interventionMode: true,
  serviceTier: true,
  createdAt: true,
  clientAccount: { select: { id: true, name: true } },
} as const;

export async function listEngagements(
  workspaceId: string,
  params: {
    limit?: number;
    offset?: number;
    status?: string;
    clientId?: string;
    search?: string;
  } = {},
  hasInternalAccess: boolean = false
) {
  let stage = "service_start";
  try {
    enforceWorkspaceId(workspaceId, "listEngagements", "engagement");

    const { limit = 25, offset = 0, status, clientId, search } = params;

    const visibilityFilter = hasInternalAccess ? { visibility: { in: ["internal", "client_visible"] } } : { visibility: "client_visible" };

    stage = "build_where";
    const where = {
      workspaceId,
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

    if (!where) {
      throw new ClassifiedApiError(
        "failed to build query where clause",
        "engagements_build_where_failed",
        stage
      );
    }

    // Stage 2: Execute findMany
    stage = "find_many";
    let engagements;
    try {
      engagements = await db.engagement.findMany({
        where,
        select: engagementListSelect,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const safeDetails = extractSafePrismaError(error);
      logger.error("listEngagements findMany failed", {
        workspaceId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: msg,
        ...safeDetails,
      });
      const classifiedError = new ClassifiedApiError(
        msg,
        "engagements_find_many_failed",
        stage,
        500,
        error
      );
      // Add safe Prisma details with operation context for diagnostics
      classifiedError.safeDetails = {
        ...safeDetails,
        failingOperation: "engagement.findMany",
        engagementsServiceVersion: ENGAGEMENTS_SERVICE_VERSION
      };
      throw classifiedError;
    }

    // Stage 3: Validate findMany result
    if (!Array.isArray(engagements)) {
      throw new ClassifiedApiError(
        "findMany did not return array",
        "engagements_find_many_failed",
        stage
      );
    }

    // Stage 4: Execute count
    stage = "count";
    let total;
    try {
      total = await db.engagement.count({ where });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const safeDetails = extractSafePrismaError(error);
      logger.error("listEngagements count failed", {
        workspaceId,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: msg,
        ...safeDetails,
      });
      const classifiedError = new ClassifiedApiError(
        msg,
        "engagements_count_failed",
        stage,
        500,
        error
      );
      // Add safe Prisma details with operation context for diagnostics
      classifiedError.safeDetails = {
        ...safeDetails,
        failingOperation: "engagement.count",
        engagementsServiceVersion: ENGAGEMENTS_SERVICE_VERSION
      };
      throw classifiedError;
    }

    // Stage 5: Validate count result
    if (typeof total !== "number") {
      throw new ClassifiedApiError(
        "count did not return number",
        "engagements_count_failed",
        stage
      );
    }

    // Stage 6: Map response
    stage = "map_response";
    return {
      engagements,
      total,
      limit,
      offset,
      _engagementsServiceVersion: "v1-2026-05-29"
    };
  } catch (error) {
    // Catch ANY error that escaped inner handlers
    // Ensure it's always ClassifiedApiError before throwing
    if (hasClassification(error)) {
      throw error;
    }
    // Wrap any unexpected raw error
    const msg = error instanceof Error ? error.message : String(error);
    throw new ClassifiedApiError(
      `listEngagements failed at ${stage}: ${msg}`,
      `engagements_${stage}_failed`,
      stage,
      500,
      error
    );
  }
}

export async function computeNextReviewDate(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ nextReviewDate: Date; isDueSoon: boolean; daysUntilDue: number }> {
  const actorId = authContext.session?.user?.id;
  enforceWorkspaceId(workspaceId, "computeNextReviewDate", "engagement");

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    include: {
      conditionProfiles: {
        where: { isCurrent: true, workspaceId },
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
      workspaceId,
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
