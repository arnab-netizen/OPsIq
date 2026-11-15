/**
 * GET /api/owner/first-run/next-move?businessId= — the action the owner accepted, its timing, whether the evidence
 * changed since, and when to check the result (OWNER_VIEW). Null when nothing has been accepted.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams, uuidSchema } from "@/lib/validation";
import { getAcceptedNextMove } from "@/services/owner-first-run/next-move.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ businessId: uuidSchema });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const q = parseSearchParams(ctx.request!.url, querySchema);
    return { nextMove: await getAcceptedNextMove(ctx.verifiedWorkspaceId, q.businessId) };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
