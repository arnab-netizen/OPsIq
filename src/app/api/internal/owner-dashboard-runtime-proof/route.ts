/**
 * GET /api/internal/owner-dashboard-runtime-proof
 *
 * Protected diagnostic endpoint to verify owner dashboard succeeds for new signup owner.
 * Uses the exact same buildOwnerDashboardPayload as the real route.
 *
 * Protected by x-opsiq-diagnostic-key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { buildOwnerDashboardPayload } from "@/app/api/owner/dashboard/route";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

async function buildDiagnosticContext(latestUser: any, workspace: any): Promise<CanonicalAuthContext | null> {
  const membership = await db.workspaceMembership.findFirst({
    where: { userId: latestUser.id, workspaceId: workspace.id, isActive: true },
  });

  if (!membership) return null;

  return {
    verifiedActorId: latestUser.id,
    verifiedActorType: "user",
    verifiedActor: {
      id: latestUser.id,
      email: latestUser.email,
      name: latestUser.name,
      isActive: latestUser.isActive,
    },
    verifiedWorkspaceId: workspace.id,
    verifiedCapabilities: new Set(["owner:view"]),
    verifiedSessionSnapshot: {
      snapshotId: `snapshot-${Date.now()}`,
      snapshotTimestamp: new Date(),
      snapshotHash: "diagnostic-hash",
      actorId: latestUser.id,
      workspaceId: workspace.id,
      capabilities: ["owner:view"],
    },
    request: new NextRequest(new URL("http://localhost/api/owner/dashboard")),
  } as any;
}

export const GET = async (request: NextRequest) => {
  // Verify diagnostic key using timing-safe comparison
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  try {
    // Find latest smoke test user
    const latestUser = await db.user.findFirst({
      where: { email: { contains: "opsiq-smoke" } },
      orderBy: { createdAt: "desc" },
    });

    if (!latestUser) {
      return NextResponse.json({
        payloadBuilt: false,
        errorName: "UserNotFound",
        safeErrorMessage: "No test user found",
        failingStage: "user_resolution",
      });
    }

    // Find workspace
    const workspace = await db.workspace.findFirst({
      where: { createdBy: latestUser.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!workspace) {
      return NextResponse.json({
        payloadBuilt: false,
        errorName: "WorkspaceNotFound",
        safeErrorMessage: "No workspace found for user",
        failingStage: "workspace_resolution",
      });
    }

    // Build diagnostic context
    const ctx = await buildDiagnosticContext(latestUser, workspace);
    if (!ctx) {
      return NextResponse.json({
        payloadBuilt: false,
        errorName: "MembershipNotFound",
        safeErrorMessage: "User is not member of workspace",
        failingStage: "membership_resolution",
      });
    }

    // Call the exact same builder as the real route
    const payload = await buildOwnerDashboardPayload(ctx, workspace.id, latestUser.id);

    // Verify payload structure
    const payloadKeys = Object.keys(payload);
    const isArray = (val: any) => Array.isArray(val);
    const isSerializable = (() => {
      try {
        JSON.stringify(payload);
        return true;
      } catch {
        return false;
      }
    })();

    return NextResponse.json({
      payloadBuilt: true,
      payloadTopLevelKeys: payloadKeys,
      engagementCount: payload.engagementCount || 0,
      actionQueueSize: payload.actionQueueSize || 0,
      topRisksIsArray: isArray(payload.topRisks),
      recommendedActionsIsArray: isArray(payload.recommendedActions),
      responseSerializable: isSerializable,
      classification: "owner_dashboard_diagnostic_success",
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      payloadBuilt: false,
      errorName,
      safeErrorMessage: errorMessage,
      failingStage: "payload_builder_error",
      classification: "owner_dashboard_diagnostic_error",
    });
  }
};
