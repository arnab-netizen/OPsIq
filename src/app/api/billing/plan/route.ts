import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { resolveEntitlements } from "@/services/entitlement.service";
import { errorToResponse } from "@/infra/errors";

export async function GET(request: Request) {
  try {
    // Authenticate
    await withAuth();

    // Get workspaceId from header
    const nextRequest = request as NextRequest;
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    if (!workspaceId) {
      return errorToResponse(
        new Error("Workspace ID required (x-workspace-id header)")
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
