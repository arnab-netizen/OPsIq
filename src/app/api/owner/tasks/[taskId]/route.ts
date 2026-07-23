/**
 * GET /api/owner/tasks/[taskId] — task detail with proof + status history (OWNER_VIEW).
 *
 * Workspace-scoped; no client-supplied IDs trusted.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getTaskDetail } from "@/services/execution/task-query.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const task = await getTaskDetail(params.taskId, ctx.verifiedWorkspaceId);
    if (!task) {
      return canonicalJson({ error: "Task not found." }, { status: 404 });
    }
    return canonicalJson({ task }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
