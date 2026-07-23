/**
 * PATCH /api/owner/tasks/[taskId]/status — drive a task to a new status (OWNER_MANAGE).
 *
 * Workspace-scoped; actor role derived server-side (always OWNER for this route);
 * no transition logic here — delegated to transitionTaskStatus (task-workflow service).
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { DelegatedTaskStatus } from "@/domain/execution/delegated-task";
import {
  transitionTaskStatus,
  TaskWorkflowNotFoundError,
  TaskTransitionNotAllowedError,
  TaskTransitionConflictError,
} from "@/services/execution/task-workflow.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const statusSchema = z.object({
  to: z.nativeEnum(DelegatedTaskStatus),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const input = await parseRequestBody(ctx.request!, statusSchema);
    try {
      const status = await transitionTaskStatus({
        taskId: params.taskId,
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        to: input.to,
      });
      return canonicalJson({ status }, { status: 200 });
    } catch (err) {
      if (err instanceof TaskWorkflowNotFoundError) {
        return canonicalJson({ error: "Task not found." }, { status: 404 });
      }
      if (err instanceof TaskTransitionNotAllowedError) {
        return canonicalJson({ error: err.message }, { status: 422 });
      }
      if (err instanceof TaskTransitionConflictError) {
        return canonicalJson({ error: "Concurrent update; retry." }, { status: 409 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
