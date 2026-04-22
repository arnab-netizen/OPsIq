import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getDeliverableById } from "@/services/deliverable";
import { NotFoundError } from "@/infra/errors";

export const GET = withRequestContext(async (_request, context) => {
  const { deliverableId } = await context.params;
  await withAuth();

  const deliverable = await getDeliverableById(deliverableId);
  if (!deliverable) {
    throw new NotFoundError("Deliverable", deliverableId);
  }

  return Response.json(deliverable);
});
