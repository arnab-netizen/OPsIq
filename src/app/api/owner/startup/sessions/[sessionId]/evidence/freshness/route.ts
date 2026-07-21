/**
 * GET /api/owner/startup/sessions/[sessionId]/evidence/freshness
 * Returns evidence freshness classification and conflict detection for a session.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEvidenceFreshnessForSession } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const report = await getEvidenceFreshnessForSession(
      ctx.verifiedWorkspaceId,
      params.sessionId
    );
    return canonicalJson(report, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
