/**
 * POST /api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/reject
 * Reject a generated idea candidate with mandatory rationale.
 * Writes operating memory to prevent rediscovery without new evidence.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordCandidateDecision } from "@/services/owner-strategy/startup-session.service";
import { BadRequestError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  rejectionRationale: z.string().min(1).max(2000),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const conceptIndex = parseInt(params.conceptIndex, 10);
    if (isNaN(conceptIndex) || conceptIndex < 0) {
      throw new BadRequestError("Invalid conceptIndex — must be a non-negative integer");
    }

    const body = await parseRequestBody(ctx.request!, postSchema);

    const result = await recordCandidateDecision(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.batchId,
      conceptIndex,
      ctx.verifiedActorId,
      { decision: "REJECTED", rejectionRationale: body.rejectionRationale }
    );

    return canonicalJson(
      { candidateId: result.candidateId, decision: "REJECTED" },
      { status: 200 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
