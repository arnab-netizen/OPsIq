/**
 * Jarvis 360 owner-flow closure (EH-17/EH-19) — live opportunity decision surface.
 *
 * POST /api/owner/opportunities/decide — decide an opportunity using the owner's REAL
 *   capacity + margin (derived server-side); returns accept/reject/defer + reasons +
 *   next action. OWNER_MANAGE, workspace-scoped, validated.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { decideOpportunity } from "@/services/owner-mode/opportunity-decision.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  businessId: z.string().uuid(),
  fitScore: z.number().min(0).max(1),
  paymentRisk: z.enum(["low", "medium", "high"]),
  marginPct: z.number().min(0).max(1).nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const decision = await decideOpportunity({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId: input.businessId,
      fitScore: input.fitScore,
      paymentRisk: input.paymentRisk,
      marginPct: input.marginPct ?? null,
      actorId: ctx.verifiedActorId,
    });
    return canonicalJson(decision, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
