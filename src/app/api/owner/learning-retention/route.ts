/**
 * GET  /api/owner/learning-retention — get retention policy for workspace (OWNER_VIEW)
 * POST /api/owner/learning-retention — set retention policy (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  setRetentionPolicy,
  getRetentionPolicy,
} from "@/services/controlled-learning-retention.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const retentionSchema = z.object({
  retentionDays: z.number().int().positive(),
  appliedBy: z.string().min(1),
  appliedAt: z.string().min(1).transform((s) => new Date(s)),
  policyNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const data = await getRetentionPolicy(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, retentionSchema);
    const result = await setRetentionPolicy(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      retentionDays: body.retentionDays,
      appliedBy: body.appliedBy,
      appliedAt: body.appliedAt,
      policyNotes: body.policyNotes,
    });
    if (!result.set) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ policy: result.policy }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
