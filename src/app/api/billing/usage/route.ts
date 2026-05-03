import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { resolveEntitlements } from "@/services/entitlement.service";
import { errorToResponse } from "@/infra/errors";

interface UsageDetail {
  key: string;
  current: number;
  limit: number | null;
  percentUsed: number | null;
  remaining: number | null;
}

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

    // Map capabilities with usage data
    const usageDetails: UsageDetail[] = entitlements.capabilities.map(
      (capability) => {
        const usage = entitlements.usage.find((u) => u.key === capability.key);
        const current = usage?.value || 0;
        const limit = capability.limit;

        let percentUsed: number | null = null;
        let remaining: number | null = null;

        if (limit !== null) {
          percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;
          remaining = Math.max(0, limit - current);
        }

        return {
          key: capability.key,
          current,
          limit,
          percentUsed,
          remaining,
        };
      }
    );

    return Response.json(
      {
        plan: {
          id: entitlements.plan.id,
          name: entitlements.plan.name,
        },
        period: {
          start: entitlements.currentPeriodStart,
          end: entitlements.currentPeriodEnd,
        },
        usage: usageDetails,
      },
      { status: 200 }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
