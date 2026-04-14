import { withRequestContext } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSession, getSessionCookieName } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withRequestContext(async () => {
  const session = await getSession();

  if (session) {
    await db.session.delete({ where: { id: session.sessionId } });

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
