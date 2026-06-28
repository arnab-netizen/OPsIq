/**
 * Jarvis 360 Slice 6 — staff training surface.
 * POST /api/owner/staff-training — record an observed-gap training recommendation
 *      (rejected server-side if no evidence). OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { OBSERVED_GAP_CODES } from "@/domain/owner-mode/staff-training";
import { recordObservedTrainingNeed } from "@/services/owner-mode/staff-training.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  staffRef: z.string().trim().min(1),
  processAffected: z.string().trim().min(1),
  metric: z.string().trim().min(1),
  expectedImprovement: z.string().trim().min(1),
  recheckDate: z.string().datetime().optional(),
  evidence: z
    .array(z.object({ code: z.enum(OBSERVED_GAP_CODES), occurrences: z.number().int().min(0), evidenceRef: z.string().optional() }))
    .default([]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const id = await recordObservedTrainingNeed({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      staffRef: input.staffRef,
      evidence: input.evidence,
      processAffected: input.processAffected,
      metric: input.metric,
      expectedImprovement: input.expectedImprovement,
      recheckDate: input.recheckDate ? new Date(input.recheckDate) : undefined,
    });
    return canonicalJson({ id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
