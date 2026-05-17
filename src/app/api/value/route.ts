import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { getItems } from "@/services/operator/store";
import { calculateValue } from "@/services/value/tracker";
import { resolveServerRole } from "@/services/auth/server-role";
import { canView } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";

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

  // Fetch all items
  const items = await getItems();

  // Compute value metrics
  const metrics = calculateValue(items);

  // Log audit event for viewing value metrics
  await logAuditEvent({
    eventName: "VALUE_VIEWED",
    entityType: "Value",
    entityId: "system",
    actorId,
    role,
    before: null,
    after: null,
    metadata: {
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
