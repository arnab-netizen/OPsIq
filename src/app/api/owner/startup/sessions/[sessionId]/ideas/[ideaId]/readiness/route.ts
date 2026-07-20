/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/readiness — assess readiness.
 * GET  — retrieve latest readiness assessment.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { assessAndPersistReadiness } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readinessSchema = z.object({
  regulatoryEvidenceConfirmed: z.boolean(),
  missingLicences: z.array(z.string()),
  unresolvedCriticalRisks: z.number().int().min(0),
  executionPlanExists: z.boolean(),
  measurementPlanExists: z.boolean(),
  stopConditionsDefined: z.boolean(),
  riskRegisterConfidence: z.number().int().min(0).max(100).nullable(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, readinessSchema);
    const assessment = await assessAndPersistReadiness(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.ideaId,
      ctx.verifiedActorId,
      body
    );
    return canonicalJson(assessment, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const assessment = await db.startupReadinessAssessment.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { assessedAt: "desc" },
    });
    return canonicalJson({ assessment }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
