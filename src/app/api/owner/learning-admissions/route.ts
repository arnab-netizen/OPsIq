import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  admitCandidate,
  listAdmissionsForWorkspace,
} from "@/services/controlled-learning-admission.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const admitSchema = z.object({
  candidateId: z.string().min(1),
  admittedBy: z.string().min(1),
  admittedAt: z.string().min(1).transform((s) => new Date(s)),
  sourceLabel: z.string().min(1),
  evidenceOrigin: z.string().min(1),
  eligibilityStatus: z.string().min(1),
  admissionNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const data = await listAdmissionsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, admitSchema);
    const result = await admitCandidate(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      admittedBy: body.admittedBy,
      admittedAt: body.admittedAt,
      sourceLabel: body.sourceLabel,
      evidenceOrigin: body.evidenceOrigin,
      eligibilityStatus: body.eligibilityStatus,
      admissionNotes: body.admissionNotes,
    });
    if (!result.admitted) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ admission: result.admission }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
