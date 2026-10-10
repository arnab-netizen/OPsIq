/**
 * GET /api/owner/first-run/next-question?businessId=&skipped=a,b&answered=n — the ONE next question,
 * chosen deterministically from actual missing evidence (progressive OBQ), or the reason to stop.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getNextQuestionView } from "@/services/owner-first-run/first-run.service";

const querySchema = z.object({
  businessId: uuidSchema,
  skipped: z.string().max(600).optional(),
  answered: z.coerce.number().int().min(0).max(10).optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const q = parseSearchParams(ctx.request!.url, querySchema);
    const skipped = (q.skipped ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
    return getNextQuestionView(ctx.verifiedWorkspaceId, q.businessId, { skipped, answeredCount: q.answered ?? 0 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
