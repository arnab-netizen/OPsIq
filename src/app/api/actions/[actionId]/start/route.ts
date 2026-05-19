import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById } from "@/services/action";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const workspaceId = ctx.verifiedWorkspaceId;

    const action = await getActionById(actionId, workspaceId);
    if (!action) throw new NotFoundError("Action", actionId);

    if (action.status === "completed" || action.status === "verified") {
      throw new ValidationError("Cannot start an already completed action");
    }

    // Update status to in_progress
    const updated = await db.action.updateMany({
      where: {
        id: actionId,
        workspaceId,
        version: action.version,
      },
      data: {
        status: "in_progress",
        startedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ValidationError("Action has been modified by another process");
    }

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_STARTED,
      actorId: ctx.verifiedActorId,
      workspaceId,
      capability: CAPABILITIES.ACTION_UPDATE,
      decision: "action_started",
      requestId: ctx.requestId || ctx.correlationId,
      entityType: "action",
      entityId: actionId,
      payload: {
        previousStatus: action.status,
        newStatus: "in_progress",
      },
      visibility: "internal",
    });

    const result = await getActionById(actionId, workspaceId);
    return Response.json(result);
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
  }
);
