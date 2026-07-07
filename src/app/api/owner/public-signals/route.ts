/**
 * GET /api/owner/public-signals?businessId=... — READ-ONLY owner "Outside signals" summary (PASS 39).
 *
 * Projects the proven PASS 28-30 public-signal pipeline over the workspace's already-persisted, controlled
 * intake records (no live fetch, no connectors, no LLM). OWNER_VIEW-gated, workspace-scoped, canonically
 * enforced. It mutates nothing, shows no raw text/PII, states the no-live-ingestion boundary, and never
 * fabricates signals or money. On an incoherent projection it fails closed (500) rather than emitting an
 * unsafe summary.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerPublicSignals } from "@/services/owner-mode/owner-public-signals.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const result = await getOwnerPublicSignals(ctx.verifiedWorkspaceId, businessId);
    if (!result.ok) {
      // Fail closed: never emit an incoherent public-signal summary. Static safe copy — no raw error.
      const safe = { code: "PUBLIC_SIGNALS_INCOHERENT", detail: "Outside signals could not be produced safely." };
      return canonicalJson({ error: safe }, { status: 500 });
    }
    return canonicalJson(result.summary, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
