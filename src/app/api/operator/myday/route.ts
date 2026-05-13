import { withEnforcementFull } from "@/lib/enforced-route";
import { getMyDayItems } from "@/services/operator/myday";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

export const GET = withEnforcementFull(async () => {
  // Enforce server-side auth (fail-closed)
  const role = await resolveServerRole();
  if (!role) {
    throw new Error("Unauthorized");
  }

  // Fetch My Day items (max 5, highest priority)
  const items = await getMyDayItems();

  // Get actor ID for audit
  const session = await getSession();
  const actorId = session?.user.id ?? null;

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
