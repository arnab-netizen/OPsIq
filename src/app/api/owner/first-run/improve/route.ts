/** POST /api/owner/first-run/improve — "Improve this recommendation": records the request (idempotent). */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requestImprovement } from "@/services/owner-first-run/first-run.service";

const bodySchema = z.strictObject({ businessId: uuidSchema, idempotencyKey: z.string().trim().min(8).max(100) });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const result = await requestImprovement(ctx.verifiedWorkspaceId, ctx.verifiedActorId, body.businessId, body.idempotencyKey);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
