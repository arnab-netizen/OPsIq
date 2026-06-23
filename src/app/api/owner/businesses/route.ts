/** GET /api/owner/businesses — lightweight business list for progressive UI loading (OWNER_VIEW) */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listBusinesses } from "@/services/founder-recovery/business.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const businesses = await listBusinesses(ctx.verifiedWorkspaceId);
    return {
      businesses: businesses.map((b: any) => ({
        id: b.id,
        name: b.name,
        businessType: b.businessType,
        currency: b.currency,
        isActive: b.isActive,
      })),
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
