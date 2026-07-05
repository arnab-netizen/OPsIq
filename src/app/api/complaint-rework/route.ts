import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { requirePermission } from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { OperationalEventType } from "@/domain/execution/complaint-rework";
import { recordOperationalEvent, linkOperationalEventToProof } from "@/services/execution/complaint-rework.service";

export const runtime = "nodejs";

/**
 * POST /api/complaint-rework — record a per-event complaint/rework, or link one to accepted proof.
 *
 * Server-authoritative: workspace + actor from the verified session; a proof-review permission is
 * required; category + description are required; a linked proof is verified to belong to the
 * workspace by the service; errors are sanitized. Deliberately minimal — not a CRM/ticketing surface.
 */
const recordSchema = z.object({
  action: z.literal("record"),
  eventType: z.nativeEnum(OperationalEventType),
  category: z.string().trim().min(1),
  description: z.string().trim().min(3),
  severity: z.string().trim().optional(),
  source: z.string().trim().optional(),
  businessId: z.string().trim().min(1).nullable().optional(),
  relatedProofId: z.string().trim().min(1).nullable().optional(),
  relatedActionId: z.string().trim().min(1).nullable().optional(),
  occurredAt: z.string().trim().min(1).nullable().optional(),
  estimatedImpactAmount: z.number().positive().nullable().optional(),
  impactCurrency: z.string().trim().min(1).nullable().optional(),
});
const linkSchema = z.object({
  action: z.literal("link"),
  eventId: z.string().trim().min(1),
  proofId: z.string().trim().min(1),
});
const bodySchema = z.discriminatedUnion("action", [recordSchema, linkSchema]);

function statusForReason(reason: string): number {
  if (/not found/i.test(reason)) return 404;
  return 400;
}

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const input = await parseRequestBody(ctx.request!, bodySchema);
  const actorId = ctx.verifiedActorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  await requirePermission(workspaceId, actorId, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK);

  if (input.action === "record") {
    const r = await recordOperationalEvent({
      workspaceId, actorId, eventType: input.eventType, category: input.category, description: input.description,
      severity: input.severity, source: input.source, businessId: input.businessId ?? null,
      relatedProofId: input.relatedProofId ?? null, relatedActionId: input.relatedActionId ?? null,
      occurredAt: input.occurredAt ?? null, estimatedImpactAmount: input.estimatedImpactAmount ?? null, impactCurrency: input.impactCurrency ?? null,
    });
    if (!r.ok) return canonicalJson({ error: r.reason }, { status: statusForReason(r.reason) });
    return canonicalJson({ eventId: r.eventId }, { status: 200 });
  }

  const r = await linkOperationalEventToProof({ workspaceId, actorId, eventId: input.eventId, proofId: input.proofId });
  if (!r.ok) return canonicalJson({ error: r.reason }, { status: statusForReason(r.reason) });
  return canonicalJson({ linked: true, deduped: r.deduped }, { status: 200 });
});
