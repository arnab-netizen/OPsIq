import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById } from "@/services/action";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

export const PATCH = withRequestContext(async (_request, context) => {
  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
  });

  const action = await getActionById(actionId);
  if (!action) throw new NotFoundError("Action", actionId);

  if (action.status === "completed" || action.status === "verified") {
    throw new ValidationError("Cannot start an already completed action");
  }

  // Update status to in_progress
  const updated = await db.action.updateMany({
    where: {
      id: actionId,
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
    actorId: session.user.id,
    entityType: "action",
    entityId: actionId,
    payload: {
      previousStatus: action.status,
      newStatus: "in_progress",
    },
    visibility: "internal",
  });

  const result = await getActionById(actionId);
  return Response.json(result);
});
