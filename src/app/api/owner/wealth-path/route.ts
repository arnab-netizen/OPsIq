/**
 * GET /api/owner/wealth-path?businessId=... — Wealth Path classification +
 *     Business Model Quality score for the owner's business, derived from
 *     persisted metric snapshots. OWNER_VIEW, workspace-scoped, canonically
 *     enforced. Read-only; no mutation.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getWealthPath } from "@/services/owner-strategy/wealth-path.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getWealthPath(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
