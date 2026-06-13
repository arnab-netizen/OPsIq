/**
 * POST /api/owner/operations/actions/[actionId]/verify — record a before/after
 *      operations verification (OWNER_MANAGE).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { operationsVerifySchema } from "@/domain/owner-operations/validation";
import { recordOperationsVerification } from "@/services/owner-operations/verification.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.actionId);
    const input = await parseRequestBody(ctx.request!, operationsVerifySchema);
    const result = await recordOperationsVerification(params.actionId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
