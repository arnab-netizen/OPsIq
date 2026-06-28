/**
 * Jarvis 360 gap-closure (G11,G12,G13,G14) — owner task completion surface.
 *
 * POST /api/owner/tasks/complete — drive a delegated task to APPROVED_COMPLETE.
 *   Completion is impossible unless the task's proof is accepted, non-duplicate and
 *   fresh (or proof is not required); the performer cannot self-approve. An audited
 *   owner override is available for emergencies.
 *
 * OWNER_MANAGE, workspace-scoped, validated. No transition logic here — all of it is
 * in the completeTask service + the proven delegated-task FSM.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import {
  completeTask,
  TaskCompletionBlockedError,
  TaskNotFoundError,
} from "@/services/execution/task-completion.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const completeSchema = z.object({
  taskId: z.string().trim().min(1),
  ownerOverride: z.boolean().optional(),
  maxProofAgeDays: z.number().int().positive().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, completeSchema);
    // OWNER_MANAGE guarantees an owner actor; SoD is still enforced by the FSM via actorId.
    const actor = {
      role: TaskActorRole.OWNER,
      isAssignee: false,
      canApproveCompletion: true,
      canReviewProof: true,
      canAssign: true,
    };
    try {
      const status = await completeTask({
        taskId: input.taskId,
        workspaceId: ctx.verifiedWorkspaceId,
        actor,
        actorId: ctx.verifiedActorId,
        ownerOverride: input.ownerOverride,
        maxProofAgeDays: input.maxProofAgeDays,
      });
      return canonicalJson({ status }, { status: 200 });
    } catch (err) {
      if (err instanceof TaskCompletionBlockedError) {
        return canonicalJson({ blocked: true, reason: err.reason }, { status: 409 });
      }
      if (err instanceof TaskNotFoundError) {
        return canonicalJson({ error: "Task not found." }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
