/**
 * POST /api/owner/opportunities/validation-outcome — record what actually happened when an opportunity's
 * validation experiment ran, so the live Opportunity Portfolio can make real kill/park/scale decisions.
 *
 * Server-authoritative: workspace + actor from the verified session; OWNER_MANAGE required; validated +
 * normalised in the pure domain layer (no-fake-win / stop-loss / scale gates enforced there); persisted with
 * an atomic audit; idempotent on (workspace, idempotencyKey). Recording an outcome never scales anything —
 * it records evidence the portfolio gate consumes.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { OUTCOME_STATUSES, OUTCOME_RESULTS } from "@/domain/owner-mode/validation-outcome";
import { recordValidationOutcome } from "@/services/owner-mode/validation-outcome.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  experimentKey: z.string().trim().min(1).max(200),
  opportunityKey: z.string().trim().min(1).max(200),
  status: z.enum(OUTCOME_STATUSES as unknown as [string, ...string[]]),
  result: z.enum(OUTCOME_RESULTS as unknown as [string, ...string[]]),
  startedAt: z.string().datetime().nullish(),
  completedAt: z.string().datetime().nullish(),
  actualCost: z.number().finite().nonnegative().nullish(),
  actualOwnerTimeMinutes: z.number().int().nonnegative().max(100000).nullish(),
  leadsGenerated: z.number().int().nonnegative().max(1000000).nullish(),
  responses: z.number().int().nonnegative().max(1000000).nullish(),
  conversions: z.number().int().nonnegative().max(1000000).nullish(),
  revenueEvidence: z.string().trim().max(2000).nullish(),
  marginEvidence: z.string().trim().max(2000).nullish(),
  customerFeedback: z.string().trim().max(2000).nullish(),
  operationalIssues: z.string().trim().max(2000).nullish(),
  cashImpactNotes: z.string().trim().max(2000).nullish(),
  proofEvidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  successMetricResult: z.string().trim().max(2000).nullish(),
  failureMetricResult: z.string().trim().max(2000).nullish(),
  stopLossTriggered: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).nullish(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const actorRole = (ctx.verifiedSessionSnapshot as { role?: string } | undefined)?.role ?? null;
    const r = await recordValidationOutcome({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorRole,
      submission: input as Parameters<typeof recordValidationOutcome>[0]["submission"],
    });
    if (!r.ok) return canonicalJson({ error: r.reason }, { status: 400 });
    return canonicalJson({ outcomeId: r.outcomeId, result: r.result, nextRecommendedDecision: r.nextRecommendedDecision, deduped: r.deduped, updated: r.updated }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
