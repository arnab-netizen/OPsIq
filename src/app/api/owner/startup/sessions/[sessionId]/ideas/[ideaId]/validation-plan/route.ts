/**
 * GET  /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/validation-plan
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/validation-plan
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { buildAndPersistValidationPlan } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const plan = await db.startupValidationPlan.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) throw new NotFoundError("StartupValidationPlan", params.ideaId);
    return canonicalJson(plan, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  passCriteria: z.string(),
  failCriteria: z.string(),
  spendingLimitCents: z.coerce.number().nullable().optional(),
  stopConditions: z.array(z.string()).optional(),
  safetyLimits: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);

    const planId = await buildAndPersistValidationPlan(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.ideaId,
      ctx.verifiedActorId,
      {
        passCriteria: body.passCriteria,
        failCriteria: body.failCriteria,
        spendingLimitCents: body.spendingLimitCents != null ? BigInt(Math.round(body.spendingLimitCents)) : null,
        stopConditions: body.stopConditions ?? [],
        safetyLimits: body.safetyLimits ?? {},
      }
    );

    return canonicalJson({ planId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
