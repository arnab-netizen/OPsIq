/**
 * POST /api/owner/businesses/[businessId]/outcome-contracts — amend the outcome contract of an ACCEPTED/MODIFIED
 *      decision (OWNER_MANAGE). Appends the next decision version; the earlier contract stays readable.
 *      body: { candidateId, contract, ownerReason?, idempotencyKey? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { recordOutcomeContractSchema } from "@/domain/owner-spine/owner-decision-record";
import { recordOwnerOutcomeContract } from "@/services/owner-outcome/owner-decision.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, recordOutcomeContractSchema);
    const result = await recordOwnerOutcomeContract(ctx.verifiedWorkspaceId, ctx.verifiedActorId, params.businessId, body);
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
