/**
 * POST /api/owner/strategy/actions/[actionId]/verify — record a before/after
 *      strategy verification (OWNER_MANAGE).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { strategyVerifySchema } from "@/domain/owner-strategy/validation";
import { recordStrategyVerification } from "@/services/owner-strategy/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, strategyVerifySchema);
    const result = await recordStrategyVerification(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
