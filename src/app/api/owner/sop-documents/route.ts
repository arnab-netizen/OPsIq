/**
 * Jarvis 360 Slice 5 — SOP document lifecycle surface.
 *
 * POST /api/owner/sop-documents — create a draft SOP (workspace member).
 * PATCH /api/owner/sop-documents — approve | revise | retire (approve/retire are
 *       owner-only, enforced in the service). OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createSopDraft,
  approveSopDocument,
  reviseSopDocument,
  retireSopDocument,
} from "@/services/owner-mode/sop-document.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  process: z.string().trim().min(1),
  title: z.string().trim().min(1),
  role: z.string().trim().optional(),
  businessId: z.string().uuid().optional(),
  steps: z.array(z.string()).default([]),
  proofRequirements: z.array(z.string()).default([]),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "revise", "retire"]),
  effectiveDate: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional(),
  role: z.string().trim().optional(),
  steps: z.array(z.string()).optional(),
  proofRequirements: z.array(z.string()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);
    const id = await createSopDraft({ workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId, ...input });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);
    const ws = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    if (input.action === "approve") {
      await approveSopDocument(input.id, {
        workspaceId: ws,
        actorId,
        actorIsOwner: true,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
        reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      });
      return canonicalJson({ ok: true }, { status: 200 });
    }
    if (input.action === "retire") {
      await retireSopDocument(input.id, { workspaceId: ws, actorId, actorIsOwner: true });
      return canonicalJson({ ok: true }, { status: 200 });
    }
    const newId = await reviseSopDocument(input.id, {
      workspaceId: ws,
      actorId,
      role: input.role,
      steps: input.steps ?? [],
      proofRequirements: input.proofRequirements ?? [],
    });
    return canonicalJson({ revisedDraftId: newId }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
