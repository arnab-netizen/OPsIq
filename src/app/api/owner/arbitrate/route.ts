/**
 * Jarvis 360 Slice 10 — decision arbitration surface.
 * POST /api/owner/arbitrate — resolve conflicting candidate recommendations into one
 *      recommended decision + rejected/blocked/deferred alternatives with reasons.
 * OWNER_VIEW, workspace-scoped. Pure arbitration; complements the best-path selector.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { arbitrate } from "@/domain/owner-mode/decision-arbitration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string(),
        blockedBy: z.array(z.enum(["legal_security", "proof", "cash", "margin", "data", "capacity", "quality_reputation"])).default([]),
        riskOfAction: z.number().min(0).max(1).default(0.2),
        riskOfInaction: z.number().min(0).max(1).default(0.2),
        confidence: z.number().min(0).max(1).default(0.7),
        ownerGoalAligned: z.boolean().default(false),
        reversible: z.boolean().default(true),
      })
    )
    .min(1),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { candidates } = await parseRequestBody(ctx.request!, schema);
    return canonicalJson(arbitrate(candidates), { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
