/**
 * GET  /api/owner/sales/businesses/[businessId]/snapshots — list snapshots (OWNER_VIEW)
 * POST /api/owner/sales/businesses/[businessId]/snapshots — create snapshot (OWNER_MANAGE)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { salesSnapshotCreateSchema } from "@/domain/owner-sales/validation";
import { createSalesSnapshot, listSalesSnapshots } from "@/services/owner-sales/snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listSalesSnapshots(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, salesSnapshotCreateSchema);
    const snapshot = await createSalesSnapshot(
      params.businessId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(snapshot, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
