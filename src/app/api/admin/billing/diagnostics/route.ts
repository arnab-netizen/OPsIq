/**
 * GET /api/admin/billing/diagnostics
 *
 * Admin-safe billing and entitlement diagnostic endpoint.
 * Requires SYSTEM_ADMIN capability, resolved against the caller's VERIFIED
 * workspace. `system_admin` is a workspace-scoped role (getPolicyContext filters
 * role assignments by scope="workspace"/scopeId=verified workspace), and the
 * documented contract is "workspace-scoped access only, no cross-workspace
 * leakage" (docs/ADMIN_BILLING_ENTITLEMENT_PROOF.md). The workspace is therefore
 * taken from ctx.verifiedWorkspaceId — never a client-supplied x-workspace-id
 * header, which previously let a workspace-A admin export another tenant's
 * billing. See GAP-TEN-03.
 *
 * Returns comprehensive proof of:
 * - Billing account status
 * - Subscription status
 * - Plan and capabilities
 * - Entitlement decisions
 * - Usage summary
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getBillingDiagnostic, getBillingExportPacket } from "@/services/admin-billing-diagnostics.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const format = ctx.request!.url.includes("?format=export") ? "export" : "diagnostic";

    if (format === "export") {
      return await getBillingExportPacket(workspaceId);
    }

    return await getBillingDiagnostic(workspaceId);
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
    requireWorkspace: true,
  }
);
