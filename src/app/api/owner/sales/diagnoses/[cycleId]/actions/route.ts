/**
 * GET /api/owner/sales/diagnoses/[cycleId]/actions — sales actions for a
 *     diagnosis cycle, ranked by priority (OWNER_VIEW)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { listSalesCycleActions } from "@/services/owner-sales/diagnosis.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.cycleId);
    return listSalesCycleActions(params.cycleId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
