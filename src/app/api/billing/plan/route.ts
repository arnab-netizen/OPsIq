import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { resolveEntitlements } from "@/services/entitlement.service";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate
  await withAuth();

  // Get workspaceId from header
  const workspaceId = request.headers.get("x-workspace-id");

  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  const entitlements = await resolveEntitlements(workspaceId);

  return {
    plan: entitlements.plan,
    status: entitlements.status,
    currentPeriodStart: entitlements.currentPeriodStart,
    currentPeriodEnd: entitlements.currentPeriodEnd,
  };
});
