/**
 * GET /api/owner/trust/audit-trail?entityId= — the governed audit trail for an
 * entity (who changed what, when) from the existing audit log (OWNER_VIEW).
 * Read-only; workspace-scoped.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { getEntityAuditTrail } from "@/services/owner-trust/trust.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const entityId = parseOrThrow(uuidSchema, url.searchParams.get("entityId"));
    const events = await getEntityAuditTrail(entityId, ctx.verifiedWorkspaceId);
    return { entityId, events };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
