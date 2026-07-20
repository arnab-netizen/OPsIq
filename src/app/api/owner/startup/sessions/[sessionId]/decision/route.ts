/**
 * POST /api/owner/startup/sessions/[sessionId]/decision — record owner decision.
 * GET  — show system recommendation + owner decision.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const decisionSchema = z.object({
  ideaId: z.string().optional(),
  decisionType: z.enum(["GO", "MODIFY", "HOLD", "REJECT", "REQUEST_MORE_EVIDENCE"]),
  rationale: z.string().max(5000).optional(),
  approvedScope: z.string().max(1000).optional(),
  spendingLimitCents: z.number().int().positive().optional(),
  permittedActions: z.array(z.string()).optional(),
  prohibitedActions: z.array(z.string()).optional(),
  validUntil: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional(),
  materialAssumptions: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, decisionSchema);
    const input = {
      ideaId: body.ideaId ?? null,
      decisionType: body.decisionType,
      rationale: body.rationale ?? null,
      approvedScope: body.approvedScope ?? null,
      spendingLimitCents: body.spendingLimitCents ?? null,
      permittedActions: body.permittedActions,
      prohibitedActions: body.prohibitedActions,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      reviewDate: body.reviewDate ? new Date(body.reviewDate) : null,
      materialAssumptions: body.materialAssumptions,
    };
    const decisionId = await recordOwnerDecision(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId, input);
    return canonicalJson({ decisionId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const [decisions, systemRec] = await Promise.all([
      db.startupOwnerDecision.findMany({
        where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
        orderBy: { createdAt: "desc" },
      }),
      db.operatingMemoryEntry.findFirst({
        where: {
          workspaceId: ctx.verifiedWorkspaceId,
          memoryType: "STARTUP_ARBITRATION_RESULT",
          entityId: params.sessionId,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return canonicalJson({
      systemRecommendation: systemRec?.content ?? null,
      ownerDecisions: decisions,
      latestDecision: decisions[0] ?? null,
    }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
