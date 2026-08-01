import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSessionCookieName, revokeSession } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const actorId = ctx.verifiedActorId;
    const workspaceId = ctx.verifiedWorkspaceId;
    // The canonical wrapper resolves the session from the opaque cookie token
    // and places the verified SessionInfo on the context. Its sessionId is the
    // sessions.id primary key — the only correct input to revokeSession().
    // The actor id identifies the user, not the session, and must never be
    // used here.
    const verifiedSession = ctx.session;

    if (actorId && workspaceId && verifiedSession) {
      // Soft-revoke via service layer with verified context. Returns false when
      // the session was already revoked or removed; logout stays idempotent and
      // still clears the cookie below.
      const revoked = await revokeSession(verifiedSession, ctx);

      if (revoked) {
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
          actorId,
          entityType: "session",
          entityId: verifiedSession.sessionId,
          workspaceId,
          visibility: "internal",
        });
      }
    }

    const cookieStore = await cookies();
    cookieStore.delete(getSessionCookieName());

    return { success: true };
  },
  { skipReadinessCheck: true }
);
