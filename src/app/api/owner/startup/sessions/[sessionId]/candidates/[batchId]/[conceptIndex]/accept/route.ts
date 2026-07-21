/**
 * POST /api/owner/startup/sessions/[sessionId]/candidates/[batchId]/[conceptIndex]/accept
 * Accept a generated idea candidate — creates a governed StartupIdeaRecord.
 * Idempotent: re-accepting the same concept returns the existing candidate record.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordCandidateDecision } from "@/services/owner-strategy/startup-session.service";
import { BadRequestError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const conceptIndex = parseInt(params.conceptIndex, 10);
    if (isNaN(conceptIndex) || conceptIndex < 0) {
      throw new BadRequestError("Invalid conceptIndex — must be a non-negative integer");
    }

    const result = await recordCandidateDecision(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.batchId,
      conceptIndex,
      ctx.verifiedActorId,
      { decision: "ACCEPTED" }
    );

    return canonicalJson(
      { candidateId: result.candidateId, ideaId: result.ideaId, decision: "ACCEPTED" },
      { status: 201 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
