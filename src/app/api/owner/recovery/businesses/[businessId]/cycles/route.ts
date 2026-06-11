/**
 * GET  /api/owner/recovery/businesses/[businessId]/cycles — list recovery cycles (OWNER_VIEW)
 * POST /api/owner/recovery/businesses/[businessId]/cycles — run a recovery cycle (OWNER_MANAGE)
 *      body: { snapshotId }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { listCycles, runCycle } from "@/services/founder-recovery/cycle.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runCycleSchema = z.object({ snapshotId: z.string().uuid() });

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    return listCycles(params.businessId, ctx.verifiedWorkspaceId);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.businessId);
    const body = await parseRequestBody(ctx.request!, runCycleSchema);
    const cycle = await runCycle(
      params.businessId,
      body.snapshotId,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );
    return canonicalJson(cycle, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
