/**
 * GET  /api/owner/learning-regression-results — list regression results (OWNER_VIEW)
 * POST /api/owner/learning-regression-results — record a regression test result (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  recordRegressionResult,
  listRegressionResultsForWorkspace,
  listRegressionResultsForCandidate,
} from "@/services/controlled-learning-regression.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const regressionResultSchema = z.object({
  candidateId: z.string().min(1),
  testRunId: z.string().min(1),
  testVerdict: z.enum(["PASS", "FAIL", "INCONCLUSIVE"]),
  regressionScore: z.number().min(0).max(1),
  testedBy: z.string().min(1),
  testedAt: z.string().min(1).transform((s) => new Date(s)),
  testNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId");
    const data = candidateId
      ? await listRegressionResultsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId)
      : await listRegressionResultsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, regressionResultSchema);
    const result = await recordRegressionResult(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      testRunId: body.testRunId,
      testVerdict: body.testVerdict,
      regressionScore: body.regressionScore,
      testedBy: body.testedBy,
      testedAt: body.testedAt,
      testNotes: body.testNotes,
    });
    if (!result.recorded) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ result: result.result }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
