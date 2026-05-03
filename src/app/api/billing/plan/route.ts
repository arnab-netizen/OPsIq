import { verifyAuth } from "@/lib/auth-guard";
import { resolveEntitlements } from "@/services/entitlement.service";
import { errorToResponse } from "@/infra/errors";

export async function GET(request: Request) {
  try {
    const authContext = await verifyAuth(request);
    const workspaceId = authContext.policy.workspaceId;

    if (!workspaceId) {
      return errorToResponse(
        new Error("workspaceId is required in auth context")
      );
    }

    const entitlements = await resolveEntitlements(workspaceId);

    return Response.json(
      {
        plan: entitlements.plan,
        status: entitlements.status,
        currentPeriodStart: entitlements.currentPeriodStart,
        currentPeriodEnd: entitlements.currentPeriodEnd,
      },
      { status: 200 }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
