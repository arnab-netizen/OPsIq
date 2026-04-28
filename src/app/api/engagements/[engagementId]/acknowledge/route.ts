import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.EXECUTION_ACKNOWLEDGED,
    actorId: session.user.id,
    entityType: "engagement",
    entityId: engagementId,
    payload: {
      acknowledgedAt: new Date().toISOString(),
    },
    visibility: "internal",
  });

  return Response.json({
    success: true,
    engagementId,
    acknowledgedAt: new Date().toISOString(),
  });
});
