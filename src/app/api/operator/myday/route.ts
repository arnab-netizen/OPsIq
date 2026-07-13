import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { getMyDayItems } from "@/services/operator/myday";
import { resolveServerRole } from "@/services/auth/server-role";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export const GET = withCanonicalEnforcement(async (ctx) => {
  // Enforce server-side auth (fail-closed)
  const role = await resolveServerRole();
  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  const workspaceId = ctx.verifiedWorkspaceId;

  // Fetch My Day items (max 5, highest priority)
  const items = await getMyDayItems(workspaceId);

  // Get actor ID for audit from verified context snapshot
  const actorId = ctx.verifiedSessionSnapshot.actorId;

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.MYDAY_VIEWED,
    entityType: "MyDay",
    entityId: "myday",
    actorId,
    actorType: "user",
    workspaceId,
    payload: {
      role,
      after: { itemCount: items.length },
    },
  });

  return { items };
});
