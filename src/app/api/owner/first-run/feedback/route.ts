/** POST /api/owner/first-run/feedback — lightweight first-value feedback (Useful / Partly / Not useful + reason). */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { FEEDBACK_RATINGS, FEEDBACK_REASONS, submitFirstValueFeedback } from "@/services/owner-first-run/first-run.service";

const bodySchema = z.strictObject({
  businessId: uuidSchema,
  rating: z.enum(FEEDBACK_RATINGS),
  reason: z.enum(FEEDBACK_REASONS).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const { businessId, ...rest } = body;
    const result = await submitFirstValueFeedback(ctx.verifiedWorkspaceId, ctx.verifiedActorId, businessId, rest);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
