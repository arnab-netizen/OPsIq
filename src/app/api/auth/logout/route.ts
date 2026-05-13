import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSession, getSessionCookieName, revokeSession } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withEnforcementFull(async () => {
  const { session } = await withAuth();

  if (session) {
    // Soft-revoke via service layer
    await revokeSession(session.sessionId, session.user.id);

    // Get user's workspace membership for audit scope
    const membership = await db.workspaceMembership.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { addedAt: "asc" },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
      actorId: session.user.id,
      entityType: "session",
      entityId: session.sessionId,
      workspaceId: membership?.workspaceId,
      visibility: "internal",
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());

  return Response.json({ success: true });
});
