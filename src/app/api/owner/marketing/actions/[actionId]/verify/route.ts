/**
 * POST /api/owner/marketing/actions/[actionId]/verify — record a before/after
 *      marketing verification (OWNER_MANAGE).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { marketingVerifySchema } from "@/domain/owner-marketing/validation";
import { recordMarketingVerification } from "@/services/owner-marketing/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, marketingVerifySchema);
    const result = await recordMarketingVerification(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
