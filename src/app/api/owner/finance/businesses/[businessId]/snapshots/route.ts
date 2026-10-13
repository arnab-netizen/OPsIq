/**
 * GET  /api/owner/finance/businesses/[businessId]/snapshots — list snapshots (OWNER_VIEW)
 * POST /api/owner/finance/businesses/[businessId]/snapshots — create snapshot (OWNER_MANAGE)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { assertEvidenceQualityStatedForFirstEvidence, recordProductEventOnce } from "@/services/owner-first-run/first-run.service";
import { createFinancialSnapshot, listFinancialSnapshots } from "@/services/owner-finance/snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listFinancialSnapshots(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, financialSnapshotCreateSchema);
    await assertEvidenceQualityStatedForFirstEvidence(ctx.verifiedWorkspaceId, params.businessId, input.evidenceQuality);
    const snapshot = await createFinancialSnapshot(
      params.businessId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    await recordProductEventOnce({
      name: "first_evidence_saved",
      eventName: AUDIT_EVENTS.PRODUCT_FIRST_EVIDENCE_SAVED,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      businessId: params.businessId,
      props: { evidenceQuality: input.evidenceQuality },
    });
    return canonicalJson(snapshot, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
