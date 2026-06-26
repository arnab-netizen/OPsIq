import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { db } from "@/lib/db";
import { employeeTaskListHandler } from "@/services/routes/guided-execution-handlers";

/**
 * GET /api/employee/tasks — the employee's own assigned tasks.
 * Thin wrapper: active membership + EMPLOYEE dashboard scope + owner-only-field
 * redaction. The query is workspace-scoped to the actor's own assignments.
 */
export const GET = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const tasks = await db.delegatedTask.findMany({
    where: { workspaceId, assignedUserId: actorId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      assignedRole: true,
    },
  });
  return employeeTaskListHandler({ workspaceId, actorId, tasks });
});
