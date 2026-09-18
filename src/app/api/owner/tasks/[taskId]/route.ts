/**
 * GET /api/owner/tasks/[taskId] — task detail with proof + status history (OWNER_VIEW).
 *
 * Workspace-scoped; no client-supplied IDs trusted.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { getTaskDetail } from "@/services/execution/task-query.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // Route-defense: `id` is a UUID-backed column (DelegatedTask.id). A malformed segment here —
    // "new" being the live-proven case, from the "+ New Task" CTA linking to /owner/tasks/new,
    // which the [taskId] dynamic route also matches — must fail closed with a governed 400, never
    // reach the database as a raw string and surface a Prisma "invalid input syntax for type uuid"
    // error to the client. parseOrThrow throws ValidationError, which
    // withCanonicalEnforcement's own error handling already classifies into a governed response.
    parseOrThrow(uuidSchema, params.taskId);
    const task = await getTaskDetail(params.taskId, ctx.verifiedWorkspaceId);
    if (!task) {
      return canonicalJson({ error: "Task not found." }, { status: 404 });
    }
    return canonicalJson({ task }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
