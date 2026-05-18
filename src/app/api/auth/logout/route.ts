import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSessionCookieName, revokeSession } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const actorId = ctx.verifiedActorId;
    const workspaceId = ctx.verifiedWorkspaceId;

    if (actorId && workspaceId) {
      // Soft-revoke via service layer with verified context
      await revokeSession(actorId, ctx);

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
        actorId,
        entityType: "session",
        entityId: actorId,
        workspaceId,
        visibility: "internal",
      });
    }

    const cookieStore = await cookies();
    cookieStore.delete(getSessionCookieName());

    return Response.json({ success: true });
  },
  { skipReadinessCheck: true }
);
