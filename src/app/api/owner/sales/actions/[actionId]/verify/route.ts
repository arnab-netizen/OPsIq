/**
 * POST /api/owner/sales/actions/[actionId]/verify — record a before/after sales
 *      verification (OWNER_MANAGE).
 *      body: { beforeValue, afterValue, targetDirection, targetValue?, evidence?, disputed? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { salesVerifySchema } from "@/domain/owner-sales/validation";
import { recordSalesVerification } from "@/services/owner-sales/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, salesVerifySchema);
    const result = await recordSalesVerification(
      params.actionId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
