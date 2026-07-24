/**
 * Bundle 7 Slice 5 — Consulting Engagement Export API.
 *
 * GET /api/consulting/engagements/export?id=<uuid>
 *
 * Returns a structured consultant-view export of a consulting engagement
 * including all associated findings, recommendations, and actions.
 *
 * Auth: CONSULTING_READ
 * Workspace: always from ctx.verifiedWorkspaceId (never from query params)
 * Audit: emits consulting.engagement_exported on success
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { exportConsultingEngagement } from "@/services/consulting/consulting-export.service";
import { NotFoundError } from "@/infra/errors";

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
      const exported = await exportConsultingEngagement(
        { engagementId: id, workspaceId: ctx.verifiedWorkspaceId },
        ctx.verifiedActorId
      );
      return canonicalJson({ export: exported }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return canonicalJson({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_READ], requireWorkspace: true }
);
