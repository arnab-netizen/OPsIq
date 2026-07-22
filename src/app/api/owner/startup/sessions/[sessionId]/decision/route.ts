/**
 * POST /api/owner/startup/sessions/[sessionId]/decision — record immutable owner decision.
 * GET  /api/owner/startup/sessions/[sessionId]/decision — get current system rec + owner decision.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { currentSystemRecId: true, currentOwnerDecisionId: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    const [systemRec, ownerDecision] = await Promise.all([
      session.currentSystemRecId
        ? db.startupSystemRecommendation.findUnique({ where: { id: session.currentSystemRecId } })
        : null,
      session.currentOwnerDecisionId
        ? db.startupOwnerDecision.findUnique({ where: { id: session.currentOwnerDecisionId } })
        : null,
    ]);

    return canonicalJson({ systemRec, ownerDecision }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  ideaId: z.string().uuid().nullable().optional(),
  decisionType: z.enum(["GO", "MODIFY", "HOLD", "REJECT", "REQUEST_MORE_EVIDENCE"]),
  rationale: z.string().nullable().optional(),
  spendingLimitCents: z.number().nullable().optional(),
  permittedActions: z.array(z.string()).optional(),
  prohibitedActions: z.array(z.string()).optional(),
  validUntil: z.string().nullable().optional(),
  reviewDate: z.string().nullable().optional(),
  materialAssumptions: z.array(z.string()).optional(),
  linkedSystemRecId: z.string().uuid().nullable().optional(),
  linkedProfileVersionId: z.string().uuid().nullable().optional(),
  linkedEconomicModelId: z.string().uuid().nullable().optional(),
  linkedReadinessId: z.string().uuid().nullable().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const decisionId = await recordOwnerDecision(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      {
        ideaId: body.ideaId ?? null,
        decisionType: body.decisionType,
        rationale: body.rationale ?? null,
        spendingLimitCents: body.spendingLimitCents != null ? BigInt(Math.round(body.spendingLimitCents)) : null,
        permittedActions: body.permittedActions,
        prohibitedActions: body.prohibitedActions,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        reviewDate: body.reviewDate ? new Date(body.reviewDate) : null,
        materialAssumptions: body.materialAssumptions,
        linkedSystemRecId: body.linkedSystemRecId ?? null,
        linkedProfileVersionId: body.linkedProfileVersionId ?? null,
        linkedEconomicModelId: body.linkedEconomicModelId ?? null,
        linkedReadinessId: body.linkedReadinessId ?? null,
      }
    );
    return canonicalJson({ decisionId, ownerDecisionId: decisionId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
