import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError } from "@/infra/errors";
import { getMyDayItems } from "@/services/operator/myday";
import { resolveServerRole } from "@/services/auth/server-role";
import { logAuditEvent } from "@/services/audit/audit-log";

export const GET = withEnforcementFull(async (request, { ctx }) => {
  // Enforce server-side auth (fail-closed)
  const role = await resolveServerRole();
  if (!role) {
    throw new UnauthorizedError("Unauthorized");
  }

  // Fetch My Day items (max 5, highest priority)
  const items = await getMyDayItems();

  // Get actor ID for audit from verified context snapshot
  const { policy } = ctx.verifiedSessionSnapshot;
  const actorId = policy.userId;

  // Emit audit event
  await logAuditEvent({
    eventName: "MYDAY_VIEWED",
    entityType: "MyDay",
    entityId: "myday",
    actorId,
    role,
    before: null,
    after: {
      itemCount: items.length,
    },
  });

  return { items };
});
