/**
 * GET /api/owner/first-run/result?businessId= — "Your first Money read" (OWNER_VIEW): the canonical finance
 * diagnosis reshaped into the eleven first-value answers, with evidence quality and confidence.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getFirstMoneyRead } from "@/services/owner-first-run/first-run.service";

const querySchema = z.object({ businessId: uuidSchema });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const q = parseSearchParams(ctx.request!.url, querySchema);
    return getFirstMoneyRead(ctx.verifiedWorkspaceId, q.businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
