/**
 * GET /api/owner/integrations/quickbooks/status?businessId=… — token-free QuickBooks sync status (OWNER_VIEW).
 *
 * Returns connection state, environment, whether a sync is running, last attempt / last success, the last SAFE error
 * code, whether reauthorization is required, and held record counts. It never returns tokens, ciphertext, OAuth state,
 * the realm id or any provider payload. The business must belong to the session's workspace (otherwise 404).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams } from "@/lib/validation";
import { QboStatusQuerySchema } from "@/domain/quickbooks/qbo-sync-model";
import { getQboSyncStatus } from "@/services/quickbooks/qbo-sync-status.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const query = parseSearchParams(ctx.request!.url, QboStatusQuerySchema);
    const status = await getQboSyncStatus({ workspaceId: ctx.verifiedWorkspaceId, businessId: query.businessId });
    return canonicalJson(status, { status: 200, headers: { "cache-control": "no-store" } });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true, requireActorType: "user" },
);
