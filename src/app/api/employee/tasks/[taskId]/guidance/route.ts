import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { employeeTaskGuidanceHandler } from "@/services/routes/guided-execution-handlers";
import { sealBoundary } from "@/domain/execution/boundary";

/**
 * POST /api/employee/tasks/[taskId]/guidance — the single employee-facing
 * AI-guidance call site. Thin wrapper: active membership + task access, then the
 * proven `generateEmployeeGuidance` path, which gates the instruction through the
 * owner-approved boundary (`gateEmployeeGuidance`), structurally contains all
 * untrusted text, writes a durable AI-ledger record, and returns guidance ONLY on
 * BOUNDARY_VALIDATION_PASSED. The unsafe instruction is never echoed back.
 *
 * The boundary is owner-approved and supplied per request (no in-memory tamper):
 * it is sealed server-side so its contentHash is authoritative, and the
 * instruction's version-pinning fields are overwritten from the sealed boundary —
 * a client cannot forge a hash/version to slip past the gate.
 */
export const POST = withCanonicalEnforcement(
  async (ctx, params: Record<string, string>) => {
    const actorId = ctx.verifiedSessionSnapshot.actorId;
    const workspaceId = ctx.verifiedWorkspaceId;
    const taskId = params.taskId;

    // Real task lookup for the access subject (workspace-scoped). Fail closed if absent.
    const task = await db.delegatedTask.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true, workspaceId: true, assignedUserId: true },
    });
    if (!task) {
      return { kind: "BLOCKED", message: "Task not found.", allowed: false, guidance: null, ledgerId: "" };
    }

    const body = ctx.request ? await ctx.request.json() : {};

    // Owner-approved boundary sealed server-side → authoritative contentHash/version.
    const boundary = body.boundary ? sealBoundary(body.boundary) : null;
    const instruction = {
      ...(body.instruction ?? {}),
      ...(boundary
        ? {
            boundaryId: boundary.boundaryId,
            boundaryVersion: boundary.boundaryVersion,
            boundaryContentHash: boundary.contentHash,
          }
        : {}),
    };

    return employeeTaskGuidanceHandler({
      workspaceId,
      actorId,
      task: { workspaceId: task.workspaceId, assignedUserId: task.assignedUserId, taskId: task.id },
      boundary,
      instruction,
      untrusted: body.untrusted,
    });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ACTION_VIEW] }
);
