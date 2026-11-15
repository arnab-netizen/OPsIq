/**
 * POST /api/owner/first-run/skip-question — "I don't have this": the owner skipped one progressive question (an input
 * category). Persisted once per (business, category), so the question is not asked again and counts toward the limit.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { skipQuestion } from "@/services/owner-first-run/first-run.service";

const bodySchema = z.strictObject({ businessId: uuidSchema, category: z.string().trim().min(1).max(60) });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const result = await skipQuestion(ctx.verifiedWorkspaceId, ctx.verifiedActorId, body.businessId, body.category);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
