/**
 * GET  /api/owner/learning-consent — list consent records for workspace or candidate (OWNER_VIEW)
 * POST /api/owner/learning-consent — record consent (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  recordConsent,
  listConsentRecords,
} from "@/services/controlled-learning-consent.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const consentSchema = z.object({
  candidateId: z.string().min(1),
  consentGiven: z.boolean(),
  consentBy: z.string().min(1),
  consentAt: z.string().min(1).transform((s) => new Date(s)),
  consentScope: z.enum(["WORKSPACE_ONLY", "ANONYMIZED_AGGREGATE", "NONE"]),
  consentNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId") ?? "";
    const data = await listConsentRecords(db as any, ctx.verifiedWorkspaceId, candidateId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, consentSchema);
    const result = await recordConsent(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      consentGiven: body.consentGiven,
      consentBy: body.consentBy,
      consentAt: body.consentAt,
      consentScope: body.consentScope,
      consentNotes: body.consentNotes,
    });
    if (!result.recorded) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ record: result.record }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
