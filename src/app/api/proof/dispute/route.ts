import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { requirePermission } from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { ProofDisputeCategory } from "@/domain/execution/proof-dispute";
import { disputeAcceptedProof } from "@/services/execution/proof-dispute.service";

export const runtime = "nodejs";

/**
 * POST /api/proof/dispute — an owner or authorized reviewer disputes previously-accepted proof.
 *
 * Server-authoritative: workspace + actor come from the verified session; a category + reason are
 * required; the standard dispute (→DISPUTED) requires the PROOF_REVIEW permission, while an
 * owner-only override (→OVERRIDDEN_NOT_VERIFIED) requires the non-delegable VERIFY_FINAL_OUTCOME
 * permission. The service enforces SoD, ACCEPTED-only, idempotency, atomic audit, and reassessment.
 */
const disputeSchema = z.object({
  proofId: z.string().trim().min(1),
  category: z.nativeEnum(ProofDisputeCategory),
  reason: z.string().trim().min(3),
  override: z.boolean().optional(),
  businessId: z.string().trim().min(1).nullable().optional(),
});

function statusForReason(reason: string): number {
  if (/not found/i.test(reason)) return 404;
  if (/separation of duty|only the owner/i.test(reason)) return 403;
  return 400;
}

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const input = await parseRequestBody(ctx.request!, disputeSchema);
  const actorId = ctx.verifiedActorId;
  const workspaceId = ctx.verifiedWorkspaceId;

  // Authorize server-side: an owner-only override needs VERIFY_FINAL_OUTCOME (non-delegable);
  // a standard dispute needs a proof-review grant. requirePermission also enforces active membership.
  const override = input.override === true;
  if (override) {
    await requirePermission(workspaceId, actorId, GuidedExecutionPermission.VERIFY_FINAL_OUTCOME);
  } else {
    await requirePermission(workspaceId, actorId, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK);
  }
  const actorRole = override ? TaskActorRole.OWNER : TaskActorRole.MANAGER;

  const result = await disputeAcceptedProof({
    workspaceId, proofId: input.proofId, actorId, actorRole,
    category: input.category, reason: input.reason, override, businessId: input.businessId ?? null,
  });

  if (!result.ok) {
    return canonicalJson({ error: result.reason }, { status: statusForReason(result.reason) });
  }
  return canonicalJson(
    { status: result.status, deduped: result.deduped, reassessmentEventId: result.reassessmentEventId, disputeRecord: result.disputeRecord },
    { status: 200 }
  );
});
