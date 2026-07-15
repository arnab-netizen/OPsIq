/**
 * GET /api/growth/retention-metrics/analysis
 *
 * Returns churn risk, retention curve, and churn forecast derived from the most recent
 * persisted cohort for this workspace. Returns { found: false } when no cohorts exist.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { canonicalJson } from "@/lib/canonical-json-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const cohorts = await RetentionEngine.listCohorts(ctx.verifiedWorkspaceId);

    if (cohorts.length === 0) {
      return canonicalJson({ found: false, cohortCount: 0, risk: null, curve: null, forecast: null }, { status: 200 });
    }

    const latest = cohorts[0]; // listCohorts returns cohortMonth desc — first is most recent
    const risk = RetentionEngine.assessChurnRisk(ctx.verifiedWorkspaceId, latest);
    const curve = RetentionEngine.calculateRetentionCurve(ctx.verifiedWorkspaceId, latest.monthlyRetention);
    const forecast = RetentionEngine.forecastChurn(ctx.verifiedWorkspaceId, latest.monthlyRetention);

    return canonicalJson({ found: true, cohortCount: cohorts.length, risk, curve, forecast }, { status: 200 });
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
