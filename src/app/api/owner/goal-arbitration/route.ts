/**
 * Phase 4 — Goal Arbitration routes.
 *
 * GET  /api/owner/goal-arbitration — get the latest arbitration record
 * POST /api/owner/goal-arbitration — run a new goal arbitration cycle
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runGoalArbitration, getLatestArbitrationRecord } from "@/services/owner-mode/goal-arbitration.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const record = await getLatestArbitrationRecord(ctx.verifiedWorkspaceId);
    return canonicalJson({ record }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { arbitrationRecordId, portfolioDecisions } = await runGoalArbitration(ctx.verifiedWorkspaceId, ctx.verifiedActorId);
    return canonicalJson({ arbitrationRecordId, portfolioDecisions }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
