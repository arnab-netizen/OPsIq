/**
 * POST /api/owner/startup/sessions/[sessionId]/evidence — record evidence (idempotent by hash).
 * GET  — list evidence for session.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordEvidenceItem } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const evidenceSchema = z.object({
  ideaId: z.string().optional(),
  hypothesisId: z.string().optional(),
  sourceType: z.string().min(1),
  evidenceType: z.string().min(1),
  geography: z.string().max(200).optional(),
  customerSegment: z.string().max(500).optional(),
  observedResult: z.string().min(1),
  limitations: z.string().max(1000).optional(),
  reliabilityScore: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  ownerVerified: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, evidenceSchema);
    const input = {
      ideaId: body.ideaId ?? null,
      hypothesisId: body.hypothesisId ?? null,
      sourceType: body.sourceType,
      evidenceType: body.evidenceType,
      geography: body.geography ?? null,
      customerSegment: body.customerSegment ?? null,
      observedResult: body.observedResult,
      limitations: body.limitations ?? null,
      reliabilityScore: body.reliabilityScore,
      confidence: body.confidence,
      ownerVerified: body.ownerVerified,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    };
    const evidenceId = await recordEvidenceItem(ctx.verifiedWorkspaceId, params.sessionId, ctx.verifiedActorId, input);
    return canonicalJson({ evidenceId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const evidence = await db.startupEvidenceRecord.findMany({
      where: { startupSessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { retrievedAt: "desc" },
    });
    return canonicalJson({ evidence }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
