/**
 * GET  /api/owner/budget/archetype-metrics?businessId=... — list persisted archetype
 *      operational metrics (manual / import-ready). OWNER_VIEW, workspace-scoped.
 * POST /api/owner/budget/archetype-metrics — record an archetype operational metric.
 *      OWNER_MANAGE, workspace-scoped, Zod-validated, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { archetypeMetricCreateSchema } from "@/domain/owner-budget/validation";
import { recordArchetypeMetric, listArchetypeMetrics } from "@/services/owner-budget/archetype-metrics.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    if (!businessId) return { error: "businessId is required" };
    return listArchetypeMetrics(ctx.verifiedWorkspaceId, businessId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { businessId, ...input } = await parseRequestBody(ctx.request!, archetypeMetricCreateSchema);
    const metric = await recordArchetypeMetric(businessId, input, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
    return canonicalJson(metric, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
