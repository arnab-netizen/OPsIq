/**
 * GET /api/owner/recovery-status?businessId=... — READ-ONLY owner recovery status (PASS 37).
 *
 * Projects the proven PASS 32 survival planner + PASS 33 recovery milestone machine into a governed,
 * fail-closed owner recovery summary. OWNER_VIEW-gated, workspace-scoped, canonically enforced. It mutates
 * nothing, fabricates no money, never opens the thrive gate without proven stabilization, and always carries
 * the "recovery is not guaranteed" statement. On an incoherent projection it fails closed (500) rather than
 * emitting an unsafe status.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerRecoveryStatus } from "@/services/owner-mode/owner-recovery-status.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId");
    const result = await getOwnerRecoveryStatus(ctx.verifiedWorkspaceId, businessId);
    if (!result.ok) {
      // Fail closed: never emit an incoherent recovery status to the owner. Static safe copy — no raw error.
      const safe = { code: "RECOVERY_STATUS_INCOHERENT", detail: "Recovery status could not be produced safely." };
      return canonicalJson({ error: safe }, { status: 500 });
    }
    return canonicalJson(result.status, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
