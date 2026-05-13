import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { getDeliverableById } from "@/services/deliverable";
import { NotFoundError } from "@/infra/errors";
import type { NextRequest } from "next/server";

export const GET = withEnforcementFull(async (request, context, params) => {
  const { deliverableId } = params;
  await withAuth();

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const deliverable = await getDeliverableById(deliverableId, workspaceId);
  if (!deliverable) {
    throw new NotFoundError("Deliverable", deliverableId);
  }

  return Response.json(deliverable);
});
