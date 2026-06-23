import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  rejectCandidateFinal,
  listRejectionsForWorkspace,
} from "@/services/controlled-learning-rejection.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rejectSchema = z.object({
  candidateId: z.string().min(1),
  rejectedBy: z.string().min(1),
  rejectedAt: z.string().min(1).transform((s) => new Date(s)),
  rejectionReason: z.string().min(1),
  rejectionCode: z.string().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const data = await listRejectionsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, rejectSchema);
    const result = await rejectCandidateFinal(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      rejectedBy: body.rejectedBy,
      rejectedAt: body.rejectedAt,
      rejectionReason: body.rejectionReason,
      rejectionCode: body.rejectionCode,
    });
    if (!result.rejected) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ rejection: result.rejection }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
