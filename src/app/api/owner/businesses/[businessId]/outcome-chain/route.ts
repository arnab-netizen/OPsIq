/**
 * GET  /api/owner/businesses/[businessId]/outcome-chain?candidateId=… | ?processTaskKey=… — decision + assessment history (OWNER_VIEW)
 * POST /api/owner/businesses/[businessId]/outcome-chain — assess the chain from its persisted sources and append a snapshot (OWNER_MANAGE)
 *      body: { candidateId } | { processTaskKey }   — references only. Conclusions (measurement, target attainment,
 *      resolution, attribution, learning eligibility) are derived by the server and can never be submitted.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { parseRequestBody, parseOrThrow, parseSearchParams, uuidSchema } from "@/lib/validation";
import { assessPersistedOwnerOutcome, getOwnerOutcomeChain, type OutcomeChainRef } from "@/services/owner-outcome/owner-outcome-chain.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const refSchema = z.object({
  candidateId: z.string().min(1).max(200).optional(),
  processTaskKey: z.string().min(1).max(300).optional(),
});

function toRef(v: z.infer<typeof refSchema>): OutcomeChainRef {
  if ((v.candidateId === undefined) === (v.processTaskKey === undefined)) {
    throw new ValidationError("Provide exactly one of candidateId or processTaskKey.", {
      fieldErrors: [{ path: "candidateId", message: "Provide exactly one of candidateId or processTaskKey" }],
    });
  }
  return v.candidateId !== undefined ? { candidateId: v.candidateId } : { processTaskKey: v.processTaskKey as string };
}

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const ref = toRef(parseSearchParams(ctx.request!.url, refSchema));
    return getOwnerOutcomeChain(ctx.verifiedWorkspaceId, params.businessId, ref);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const ref = toRef(await parseRequestBody(ctx.request!, refSchema));
    const result = await assessPersistedOwnerOutcome(ctx.verifiedWorkspaceId, ctx.verifiedActorId, params.businessId, ref);
    return canonicalJson(result, { status: result.created ? 201 : 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
