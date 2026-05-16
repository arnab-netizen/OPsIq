import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getSession, getSessionCookieName, revokeSession } from "@/services/auth";
import { cookies } from "next/headers";

export const POST = withEnforcementFull(async () => {
  const authContext = await withAuth();
  const { session } = authContext;

  if (session) {
    // Soft-revoke via service layer
    const workspaceId = (await db.workspaceMembership.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { addedAt: "asc" },
      select: { workspaceId: true },
    }))?.workspaceId;
    const canonicalContext = canonicalizeAuthContext(authContext, workspaceId || "");
    await revokeSession(session.sessionId, canonicalContext);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
      actorId: session.user.id,
      entityType: "session",
      entityId: session.sessionId,
      workspaceId,
      visibility: "internal",
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());

  return Response.json({ success: true });
});
