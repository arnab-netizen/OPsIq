/**
 * GET /api/admin/billing/diagnostics
 *
 * Admin-safe billing and entitlement diagnostic endpoint.
 * Requires SYSTEM_ADMIN capability.
 * Workspace-scoped via x-workspace-id header.
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
    const workspaceId = ctx.request!.headers.get("x-workspace-id");
    const format = ctx.request!.url.includes("?format=export") ? "export" : "diagnostic";

    if (!workspaceId) {
      throw new Error("Workspace ID required (x-workspace-id header)");
    }

    if (format === "export") {
      return await getBillingExportPacket(workspaceId);
    }

    return await getBillingDiagnostic(workspaceId);
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
