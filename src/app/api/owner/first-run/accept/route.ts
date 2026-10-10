/**
 * POST /api/owner/first-run/accept — "Use this as my next move" (OWNER_MANAGE).
 * The recommended action is resolved SERVER-side from the latest diagnosis (the client never names a
 * candidate) and recorded through the canonical decision service with an outcome contract built only from
 * the action's own verification metric and timeframe. Refused while the evidence has changed since the read.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { acceptFirstResultAction } from "@/services/owner-first-run/first-run-actions.service";

const bodySchema = z.strictObject({ businessId: uuidSchema, idempotencyKey: z.string().trim().min(8).max(100) });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, bodySchema);
    const result = await acceptFirstResultAction(ctx.verifiedWorkspaceId, ctx.verifiedActorId, body.businessId, body.idempotencyKey);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
