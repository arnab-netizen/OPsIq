/**
 * POST /api/owner/tasks/[taskId]/proof/submit — submit proof for a task (OWNER_MANAGE).
 *
 * Workspace-scoped; actor identity derived server-side.
 * Validation and duplicate detection delegated to submitProofForTask.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { ProofType } from "@/domain/execution/proof";
import {
  submitProofForTask,
  TaskWorkflowNotFoundError,
  ProofRequirementNotFoundError,
  ProofNotFoundError,
  ProofValidationError,
  ProofTransitionNotAllowedError,
  ProofConflictError,
} from "@/services/execution/task-workflow.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const submitSchema = z.object({
  proofType: z.nativeEnum(ProofType),
  fields: z.record(z.string(), z.unknown()),
  fileHash: z.string().min(1).optional().nullable(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // Route-defense: `taskId` is a UUID-backed column — see [taskId]/route.ts's identical guard.
    parseOrThrow(uuidSchema, params.taskId);
    const input = await parseRequestBody(ctx.request!, submitSchema);
    try {
      const result = await submitProofForTask({
        taskId: params.taskId,
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        proofType: input.proofType,
        fields: input.fields,
        fileHash: input.fileHash ?? null,
      });
      return canonicalJson(result, { status: 200 });
    } catch (err) {
      if (err instanceof TaskWorkflowNotFoundError) {
        return canonicalJson({ error: "Task not found." }, { status: 404 });
      }
      if (err instanceof ProofRequirementNotFoundError || err instanceof ProofNotFoundError) {
        return canonicalJson({ error: "Proof requirement or proof not found." }, { status: 404 });
      }
      if (err instanceof ProofValidationError) {
        return canonicalJson({ error: "Proof submission is invalid.", issues: err.issues }, { status: 422 });
      }
      if (err instanceof ProofTransitionNotAllowedError) {
        return canonicalJson({ error: "Proof submission not allowed in current state." }, { status: 422 });
      }
      if (err instanceof ProofConflictError) {
        return canonicalJson({ error: "Concurrent submission; retry." }, { status: 409 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
