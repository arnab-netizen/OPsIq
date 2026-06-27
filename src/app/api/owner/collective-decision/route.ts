/**
 * GET /api/owner/collective-decision?engagementId=... — governed collective
 *     owner decision packet derived from the workspace's current persisted
 *     business condition profile (OWNER_VIEW).
 *
 * Auth, workspace resolution, and the OWNER_VIEW capability check are enforced by
 * the canonical wrapper. The handler reads only the verified workspace scope —
 * the workspace id is server-derived from membership, never trusted from input.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerCommandCenter } from "@/services/owner-collective/collective-decision.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const engagementId = url.searchParams.get("engagementId");
    return getOwnerCommandCenter(ctx.verifiedWorkspaceId, engagementId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
