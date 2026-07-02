/**
 * Owner-workload ingestion route (P0-A runtime-readiness: unblocks the `owner_workload_memory` critical domain and the
 * mandated human-execution-reality dimension).
 * GET  /api/owner/operations/businesses/[businessId]/workload-snapshots — list (OWNER_VIEW)
 * POST /api/owner/operations/businesses/[businessId]/workload-snapshots — create (OWNER_MANAGE)
 *
 * businessId is REQUIRED in the path so the persisted snapshot is business-scoped and visible to the owner
 * whole-business plan (which reads `ownerWorkloadSnapshot` by workspaceId+businessId). The service enforces workspace
 * ownership of the business; this route enforces auth + capability + workspace. No seed script, no fabricated data.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { saveOwnerWorkloadSnapshot, listOwnerWorkloadSnapshots } from "@/services/owner-operations/owner-workload-snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const workloadSnapshotSchema = z.object({
  ownerMinutesPerDay: z.number().min(0),
  sustainableMinutesPerDay: z.number().gt(0),
  ownerTasks: z.number().int().min(0).optional(),
  ownerOnlyCriticalTasks: z.number().int().min(0).optional(),
  hasDelegatableTasks: z.boolean().optional(),
  processStandardizable: z.boolean().optional(),
  automatable: z.boolean().optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const snapshots = await listOwnerWorkloadSnapshots(ctx.verifiedWorkspaceId, undefined, params.businessId);
    return canonicalJson({ snapshots }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, workloadSnapshotSchema);
    const snapshot = await saveOwnerWorkloadSnapshot({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId: params.businessId,
      ownerMinutesPerDay: input.ownerMinutesPerDay,
      sustainableMinutesPerDay: input.sustainableMinutesPerDay,
      ownerTasks: input.ownerTasks,
      ownerOnlyCriticalTasks: input.ownerOnlyCriticalTasks,
      hasDelegatableTasks: input.hasDelegatableTasks,
      processStandardizable: input.processStandardizable,
      automatable: input.automatable,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    });
    return canonicalJson(snapshot, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
