/**
 * POST /api/owner/sop/businesses/[businessId]/diagnoses — run a diagnosis
 *      from a snapshot (OWNER_MANAGE). body: { snapshotId }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { runSopDiagnosisSchema } from "@/domain/owner-sop/validation";
import { runSopDiagnosis } from "@/services/owner-sop/diagnosis.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, runSopDiagnosisSchema);
    const cycle = await runSopDiagnosis(params.businessId, body.snapshotId, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(cycle, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
