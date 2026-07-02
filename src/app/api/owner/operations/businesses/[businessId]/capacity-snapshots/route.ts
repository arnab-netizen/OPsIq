/**
 * Capacity ingestion route (P0-A runtime-readiness: unblocks the `equipment_capacity` critical domain).
 * GET  /api/owner/operations/businesses/[businessId]/capacity-snapshots — list (OWNER_VIEW)
 * POST /api/owner/operations/businesses/[businessId]/capacity-snapshots — create (OWNER_MANAGE)
 *
 * businessId is REQUIRED in the path so the persisted snapshot is always business-scoped and therefore visible to the
 * owner whole-business plan (which reads `ownerCapacitySnapshot` by workspaceId+businessId). The service enforces that
 * the business belongs to the caller's workspace (`assertBusinessInWorkspace`); this route enforces auth + capability
 * + workspace. No seed script, no fabricated data.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { saveCapacitySnapshot, listCapacitySnapshots } from "@/services/owner-operations/capacity-snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const capacitySnapshotSchema = z.object({
  resources: z
    .array(z.object({ type: z.string().trim().min(1), utilization: z.number().min(0) }))
    .min(1, "at least one capacity resource is required"),
  currentRevenue: z.number().min(0),
  safeUtilization: z.number().gt(0).max(1).optional(),
  expansionThreshold: z.number().gt(0).max(1).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const snapshots = await listCapacitySnapshots(ctx.verifiedWorkspaceId, undefined, params.businessId);
    return canonicalJson({ snapshots }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, capacitySnapshotSchema);
    const snapshot = await saveCapacitySnapshot({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId: params.businessId,
      resources: input.resources,
      currentRevenue: input.currentRevenue,
      safeUtilization: input.safeUtilization,
      expansionThreshold: input.expansionThreshold,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    });
    return canonicalJson(snapshot, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
