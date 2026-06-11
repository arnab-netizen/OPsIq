/**
 * GET  /api/owner/recovery/businesses/[businessId]/snapshots — list snapshots (OWNER_VIEW)
 * POST /api/owner/recovery/businesses/[businessId]/snapshots — record snapshot (OWNER_MANAGE)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { metricSnapshotSchema, missingCriticalMetrics, isStaleSnapshot } from "@/domain/founder-recovery/validation";
import { createSnapshot, listSnapshots } from "@/services/founder-recovery/snapshot.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listSnapshots(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const input = await parseRequestBody(ctx.request!, metricSnapshotSchema);
    const snapshot = await createSnapshot(
      params.businessId,
      input,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    // Non-blocking data-quality flags surfaced to the owner.
    const warnings: string[] = [];
    const missing = missingCriticalMetrics(input as Record<string, unknown>);
    if (missing.length > 0) warnings.push(`Missing critical metrics: ${missing.join(", ")}`);
    if (isStaleSnapshot(input.periodEnd, new Date())) warnings.push("Reporting period is stale (>45 days old).");

    return canonicalJson({ snapshot, warnings }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
