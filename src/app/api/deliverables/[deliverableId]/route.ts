import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getDeliverableById } from "@/services/deliverable";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { deliverableId } = params;

    // SECURITY: membership-verified workspace, never a client-supplied header
    // (which allowed reading any workspace's deliverable by id). See GAP-TEN-02.
    const workspaceId = ctx.verifiedWorkspaceId;

    const deliverable = await getDeliverableById(deliverableId, workspaceId);
    if (!deliverable) {
      throw new NotFoundError("Deliverable", deliverableId);
    }

    return deliverable;
  },
  { requireCapabilities: [CAPABILITIES.DELIVERABLE_VIEW], requireWorkspace: true },
);
