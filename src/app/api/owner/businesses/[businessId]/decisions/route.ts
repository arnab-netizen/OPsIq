/**
 * GET  /api/owner/businesses/[businessId]/decisions[?candidateId=] — the owner's decision history (OWNER_VIEW)
 * POST /api/owner/businesses/[businessId]/decisions — record the owner's decision on a canonical candidate (OWNER_MANAGE)
 *      body: { candidateId, state: ACCEPTED|REJECTED|DEFERRED|MODIFIED, ownerReason?, revisitAt?, idempotencyKey?, contract? }
 * The server resolves the candidate inside the caller's workspace + business and snapshots the recommendation itself.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, parseSearchParams, uuidSchema } from "@/lib/validation";
import { recordOwnerDecisionSchema } from "@/domain/owner-spine/owner-decision-record";
import { listOwnerDecisions, recordOwnerDecision } from "@/services/owner-outcome/owner-decision.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listQuerySchema = z.object({ candidateId: z.string().min(1).max(200).optional() });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const q = parseSearchParams(ctx.request!.url, listQuerySchema);
    return { decisions: await listOwnerDecisions(ctx.verifiedWorkspaceId, params.businessId, q) };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, recordOwnerDecisionSchema);
    const result = await recordOwnerDecision(ctx.verifiedWorkspaceId, ctx.verifiedActorId, params.businessId, body);
    // 201 for a newly recorded decision, 200 when the request was recognised as a retry of an existing one.
    return canonicalJson(result, { status: result.replayed ? 200 : 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
