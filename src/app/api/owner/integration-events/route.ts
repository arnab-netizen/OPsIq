/**
 * Bundle 5.3 — Integration Event Ingestion API surface.
 *
 * POST /api/owner/integration-events — ingest a validated integration event
 *   Validates the event schema, verifies connector ownership, emits audit event,
 *   and fires BCP re-evaluation if event kind warrants it (fire-and-forget).
 *
 * Auth: INTEGRATION_MANAGE. Workspace-scoped.
 * The request body IS the integration event (validated by IntegrationEventSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ingestIntegrationEvent } from "@/services/integration-fabric/integration-event.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();

    // Ensure workspaceId in body matches the authenticated workspace (workspace isolation)
    const eventWithWorkspace = {
      ...body,
      workspaceId: ctx.verifiedWorkspaceId,
    };

    const result = await ingestIntegrationEvent(eventWithWorkspace, ctx.verifiedActorId);
    return canonicalJson({ result }, { status: 202 });
  },
  { requireCapabilities: [CAPABILITIES.INTEGRATION_MANAGE], requireWorkspace: true }
);
