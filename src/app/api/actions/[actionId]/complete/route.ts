import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById } from "@/services/action";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { recordOutcome } from "@/services/outcome/outcome.service";
import { logger } from "@/infra/logger";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { actionId } = await context.params;
  parseOrThrow(uuidSchema, actionId);

  const action = await getActionById(actionId, workspaceId);
  if (!action) throw new NotFoundError("Action", actionId);

  if (action.status === "completed" || action.status === "verified") {
    throw new ValidationError("Action is already completed");
  }

  // Update status to completed
  const updated = await db.action.updateMany({
    where: {
      id: actionId,
      workspaceId,
      version: action.version,
    },
    data: {
      status: "completed",
      completedAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new ValidationError("Action has been modified by another process");
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_COMPLETED,
    actorId: session.user.id,
    entityType: "action",
    entityId: actionId,
    payload: {
      previousStatus: action.status,
      newStatus: "completed",
    },
    visibility: "internal",
  });

  // Record outcome for decision tracking
  try {
    const idempotencyKey = nextRequest.headers.get("idempotency-key") || undefined;
    await recordOutcome(actionId, session.user.id, idempotencyKey, workspaceId);
  } catch (err) {
    // Log but don't fail the action completion
    logger.error("Failed to record outcome", {
      actionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const result = await getActionById(actionId, workspaceId);
  return Response.json(result);
});
