import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { getDeliverableById } from "@/services/deliverable";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { deliverableId } = params;

    const workspaceId = ctx.verifiedWorkspaceId;
    if (!workspaceId) {
      throw new Error("Workspace ID required (x-workspace-id header)");
    }

    const deliverable = await getDeliverableById(deliverableId, workspaceId);
    if (!deliverable) {
      throw new NotFoundError("Deliverable", deliverableId);
    }

    return deliverable;
  }
);
