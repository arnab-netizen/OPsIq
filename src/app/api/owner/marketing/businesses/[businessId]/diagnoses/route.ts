/**
 * POST /api/owner/marketing/businesses/[businessId]/diagnoses — run a diagnosis
 *      from a snapshot (OWNER_MANAGE). body: { snapshotId }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { runMarketingDiagnosisSchema } from "@/domain/owner-marketing/validation";
import { runMarketingDiagnosis } from "@/services/owner-marketing/diagnosis.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, runMarketingDiagnosisSchema);
    const cycle = await runMarketingDiagnosis(params.businessId, body.snapshotId, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(cycle, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
