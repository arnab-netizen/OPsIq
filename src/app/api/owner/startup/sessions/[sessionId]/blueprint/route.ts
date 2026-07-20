/**
 * POST /api/owner/startup/sessions/[sessionId]/blueprint — create execution blueprint (idempotent).
 * GET  — retrieve blueprint.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const blueprintSchema = z.object({
  approvedIdeaId: z.string().min(1),
  ownerDecisionId: z.string().min(1),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, blueprintSchema);
    const result = await createBlueprint(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      body.approvedIdeaId,
      body.ownerDecisionId,
      ctx.verifiedActorId
    );
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const objective = await db.businessObjective.findFirst({
      where: { linkedStartupSessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      include: { processExecutionTasks: true },
    });
    return canonicalJson({ blueprint: objective ?? null }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
