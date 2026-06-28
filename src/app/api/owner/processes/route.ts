/**
 * Jarvis 360 Slice 8 — process inventory + review surface.
 * POST /api/owner/processes — register a process (owner role + SOP + metric + cadence).
 * PATCH /api/owner/processes — trigger a review-if-due with failure signals.
 * OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { registerProcess, triggerProcessReviewIfDue } from "@/services/owner-mode/process-review.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  processType: z.string().trim().min(1),
  ownerRole: z.string().trim().min(1),
  sopId: z.string().uuid().optional(),
  metric: z.string().trim().min(1),
  target: z.string().optional(),
  reviewFrequencyDays: z.number().int().positive().optional(),
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  signals: z
    .object({
      repeatedFailure: z.boolean().optional(),
      complaintSpike: z.boolean().optional(),
      qualityDecline: z.boolean().optional(),
      missedChecklist: z.boolean().optional(),
      trainingFailure: z.boolean().optional(),
      equipmentIssue: z.boolean().optional(),
      goalChanged: z.boolean().optional(),
    })
    .default({}),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, registerSchema);
    const id = await registerProcess({ workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId, ...input });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, reviewSchema);
    const decision = await triggerProcessReviewIfDue(input.id, {
      workspaceId: ctx.verifiedWorkspaceId,
      signals: input.signals,
      actorId: ctx.verifiedActorId,
    });
    return canonicalJson(decision, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
