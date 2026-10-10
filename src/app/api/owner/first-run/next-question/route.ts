/**
 * GET /api/owner/first-run/next-question?businessId= — the ONE next question, chosen deterministically from actual
 * missing evidence (progressive OBQ), or the reason to stop. Progress (answered/skipped) is read from the persisted
 * interactions: the client supplies nothing but the business, so it cannot reset or spoof the question limit.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getNextQuestionView } from "@/services/owner-first-run/first-run.service";

const querySchema = z.object({ businessId: uuidSchema });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const q = parseSearchParams(ctx.request!.url, querySchema);
    return getNextQuestionView(ctx.verifiedWorkspaceId, q.businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
