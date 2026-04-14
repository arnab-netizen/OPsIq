import { withRequestContext } from "@/lib/api-handler";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSession, getSessionCookieName, revokeSession } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withRequestContext(async () => {
  const session = await getSession();

  if (session) {
    // Soft-revoke via service layer
    await revokeSession(session.sessionId, session.user.id);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
      actorId: session.user.id,
      entityType: "session",
      entityId: session.sessionId,
      visibility: "internal",
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());

  return Response.json({ success: true });
});
