import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { requirePermission } from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { acknowledgeEscalation } from "@/services/execution/escalation.service";

export const runtime = "nodejs";

/**
 * POST /api/escalation/acknowledge — a manager/owner acknowledges an assigned escalation.
 *
 * Server-authoritative: workspace + actor from the verified session; a review-level permission is
 * required (owners auto-pass); the service sets acknowledgedAt + acknowledgedBy and moves OPEN →
 * ACKNOWLEDGED with an atomic audit, workspace-scoped and concurrency-guarded. Idempotent — a repeat
 * acknowledgement is a no-op success. Fail-closed: a wrong-workspace / already-handled escalation
 * mutates nothing. This produces the trusted acknowledgement timing the MANAGER_IGNORES_ESCALATION
 * signal consumes; it is not HR discipline tooling and writes no accusation or score.
 */
const bodySchema = z.object({
  escalationId: z.string().trim().min(1),
});

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const input = await parseRequestBody(ctx.request!, bodySchema);
  const actorId = ctx.verifiedActorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  await requirePermission(workspaceId, actorId, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK);

  const r = await acknowledgeEscalation({ escalationId: input.escalationId, workspaceId, acknowledgedBy: actorId });
  return canonicalJson({ status: r.status, alreadyAcknowledged: r.alreadyAcknowledged }, { status: 200 });
});
