/**
 * POST /api/internal/alerts/[alertId]/retry-email
 *
 * Retries email delivery for a FAILED or expired-CLAIMED alert.
 * SENT is terminal and cannot be retried.
 * Bounded to EMAIL_MAX_ATTEMPTS (3); exceeding returns 409.
 * Requires OWNER_MANAGE capability.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const alertId = parseOrThrow(uuidSchema, params.alertId);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const result = await retryEmailAlert(alertId, workspaceId, actorId);
    return canonicalJson({ ok: true, result }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
