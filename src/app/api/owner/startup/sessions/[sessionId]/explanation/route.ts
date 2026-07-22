/**
 * GET  /api/owner/startup/sessions/[sessionId]/explanation — latest explanation record.
 * POST /api/owner/startup/sessions/[sessionId]/explanation — build and persist explanation.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { getLatestExplainabilityRecord } from "@/services/owner-mode/explainability.service";
import { buildAndPersistStartupExplanation } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const decisionRef = `startup:${params.sessionId}`;
    const record = await getLatestExplainabilityRecord(ctx.verifiedWorkspaceId, "STARTUP_SYSTEM_RECOMMENDATION");
    if (!record || !record.decisionRef.startsWith(decisionRef)) {
      throw new NotFoundError("ExplainabilityRecord", params.sessionId);
    }
    return canonicalJson(record, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  ideaId: z.string().nullable().optional(),
  ideaName: z.string().nullable().optional(),
  screeningStatus: z.string().nullable().optional(),
  screeningReasons: z.array(z.string()).optional(),
  economicClassification: z.string().nullable().optional(),
  breakEvenMonths: z.number().nullable().optional(),
  cashRunwayMonths: z.number().nullable().optional(),
  readinessStatus: z.string().nullable().optional(),
  hardGateFailures: z.array(z.string()).optional(),
  failedGates: z.array(z.string()).optional(),
  passedGates: z.array(z.string()).optional(),
  evidenceGaps: z.array(z.string()).optional(),
  bindingConstraints: z.array(z.string()).optional(),
  hypothesesConfirmed: z.number().optional(),
  hypothesesFailed: z.number().optional(),
  hypothesesTotal: z.number().optional(),
  rejectedAlternativeIds: z.array(z.string()).optional(),
  rejectedAlternativeNames: z.array(z.string()).optional(),
  closestAlternativeName: z.string().nullable().optional(),
  systemRecommendation: z.string().nullable().optional(),
  systemRationale: z.string().nullable().optional(),
  unknownInputs: z.array(z.string()).optional(),
  whatWouldChangeRecommendation: z.string().nullable().optional(),
  evidenceIds: z.array(z.string()).optional(),
  profileVersionId: z.string().nullable().optional(),
  inputSnapshotVersion: z.string().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const { explanationId, explanation } = await buildAndPersistStartupExplanation(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      body.ideaId ?? null,
      ctx.verifiedActorId,
      {
        ideaName: body.ideaName ?? null,
        screeningStatus: body.screeningStatus ?? null,
        screeningReasons: body.screeningReasons ?? [],
        economicClassification: body.economicClassification ?? null,
        breakEvenMonths: body.breakEvenMonths ?? null,
        cashRunwayMonths: body.cashRunwayMonths ?? null,
        readinessStatus: body.readinessStatus ?? null,
        hardGateFailures: body.hardGateFailures ?? [],
        failedGates: body.failedGates ?? [],
        passedGates: body.passedGates ?? [],
        evidenceGaps: body.evidenceGaps ?? [],
        bindingConstraints: body.bindingConstraints ?? [],
        hypothesesConfirmed: body.hypothesesConfirmed ?? 0,
        hypothesesFailed: body.hypothesesFailed ?? 0,
        hypothesesTotal: body.hypothesesTotal ?? 0,
        rejectedAlternativeIds: body.rejectedAlternativeIds ?? [],
        rejectedAlternativeNames: body.rejectedAlternativeNames ?? [],
        closestAlternativeName: body.closestAlternativeName ?? null,
        systemRecommendation: body.systemRecommendation ?? null,
        systemRationale: body.systemRationale ?? null,
        unknownInputs: body.unknownInputs ?? [],
        whatWouldChangeRecommendation: body.whatWouldChangeRecommendation ?? null,
        evidenceIds: body.evidenceIds ?? [],
        profileVersionId: body.profileVersionId ?? null,
        inputSnapshotVersion: body.inputSnapshotVersion ?? "1",
      }
    );
    return canonicalJson({ explanationId, explanation }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
