/**
 * PATCH /api/owner/alerts/[id]/read — mark an alert as read
 *
 * Workspace-scoped; verifies the alert belongs to the requesting workspace
 * before mutating. OWNER_VIEW required.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { markAlertAsRead } from "@/services/alerts/alert-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const alertId = params.id;
    if (!alertId) {
      return canonicalJson({ error: "Alert ID is required" }, { status: 400 });
    }

    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const alert = await markAlertAsRead(alertId, workspaceId, actorId);
    return canonicalJson({ alert }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
