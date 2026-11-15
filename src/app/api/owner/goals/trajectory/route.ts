/**
 * GET /api/owner/goals/trajectory?businessId=<id> — trajectory for that business's ACTIVE goal
 * (only that business's data). Without businessId: the legacy workspace goal's trajectory, which is
 * not projected when results span more than one business. Returns { result: null } when no goal
 * exists. OWNER_VIEW required.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseOrThrow } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getGoalsOverview } from "@/services/owner-strategy/goal.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const scopeQuerySchema = z.object({ businessId: z.string().uuid().nullable() });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId } = parseOrThrow(scopeQuerySchema, {
      businessId: new URL(ctx.request!.url).searchParams.get("businessId"),
    });
    const overview = await getGoalsOverview(ctx.verifiedWorkspaceId, businessId);
    return canonicalJson({ result: businessId ? overview.goal : overview.legacyGoal }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
