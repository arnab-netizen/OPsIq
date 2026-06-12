/**
 * POST /api/owner/cashflow/businesses/[businessId]/diagnoses — run a cashflow
 *      diagnosis from a snapshot (OWNER_MANAGE). body: { snapshotId }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { runCashflowDiagnosisSchema } from "@/domain/owner-cashflow/validation";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, runCashflowDiagnosisSchema);
    const cycle = await runCashflowDiagnosis(
      params.businessId,
      body.snapshotId,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(cycle, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
