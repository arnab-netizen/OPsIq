/**
 * Delegated-task list + assignment route (Bundle 3.3).
 * GET  /api/owner/tasks — list workspace tasks with optional filters (OWNER_VIEW).
 * POST /api/owner/tasks — create/assign a delegated task, optionally requiring proof (OWNER_MANAGE).
 *
 * No transition or gate logic here; use the task-workflow service or the proven FSM services.
 * Workspace-scoped; validated; audited in the service.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { ProofType, ProofRiskLevel } from "@/domain/execution/proof";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { getTaskList } from "@/services/execution/task-query.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const status = url.searchParams.get("status") ?? undefined;
    const assignedUserId = url.searchParams.get("assignedUserId") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    const tasks = await getTaskList(ctx.verifiedWorkspaceId, { status, assignedUserId, limit, offset });
    return canonicalJson({ tasks, count: tasks.length }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const proofRequirementSchema = z.object({
  proofType: z.nativeEnum(ProofType),
  requiredFields: z.array(z.string().trim().min(1)).optional(),
  riskLevel: z.nativeEnum(ProofRiskLevel).optional(),
  reviewerRole: z.string().trim().min(1).optional(),
  ownerOverrideAllowed: z.boolean().optional(),
});

const assignSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  assignedUserId: z.string().uuid().optional(),
  assignedRole: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime().optional(),
  requireProof: proofRequirementSchema.optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, assignSchema);
    const assigned = await assignDelegatedTask({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      title: input.title,
      description: input.description ?? null,
      assignedUserId: input.assignedUserId ?? null,
      assignedRole: input.assignedRole ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      requireProof: input.requireProof ?? null,
    });
    return canonicalJson(assigned, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
