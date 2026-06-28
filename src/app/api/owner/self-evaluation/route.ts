/**
 * Jarvis 360 Slice 13 — self-evaluation surface.
 * POST /api/owner/self-evaluation — record whether a recommendation/action worked;
 *      failed outcomes schedule a reassessment. OWNER_MANAGE, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordSelfEvaluation } from "@/services/owner-mode/self-evaluation.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  recommendationId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  /** Owner domain (finance/marketing/...) — a failed outcome writes a scope:<domain>
   *  do-not-repeat memory so the owner-action gate blocks repeating it (M1). */
  domain: z.string().trim().min(1).optional(),
  expectedOutcome: z.string().trim().min(1),
  actualOutcome: z.string().optional(),
  ownerWorkloadImpact: z.string().optional(),
  reassessmentDays: z.number().int().positive().optional(),
  signals: z.object({
    executed: z.boolean(),
    metExpectation: z.boolean(),
    weakData: z.boolean().optional(),
    ownerOverrode: z.boolean().optional(),
    externalEvent: z.boolean().optional(),
    insufficientProof: z.boolean().optional(),
    poorExecution: z.boolean().optional(),
  }),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const result = await recordSelfEvaluation({ workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId, ...input });
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
