/**
 * POST /api/owner/startup/sessions/[sessionId]/evidence — record evidence (idempotent).
 * GET  /api/owner/startup/sessions/[sessionId]/evidence — list evidence records.
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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const evidence = await db.startupEvidenceRecord.findMany({
      where: { sessionId: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { createdAt: "desc" },
    });
    return canonicalJson({ evidence }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  ideaId: z.string().uuid().nullable().optional(),
  hypothesisId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().max(256).nullable().optional(),
  sourceType: z.enum([
    "AUTHORITATIVE_PRIMARY",
    "OFFICIAL_COMMERCIAL",
    "FIELD_OBSERVATION",
    "OWNER_DIRECT",
    "SYSTEM_INFERENCE",
    "UNVERIFIED",
  ]),
  evidenceType: z.enum([
    "MARKET_SIZE",
    "CUSTOMER_DEMAND",
    "PRICING",
    "DELIVERY",
    "REGULATORY",
    "SUPPLIER",
    "ECONOMIC",
  ]),
  sourceName: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  geography: z.string().nullable().optional(),
  customerSegment: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  observedResult: z.string().min(1),
  limitations: z.string().nullable().optional(),
  reliabilityScore: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(100).optional(),
  ownerVerified: z.boolean().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);
    const evidenceId = await recordEvidenceItem(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      body
    );
    return canonicalJson({ evidenceId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
