/**
 * GET /api/owner/businesses/[businessId]/outcome-chains — every decision-backed outcome chain of the business (OWNER_VIEW).
 *      Read-only: the same decision + assessment read model as `outcome-chain`, for all of the business's chains in one
 *      request so the owner timeline needs no per-chain round trips. No persistence, no conclusions computed here, and
 *      no client-supplied candidate identifiers: the business is scoped to the verified workspace by the service.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { listOwnerOutcomeChains } from "@/services/owner-outcome/owner-outcome-chain.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listOwnerOutcomeChains(ctx.verifiedWorkspaceId, params.businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
