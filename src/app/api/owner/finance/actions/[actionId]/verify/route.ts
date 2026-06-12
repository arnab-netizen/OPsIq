/**
 * POST /api/owner/finance/actions/[actionId]/verify — record a before/after
 *      finance verification (OWNER_MANAGE).
 *      body: { beforeValue, afterValue, targetDirection, targetValue?, evidence?, disputed? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { financeVerifySchema } from "@/domain/owner-finance/validation";
import { recordFinanceVerification } from "@/services/owner-finance/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, financeVerifySchema);
    const result = await recordFinanceVerification(
      params.actionId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
