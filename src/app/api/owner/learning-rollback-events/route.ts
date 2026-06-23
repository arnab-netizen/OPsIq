/**
 * GET  /api/owner/learning-rollback-events — list rollback events (OWNER_VIEW)
 * POST /api/owner/learning-rollback-events — record a rollback event (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  recordRollbackEvent,
  listRollbackEventsForWorkspace,
  listRollbackEventsForCandidate,
} from "@/services/controlled-learning-rollback.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rollbackEventSchema = z.object({
  candidateId: z.string().min(1),
  rolledBackBy: z.string().min(1),
  rolledBackAt: z.string().min(1).transform((s) => new Date(s)),
  rollbackReason: z.string().min(1),
  rollbackCode: z.enum([
    "REGRESSION_DETECTED",
    "HARM_DETECTED",
    "MANUAL_OVERRIDE",
    "POLICY_VIOLATION",
  ]),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId");
    const data = candidateId
      ? await listRollbackEventsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId)
      : await listRollbackEventsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, rollbackEventSchema);
    const result = await recordRollbackEvent(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      rolledBackBy: body.rolledBackBy,
      rolledBackAt: body.rolledBackAt,
      rollbackReason: body.rollbackReason,
      rollbackCode: body.rollbackCode,
    });
    if (!result.recorded) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ event: result.event }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
