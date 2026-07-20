/**
 * POST /api/owner/startup/sessions/[sessionId]/arbitrate — run idea arbitration.
 * GET  — retrieve latest arbitration result from operating memory.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runIdeaArbitration } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const arbitrateSchema = z.object({
  capitalAvailableCents: z.number().int().nullable(),
  ownerHoursPerWeek: z.number().nullable(),
  riskTolerance: z.enum(["low", "medium", "high"]).nullable(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, arbitrateSchema);
    const profile = {
      capitalAvailableCents: body.capitalAvailableCents !== null ? BigInt(body.capitalAvailableCents) : null,
      ownerHoursPerWeek: body.ownerHoursPerWeek,
      riskTolerance: body.riskTolerance,
    };
    const result = await runIdeaArbitration(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId, profile);
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const entry = await db.operatingMemoryEntry.findFirst({
      where: {
        workspaceId: ctx.verifiedWorkspaceId,
        memoryType: "STARTUP_ARBITRATION_RESULT",
        entityId: params.sessionId,
      },
      orderBy: { createdAt: "desc" },
    });
    return canonicalJson({ arbitrationResult: entry?.content ?? null }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
