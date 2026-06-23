/**
 * GET  /api/owner/learning-harm-events — list harm events (OWNER_VIEW)
 * POST /api/owner/learning-harm-events — record a harm event (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  recordHarmEvent,
  listHarmEventsForWorkspace,
  listHarmEventsForCandidate,
} from "@/services/controlled-learning-harm.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const harmEventSchema = z.object({
  candidateId: z.string().min(1),
  harmType: z.enum([
    "FINANCIAL_LOSS",
    "DECISION_ERROR",
    "DATA_CORRUPTION",
    "COMPLIANCE_VIOLATION",
    "SAFETY_RISK",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  detectedBy: z.string().min(1),
  detectedAt: z.string().min(1).transform((s) => new Date(s)),
  harmDescription: z.string().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId");
    const data = candidateId
      ? await listHarmEventsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId)
      : await listHarmEventsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, harmEventSchema);
    const result = await recordHarmEvent(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      harmType: body.harmType,
      severity: body.severity,
      detectedBy: body.detectedBy,
      detectedAt: body.detectedAt,
      harmDescription: body.harmDescription,
    });
    if (!result.recorded) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ event: result.event }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
