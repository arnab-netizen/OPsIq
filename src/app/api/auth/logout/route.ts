import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
      actorId: session.user.id,
      entityType: "session",
      entityId: session.sessionId,
      workspaceId,
      visibility: 'internal',
    capability: 'mutation',
    ,
    requestId: randomUUID()
  };
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());

  return Response.json({ success: true });
});
