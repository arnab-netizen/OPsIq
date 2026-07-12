/**
 * GET  /api/owner/learning-privacy — list privacy controls for workspace or candidate (OWNER_VIEW)
 * POST /api/owner/learning-privacy — apply a privacy control (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  applyPrivacyControl,
  listPrivacyControlsForWorkspace,
  listPrivacyControlsForCandidate,
} from "@/services/controlled-learning-privacy.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privacyControlSchema = z.object({
  candidateId: z.string().min(1),
  controlType: z.enum(["ANONYMIZE", "REDACT", "EXCLUDE", "QUARANTINE"]),
  appliedAt: z.string().min(1).transform((s) => new Date(s)),
  reason: z.string().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId");
    const data = candidateId
      ? await listPrivacyControlsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId)
      : await listPrivacyControlsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, privacyControlSchema);
    const result = await applyPrivacyControl(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      controlType: body.controlType,
      appliedBy: ctx.verifiedActorId,
      appliedAt: body.appliedAt,
      reason: body.reason,
    });
    if (!result.applied) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ control: result.control }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
