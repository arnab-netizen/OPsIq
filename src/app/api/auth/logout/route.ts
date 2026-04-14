import { withRequestContext } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSession, getSessionCookieName } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withRequestContext(async () => {
  const session = await getSession();

  if (session) {
    // Soft-revoke: preserve session record for forensic/audit trail
    await db.session.update({
      where: { id: session.sessionId },
      data: { revokedAt: new Date() },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
      actorId: session.user.id,
      entityType: "session",
      entityId: session.sessionId,
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());

  return Response.json({ success: true });
});
