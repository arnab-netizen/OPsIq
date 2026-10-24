/**
 * POST /api/owner/businesses/[businessId]/outcome-chain/process-task-link — explicitly link a persisted process task
 *      to an ACCEPTED/MODIFIED compliance commitment (OWNER_MANAGE). Both references are validated by the server inside
 *      the caller's workspace + business; nothing is matched by text, metric name or time.
 *      body: { candidateId, processTaskKey }
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { linkProcessTaskToDecision } from "@/services/owner-outcome/owner-outcome-chain.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const linkSchema = z.object({ candidateId: z.string().min(1).max(200), processTaskKey: z.string().min(1).max(300) });

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, linkSchema);
    const result = await linkProcessTaskToDecision(ctx.verifiedWorkspaceId, ctx.verifiedActorId, params.businessId, body);
    return canonicalJson(result, { status: result.created ? 201 : 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
