import type { ServiceCapabilityContext } from '@/lib/auth-guard';
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/infra/errors";
import { ROLES, type RoleName } from "@/domain/constants/roles";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AddMemberInput {
  userId: string;
  engagementId: string;
  role: RoleName;
  workspaceId: string;
}

export interface RemoveMemberInput {
  userId: string;
  engagementId: string;
  role: RoleName;
  workspaceId: string;
}

// ─── Validation ────────────────────────────────────────────────────────────

function validateRoleName(role: string): asserts role is RoleName {
  const validRoles = Object.values(ROLES) as string[];
  if (!validRoles.includes(role)) {
    throw new ValidationError(`Invalid role: ${role}`);
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function addMember(
  input: AddMemberInput,
  authContext: CanonicalAuthContext
): Promise<{ id: string; isNew: boolean }> {
  validateRoleName(input.role);

  const actorId = authContext.verifiedActorId;

  // Verify user exists, is active, and is member of the workspace
  const user = await db.user.findFirst({
    where: {
      id: input.userId,
      workspaceMemberships: { some: { workspaceId: input.workspaceId, isActive: true } },
    },
  });

  if (!user) {
    throw new NotFoundError("User", input.userId);
  }

  if (!user.isActive) {
    throw new ValidationError(
      "Cannot add a deactivated user to an engagement"
    );
  }

  const idempotencyKey = `membership-add:${input.userId}:${input.engagementId}:${input.role}`;

  const result = await withIdempotency(
    idempotencyKey,
    "engagement_membership.add",
    async () => {
      // Check if active membership already exists
      const existing = await db.engagementMembership.findFirst({
        where: {
          userId: input.userId,
          engagementId: input.engagementId,
          role: input.role,
          isActive: true,
          engagement: { workspaceId: input.workspaceId },
        },
      });

      if (existing) {
        throw new ConflictError(
          `User ${input.userId} already has role "${input.role}" in engagement ${input.engagementId}`
        );
      }

      // Reactivate if previously removed
      const removed = await db.engagementMembership.findFirst({
        where: {
          userId: input.userId,
          engagementId: input.engagementId,
          role: input.role,
          isActive: false,
          engagement: { workspaceId: input.workspaceId },
        },
      });

      if (removed) {
        const updated = await db.engagementMembership.update({
          where: { id: removed.id },
          data: {
            isActive: true,
            removedAt: null,
            addedBy: actorId,
            addedAt: new Date(),
          },
        });
        return { id: updated.id, isReactivation: true };
      }

      const membership = await db.engagementMembership.create({
        data: {
          userId: input.userId,
          engagementId: input.engagementId,
          role: input.role,
          addedBy: actorId,
        },
      });

      return { id: membership.id, isReactivation: false };
    }
  );

  // Get engagement for workspace context
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: input.workspaceId },
    select: { workspaceId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_MEMBER_ADDED,
    actorId,
    workspaceId: engagement?.workspaceId,
    capability: 'ENGAGEMENT_MEMBER_ADD',
    requestId: authContext?.requestId,
    entityType: "engagement_membership",
    entityId: result.result.id,
    payload: {
      userId: input.userId,
      engagementId: input.engagementId,
      role: input.role,
    },
    visibility: "internal",
  });

  // V3 adaptive: membership changes affect engagement dynamics
  await triggerReEvaluation({
    changeType: "scope_change",
    entityType: "engagement_membership",
    entityId: result.result.id,
    engagementId: input.engagementId,
    workspaceId: input.workspaceId,
    severity: "low",
    description: `Member added: user ${input.userId} as "${input.role}"`,
    triggeredBy: actorId,
  });

  logger.info("Engagement member added", {
    userId: input.userId,
    engagementId: input.engagementId,
    role: input.role,
    addedBy: actorId,
  });

  return { id: result.result.id, isNew: result.isNew };
}

export async function removeMember(
  input: RemoveMemberInput,
  authContext: CanonicalAuthContext
): Promise<void> {
  validateRoleName(input.role);

  const actorId = authContext.verifiedActorId;
  const idempotencyKey = `membership-remove:${input.userId}:${input.engagementId}:${input.role}`;

  const membership = await db.engagementMembership.findFirst({
    where: {
      userId: input.userId,
      engagementId: input.engagementId,
      role: input.role,
      isActive: true,
      engagement: { workspaceId: input.workspaceId },
    },
  });

  // Idempotent: if already removed or never existed, return success (duplicate request protection)
  if (!membership) {
    // Idempotent: if already removed or never existed, no-op
    logger.info("Member already removed or not found", {
      userId: input.userId,
      engagementId: input.engagementId,
      role: input.role,
    });
    return;
  }

  await withIdempotency(
    idempotencyKey,
    "engagement_membership.remove",
    async () => {
      await db.engagementMembership.update({
        where: { id: membership.id },
        data: {
          isActive: false,
          removedAt: new Date(),
        },
      });
      return { id: membership.id };
    }
  );

  // Get engagement for workspace context
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: input.workspaceId },
    select: { workspaceId: true },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_MEMBER_REMOVED,
    actorId,
    workspaceId: engagement?.workspaceId,
    capability: 'ENGAGEMENT_MEMBER_REMOVE',
    requestId: authContext?.requestId,
    entityType: "engagement_membership",
    entityId: membership.id,
    payload: {
      userId: input.userId,
      engagementId: input.engagementId,
      role: input.role,
    },
    visibility: "internal",
  });

  // V3 adaptive: losing a team member may affect engagement capacity
  await triggerReEvaluation({
    changeType: "key_employee_loss",
    entityType: "engagement_membership",
    entityId: membership.id,
    engagementId: input.engagementId,
    workspaceId: input.workspaceId,
    severity: "medium",
    description: `Member removed: user ${input.userId} from role "${input.role}"`,
    triggeredBy: actorId,
  });

  logger.info("Engagement member removed", {
    userId: input.userId,
    engagementId: input.engagementId,
    role: input.role,
    removedBy: actorId,
  });
}

export async function getMembershipsForUser(userId: string, workspaceId: string) {
  return db.engagementMembership.findMany({
    where: {
      userId,
      isActive: true,
      engagement: { workspaceId },
    },
    select: {
      id: true,
      engagementId: true,
      role: true,
      addedAt: true,
      addedBy: true,
    },
    orderBy: { addedAt: "desc" },
  });
}

export async function getMembersForEngagement(engagementId: string, workspaceId: string) {
  return db.engagementMembership.findMany({
    where: {
      engagementId,
      isActive: true,
      engagement: { workspaceId },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });
}
