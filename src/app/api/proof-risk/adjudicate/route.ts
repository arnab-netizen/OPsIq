import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { requirePermission } from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { AdjudicationOutcome, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
import { adjudicateProofRiskFinding } from "@/services/execution/proof-risk-adjudication.service";

export const runtime = "nodejs";

/**
 * POST /api/proof-risk/adjudicate — record a governed owner/reviewer decision about a flagged
 * reused/fake/suspicious proof finding.
 *
 * Server-authoritative: workspace + actor from the verified session; a proof-review permission is
 * required; the outcome + a reason are required; referenced proofIds are workspace-verified by the
 * service; the record + audit are atomic and idempotent; errors are sanitized. Not HR discipline
 * tooling — it records a decision about the finding, never a fraud/theft verdict or a hidden score.
 */
const bodySchema = z.object({
  sourceType: z.nativeEnum(AdjudicationSourceType),
  sourceRef: z.string().trim().min(1),
  outcome: z.nativeEnum(AdjudicationOutcome),
  reason: z.string().trim().min(3),
  proofIds: z.array(z.string().trim().min(1)).optional(),
  actorIds: z.array(z.string().trim().min(1)).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

function statusForReason(reason: string): number {
  if (/not in this workspace|not found/i.test(reason)) return 404;
  return 400;
}

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const input = await parseRequestBody(ctx.request!, bodySchema);
  const actorId = ctx.verifiedActorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  await requirePermission(workspaceId, actorId, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK);

  // The adjudicator's role is recorded for the audit where the session snapshot exposes it (else null).
  const actorRole = (ctx.verifiedSessionSnapshot as { role?: string } | undefined)?.role ?? null;
  const r = await adjudicateProofRiskFinding({
    workspaceId, actorId, actorRole,
    sourceType: input.sourceType, sourceRef: input.sourceRef, outcome: input.outcome, reason: input.reason,
    proofIds: input.proofIds, actorIds: input.actorIds, idempotencyKey: input.idempotencyKey,
  });
  if (!r.ok) return canonicalJson({ error: r.reason }, { status: statusForReason(r.reason) });
  return canonicalJson({ adjudicationId: r.adjudicationId, status: r.status, deduped: r.deduped, updated: r.updated, reassessmentEventId: r.reassessmentEventId }, { status: 200 });
});
