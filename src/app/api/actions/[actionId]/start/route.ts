import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById, validateActionTransition } from "@/services/action";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { ActionStatus } from "@/domain/constants/statuses";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const workspaceId = ctx.verifiedWorkspaceId;

    const action = await getActionById(actionId, workspaceId);
    if (!action) throw new NotFoundError("Action", actionId);

    // FSM validation — throws ValidationError on invalid transition
    validateActionTransition(action.status as ActionStatus, "in_progress");

    // Atomic: update + audit in one transaction
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.action.updateMany({
        where: {
          id: actionId,
          engagement: { workspaceId },
          version: action.version,
        },
        data: {
          status: "in_progress",
          startedAt: new Date(),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new ConflictError("Action has been modified by another process");
      }

      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.ACTION_STARTED,
          actorId: ctx.verifiedActorId,
          workspaceId,
          entityType: "action",
          entityId: actionId,
          payload: {
            previousStatus: action.status,
            newStatus: "in_progress",
          },
          visibility: "internal",
        },
        tx,
      );

      return result;
    });

    void updated; // count already checked inside transaction

    const result = await getActionById(actionId, workspaceId);
    return result;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
  }
);
