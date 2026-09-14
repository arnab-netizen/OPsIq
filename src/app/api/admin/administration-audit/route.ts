/**
 * GET /api/admin/administration-audit
 *
 * Operator-readable Administration audit log — capacity/mode changes,
 * bootstrap, invite/revoke/reject/reopen, suspend/restore, session
 * revocation. Gated on CUSTOMER_ACCESS_MANAGE (withCanonicalEnforcement's
 * requireCapabilities is AND-semantics only, so this endpoint picks the one
 * capability rather than an unsupported "either" check — a role needing
 * BETA_PROGRAM_MANAGE-only audit visibility can be granted both narrow
 * capabilities, which is a provisioning decision, not a code change).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getAdministrationAuditLog } from "@/services/admin/administration-audit.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const events = await getAdministrationAuditLog(limitParam ? parseInt(limitParam, 10) : undefined);
    return { events };
  },
  { requireCapabilities: [CAPABILITIES.CUSTOMER_ACCESS_MANAGE] }
);
