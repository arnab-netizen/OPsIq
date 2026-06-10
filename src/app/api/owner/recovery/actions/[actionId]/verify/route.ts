/**
 * POST /api/owner/recovery/actions/[actionId]/verify — record before/after verification (OWNER_MANAGE)
 *      body: { afterValue (number|null), evidence?, disputed? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { recordVerification } from "@/services/founder-recovery/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const verifySchema = z.object({
  afterValue: z.number().nullable(),
  evidence: z.string().max(2000).optional(),
  disputed: z.boolean().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, verifySchema);
    const result = await recordVerification(
      params.actionId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
