/** GET /api/billing/status — owner-visible billing state for the caller's own workspace only. */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBillingStatus } from "@/services/billing/commercial-access.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => getBillingStatus(ctx.verifiedWorkspaceId),
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] },
);
