import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { logger } from "@/infra/logger";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

interface DiagnosticResult {
  endpoint: string;
  timestamp: string;
  demoUserFound: boolean;
  workspaceMembershipFound: boolean;
  workspaceUuidLike: boolean;
  demoEngagementFound: boolean;
  engagementWorkspaceMatch: boolean;
  engagementAccessible: boolean;
  serviceCallSucceeded: boolean;
  returnedTopLevelKeysCount: number;
  returnedEmptyObject: boolean;
  errorName: string | null;
  safeErrorMessage: string | null;
  stackFileLine: string | null;
  classification: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify diagnostic key using timing-safe comparison
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  const result: DiagnosticResult = {
    endpoint: "/api/engagements/{demoId}/drift",
    timestamp: new Date().toISOString(),
    demoUserFound: false,
    workspaceMembershipFound: false,
    workspaceUuidLike: false,
    demoEngagementFound: false,
    engagementWorkspaceMatch: false,
    engagementAccessible: false,
    serviceCallSucceeded: false,
    returnedTopLevelKeysCount: 0,
    returnedEmptyObject: false,
    errorName: null,
    safeErrorMessage: null,
    stackFileLine: null,
    classification: "unknown",
  };

  try {
    // Find demo user
    const demoUser = await db.user.findFirst({
      where: { email: { contains: "demo" } },
    });
    result.demoUserFound = !!demoUser;

    if (!demoUser) {
      result.classification = "demo_user_not_found";
      return NextResponse.json(result);
    }

    // Find active workspace membership
    const workspaceMembership = await db.workspaceMembership.findFirst({
      where: {
        userId: demoUser.id,
        workspace: { isActive: true },
      },
      include: { workspace: true },
    });
    result.workspaceMembershipFound = !!workspaceMembership;

    if (!workspaceMembership) {
      result.classification = "no_active_workspace";
      return NextResponse.json(result);
    }

    // Check workspace UUID format
    const workspaceId = workspaceMembership.workspace.id;
    result.workspaceUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId);

    // Find demo engagement in this workspace
    const demoEngagement = await db.engagement.findFirst({
      where: {
        workspaceId,
        name: { contains: "demo" },
      },
    });
    result.demoEngagementFound = !!demoEngagement;

    if (!demoEngagement) {
      result.classification = "demo_engagement_not_found";
      return NextResponse.json(result);
    }

    // Verify workspace match
    result.engagementWorkspaceMatch = demoEngagement.workspaceId === workspaceId;

    // Check visibility (simplified - assuming demo user has access to demo engagement)
    result.engagementAccessible = true;

    // Call drift service directly
    let driftResult: any;
    try {
      driftResult = await detectExecutionDrift(demoEngagement.id, workspaceId);
      result.serviceCallSucceeded = true;

      if (driftResult && typeof driftResult === "object") {
        result.returnedTopLevelKeysCount = Object.keys(driftResult).length;
        result.returnedEmptyObject = Object.keys(driftResult).length === 0;
      }

      result.classification = "service_succeeded";
    } catch (serviceError) {
      result.serviceCallSucceeded = false;

      if (serviceError instanceof Error) {
        result.errorName = serviceError.name;
        result.safeErrorMessage = serviceError.message
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID")
          .substring(0, 200);

        // Extract safe file:line if available
        const stackMatch = serviceError.stack?.match(/at .+\((.+):(\d+):(\d+)\)/);
        if (stackMatch && stackMatch[1]) {
          const filePath = stackMatch[1];
          const isNodeModules = filePath.includes("node_modules");
          const isSrcFile = filePath.includes("/src/");
          if (!isNodeModules && isSrcFile) {
            result.stackFileLine = `${filePath.split("/").pop()}:${stackMatch[2]}`;
          }
        }
      }

      result.classification = "service_error";
    }

    return NextResponse.json(result);
  } catch (error) {
    result.classification = "diagnostic_error";
    if (error instanceof Error) {
      result.errorName = error.name;
      result.safeErrorMessage = error.message.substring(0, 200);
    }
    return NextResponse.json(result);
  }
}
