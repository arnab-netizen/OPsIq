/**
 * POST /api/owner/tasks/[taskId]/proof/review — review (accept/reject/dispute/resubmit) proof (OWNER_MANAGE).
 *
 * Workspace-scoped; reviewer identity derived server-side.
 * SoD (submitter ≠ reviewer) enforced in reviewProofForTask / proof.service.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { ProofStatus } from "@/domain/execution/proof";
import {
  reviewProofForTask,
  TaskWorkflowNotFoundError,
  ProofNotFoundError,
  ProofTransitionNotAllowedError,
  ProofSelfReviewError,
  ProofDuplicateRejectedError,
  ProofConflictError,
} from "@/services/execution/task-workflow.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_TARGETS = new Set([
  ProofStatus.ACCEPTED,
  ProofStatus.REJECTED,
  ProofStatus.DISPUTED,
  ProofStatus.RESUBMISSION_REQUIRED,
  ProofStatus.NEEDS_HUMAN_REVIEW,
]);

const reviewSchema = z.object({
  to: z.nativeEnum(ProofStatus).refine((v) => REVIEW_TARGETS.has(v), {
    message: "to must be one of ACCEPTED, REJECTED, DISPUTED, RESUBMISSION_REQUIRED, NEEDS_HUMAN_REVIEW",
  }),
  reason: z.string().trim().min(1).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // Route-defense: `taskId` is a UUID-backed column — see [taskId]/route.ts's identical guard.
    parseOrThrow(uuidSchema, params.taskId);
    const input = await parseRequestBody(ctx.request!, reviewSchema);
    try {
      const status = await reviewProofForTask({
        taskId: params.taskId,
        workspaceId: ctx.verifiedWorkspaceId,
        reviewerId: ctx.verifiedActorId,
        to: input.to,
        reason: input.reason,
      });
      return canonicalJson({ status }, { status: 200 });
    } catch (err) {
      if (err instanceof TaskWorkflowNotFoundError || err instanceof ProofNotFoundError) {
        return canonicalJson({ error: "Task or proof not found." }, { status: 404 });
      }
      if (err instanceof ProofSelfReviewError) {
        return canonicalJson({ error: "Proof reviewer must differ from submitter.", code: err.code }, { status: 403 });
      }
      if (err instanceof ProofDuplicateRejectedError) {
        return canonicalJson({ error: "Cannot accept a duplicate-flagged proof.", code: err.code }, { status: 422 });
      }
      if (err instanceof ProofTransitionNotAllowedError) {
        return canonicalJson({ error: "Proof review not allowed in current state." }, { status: 422 });
      }
      if (err instanceof ProofConflictError) {
        return canonicalJson({ error: "Concurrent review; retry." }, { status: 409 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
