/**
 * Bundle 7 Slice 6 — Consulting Engagement Health API.
 *
 * GET /api/consulting/engagements/health?id=<uuid>
 *
 * Computes real-time health status for a consulting engagement:
 * HEALTHY | AT_RISK | BLOCKED, with reasons and counts.
 *
 * Auth: CONSULTING_READ
 * Workspace: always from ctx.verifiedWorkspaceId (never from query params)
 * Audit: read-only computation — no audit event emitted
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { computeConsultingEngagementHealth } from "@/services/consulting/consulting-engagement.service";
import { NotFoundError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return canonicalJson(
        { error: "Missing required query parameter: id" },
        { status: 400 }
      );
    }

    try {
      const health = await computeConsultingEngagementHealth({
        engagementId: id,
        workspaceId: ctx.verifiedWorkspaceId,
      });
      return canonicalJson({ health }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: classifyOperatorError(err, { context: "load" }).operatorMessage }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_READ], requireWorkspace: true }
);
