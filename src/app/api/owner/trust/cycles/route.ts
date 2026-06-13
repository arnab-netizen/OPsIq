/**
 * GET /api/owner/trust/cycles?businessId= — for a business, the latest diagnosis
 * cycle in every trust domain that has one, plus the business list (OWNER_VIEW).
 * Lets the owner pick a real cycle to explain without typing UUIDs. Read-only.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBusinessTrustOverview } from "@/services/owner-trust/trust.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    return getBusinessTrustOverview(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
