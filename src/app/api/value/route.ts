import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { getItems } from "@/services/operator/store";
import { calculateValue } from "@/services/value/tracker";
import { resolveServerRole } from "@/services/auth/server-role";
import { canView } from "@/services/auth/access";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Resolve role from server-side session/database (never from request)
    const role = await resolveServerRole();

    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }

    if (!canView(role)) {
      throw new Error("Insufficient permissions");
    }

    // Get actor ID from verified context
    const actorId = ctx.verifiedActorId;
    const workspaceId = ctx.verifiedWorkspaceId;

  // Fetch all items
  const items = await getItems(workspaceId);

  // Compute value metrics
  const metrics = calculateValue(items);

  // Log audit event for viewing value metrics
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.VALUE_VIEWED,
    entityType: "Value",
    entityId: "system",
    actorId,
    actorType: "user",
    workspaceId,
    payload: {
      role,
      totalExpected: metrics.totalExpected,
      totalActual: metrics.totalActual,
      totalDelta: metrics.totalDelta,
      roi: metrics.roi,
      lossFromWrongDecisions: metrics.lossFromWrongDecisions,
      itemsAnalyzed: metrics.itemsAnalyzed,
    },
  }).catch((auditError) => {
    console.error(`Audit logging failed: ${auditError}`);
  });

  return metrics;
  },
  { requireWorkspace: true }
);
