/**
 * GET  /api/owner/learning-rollout-flags — list rollout flags for workspace (OWNER_VIEW)
 * POST /api/owner/learning-rollout-flags — set rollout flag (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  setRolloutFlag,
  listRolloutFlagsForWorkspace,
} from "@/services/controlled-learning-rollout.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rolloutFlagSchema = z.object({
  candidateId: z.string().min(1),
  rolloutStage: z.enum(["SHADOW", "CANARY", "PARTIAL", "FULL", "PAUSED"]),
  rolloutPct: z.number().min(0).max(100),
  enabledBy: z.string().min(1),
  enabledAt: z.string().min(1).transform((s) => new Date(s)),
  flagNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const data = await listRolloutFlagsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, rolloutFlagSchema);
    const result = await setRolloutFlag(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      rolloutStage: body.rolloutStage,
      rolloutPct: body.rolloutPct,
      enabledBy: body.enabledBy,
      enabledAt: body.enabledAt,
      flagNotes: body.flagNotes,
    });
    if (!result.set) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ flag: result.flag }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
