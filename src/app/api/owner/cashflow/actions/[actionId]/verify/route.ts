/**
 * POST /api/owner/cashflow/actions/[actionId]/verify — record a before/after
 *      cashflow verification (OWNER_MANAGE).
 *      body: { beforeValue, afterValue, targetDirection, targetValue?, evidence?, disputed? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { cashflowVerifySchema } from "@/domain/owner-cashflow/validation";
import { recordCashflowVerification } from "@/services/owner-cashflow/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, cashflowVerifySchema);
    const result = await recordCashflowVerification(
      params.actionId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
