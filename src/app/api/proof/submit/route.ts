import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { db } from "@/lib/db";
import { proofSubmitHandler } from "@/services/routes/guided-execution-handlers";

/**
 * POST /api/proof/submit — employee submits proof for a delegated task.
 * Thin wrapper: active membership + access to the linked task, then the proven
 * `submitProof` FSM (validates submission, duplicate-hash guard, tx-atomic audit).
 * The task subject is loaded server-side and workspace-scoped; the actor cannot
 * submit against another workspace's or another employee's task.
 */
export const POST = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const body = ctx.request ? await ctx.request.json() : {};

  const taskId = body.command?.taskId ?? body.taskId;
  const task = await db.delegatedTask.findFirst({
    where: { id: taskId, workspaceId },
    select: { workspaceId: true, assignedUserId: true },
  });
  if (!task) {
    return { ok: false, reason: "Task not found." };
  }

  return proofSubmitHandler({
    workspaceId,
    actorId,
    task: { workspaceId: task.workspaceId, assignedUserId: task.assignedUserId },
    command: { ...body.command, taskId, workspaceId },
  });
});
