/**
 * Delegated-task assignment route (P1-A runtime-readiness: closes blocker B5's inert proof loop).
 * POST /api/owner/tasks — create/assign a delegated task, optionally requiring proof (OWNER_MANAGE).
 *
 * This is the missing create path: without it no delegated task or proof requirement ever existed in production, so
 * the completion gate could never demand proof. No transition/gate logic here — assignment writes the rows and the
 * proven completeTask FSM enforces proof. Workspace-scoped; validated; audited in the service.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { ProofType, ProofRiskLevel } from "@/domain/execution/proof";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
