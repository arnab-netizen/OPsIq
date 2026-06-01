import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/infra/logger";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DIAGNOSTIC ENDPOINT - Protected proof that dashboard route works with demo data
 * Called only on dashboard 500 to diagnose root cause
 * Requires x-opsiq-diagnostic-key header matching env variable
 * Returns only safe diagnostic data, no full IDs or secrets
 */
export async function GET(request: NextRequest) {
  // Verify diagnostic key using timing-safe comparison
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const response: Record<string, any> = {
    userFound: false,
    membershipFound: false,
    workspaceIdUuidLike: false,
    engagementFound: false,
    engagementWorkspaceMatches: false,
    engagementVisibility: null,
    hasClientId: false,
    serviceCallSucceeded: false,
    dashboardTopLevelKeys: [],
    dashboardEmptyObject: false,
    errorName: null,
    safeErrorMessage: null,
    stackFileLine: null,
    classification: "cannot_determine",
  };

  try {
    // Step 1: Find demo user
    const demoUser = await db.user.findFirst({
      where: { email: "operator@demo.local" },
    });

    if (!demoUser) {
      response.classification = "user_not_found";
      response.errorName = "UserNotFound";
      response.safeErrorMessage = "Demo user operator@demo.local not found in database";
      return NextResponse.json(response, { status: 200 });
    }
    response.userFound = true;

    // Step 2: Find active workspace membership for demo user
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId: demoUser.id,
        isActive: true,
      },
      orderBy: { addedAt: "asc" },
    });

    if (!membership) {
      response.classification = "membership_not_found";
      response.errorName = "MembershipNotFound";
      response.safeErrorMessage = "Demo user has no active workspace membership";
      return NextResponse.json(response, { status: 200 });
    }
    response.membershipFound = true;

    const workspaceId = membership.workspaceId;

    // Step 3: Validate workspaceId is UUID-like
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!workspaceId || !uuidRegex.test(workspaceId)) {
      response.classification = "workspace_id_invalid_format";
      response.errorName = "WorkspaceIdInvalid";
      response.safeErrorMessage = "Workspace ID is not a valid UUID";
      return NextResponse.json(response, { status: 200 });
    }
    response.workspaceIdUuidLike = true;

    // Step 4: Find ENG-001 engagement in same workspace
    const engagement = await db.engagement.findFirst({
      where: {
        code: "ENG-001",
        workspaceId: workspaceId,
      },
    });

    if (!engagement) {
      response.classification = "engagement_not_found";
      response.errorName = "EngagementNotFound";
      response.safeErrorMessage = "ENG-001 not found in workspace";
      return NextResponse.json(response, { status: 200 });
    }
    response.engagementFound = true;

    // Step 5: Confirm engagement workspace matches
    if (engagement.workspaceId !== workspaceId) {
      response.classification = "workspace_mismatch";
      response.errorName = "WorkspaceMismatch";
      response.safeErrorMessage = "Engagement workspace does not match membership workspace";
      return NextResponse.json(response, { status: 200 });
    }
    response.engagementWorkspaceMatches = true;

    // Step 6: Check visibility and clientId
    response.engagementVisibility = engagement.visibility || "unknown";
    response.hasClientId = Boolean(engagement.clientId);

    // Step 6.5: Check engagementMembership (required by route's assertEngagementAccess call)
    const engagementMembership = await db.engagementMembership.findFirst({
      where: {
        userId: demoUser.id,
        engagementId: engagement.id,
        isActive: true,
      },
    });

    const hasEngagementMembership = !!engagementMembership;

    if (!hasEngagementMembership) {
      response.classification = "engagement_membership_missing";
      response.errorName = "EngagementMembershipMissing";
      response.safeErrorMessage = "Demo user has no active membership in this engagement (required by assertEngagementAccess) - real route will return 403 before service call";
      return NextResponse.json(response, { status: 200 });
    }

    // Step 7: Call dashboard service (same path as route handler)
    // Create synthetic auth context mimicking the wrapped handler
    const syntheticContext = {
      verifiedActorId: demoUser.id,
      verifiedWorkspaceId: workspaceId,
      role: "owner", // Inferred from membership
    };

    logger.info("[DASHBOARD_DIAGNOSTIC] Calling getOwnerDashboard", {
      engagementCode: engagement.code,
      step: "service_call_start",
    });

    const dashboard = await getOwnerDashboard(
      engagement.id,
      syntheticContext as any,
      workspaceId
    );

    response.serviceCallSucceeded = true;

    // Step 8: Validate response
    if (!dashboard || typeof dashboard !== "object") {
      response.classification = "dashboard_response_invalid_type";
      response.errorName = "InvalidResponseType";
      response.safeErrorMessage = "Dashboard response is not an object";
      return NextResponse.json(response, { status: 200 });
    }

    // Check for empty object (should have data)
    const topKeys = Object.keys(dashboard);
    response.dashboardTopLevelKeys = topKeys;
    response.dashboardEmptyObject = topKeys.length === 0;

    if (topKeys.length === 0) {
      response.classification = "dashboard_response_empty_object";
      response.errorName = "EmptyDashboardResponse";
      response.safeErrorMessage = "Dashboard returned {} with no fields";
      return NextResponse.json(response, { status: 200 });
    }

    // Success: dashboard service returned valid data
    response.classification = "route_should_return_dashboard";

    logger.info("[DASHBOARD_DIAGNOSTIC] Service call succeeded", {
      step: "service_call_success",
      dashboardKeys: topKeys.length,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const errorObj = error as any;

    // Classify error safely
    response.errorName = errorObj?.name || "UnknownError";

    // Truncate and sanitize error message
    let safeMsg = errorObj?.message || "Unknown error";
    safeMsg = safeMsg
      .slice(0, 300) // Truncate
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID") // Hide UUIDs
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "EMAIL") // Hide emails
      .replace(/[0-9a-zA-Z]{20,}/g, "TOKEN"); // Hide potential tokens

    response.safeErrorMessage = safeMsg;

    // Extract safe stack info
    if (errorObj?.stack && typeof errorObj.stack === "string") {
      const lines = errorObj.stack.split("\n");
      for (const line of lines) {
        // Look for relevant service files
        if (
          line.includes("owner-dashboard.service") ||
          line.includes("decision-confidence") ||
          line.includes("business-impact") ||
          line.includes("execution-drift") ||
          line.includes("decision-control") ||
          line.includes("canonical-route-enforcement")
        ) {
          const match = line.match(/at\s+(\S+\.ts):(\d+):(\d+)/);
          if (match) {
            response.stackFileLine = `${match[1]}:${match[2]}`;
            break;
          }
        }
      }
    }

    // Classify based on error characteristics
    if (errorObj?.statusCode === 404) {
      response.classification = "not_found_error_404";
    } else if (errorObj?.statusCode === 403) {
      response.classification = "forbidden_error_403";
    } else if (
      errorObj?.name === "TypeError" ||
      (safeMsg && safeMsg.includes("cannot read") && safeMsg.includes("null"))
    ) {
      response.classification = "null_related_data_bug";
    } else if (
      errorObj?.name?.includes("Prisma") ||
      errorObj?.code?.startsWith("P")
    ) {
      response.classification = "service_runtime_exception";
    } else if (
      safeMsg.includes("workspaceId") ||
      safeMsg.includes("workspace") ||
      safeMsg.includes("capability")
    ) {
      response.classification = "capability_or_auth_error_misclassified_as_500";
    } else if (
      errorObj?.name === "ClassifiedApiError" ||
      errorObj?.statusCode
    ) {
      response.classification = "classified_error_import_bug";
    } else {
      response.classification = "service_runtime_exception";
    }

    logger.error("[DASHBOARD_DIAGNOSTIC] Service call failed", {
      step: "service_call_error",
      errorName: response.errorName,
      classification: response.classification,
      stackFileLine: response.stackFileLine,
    });

    return NextResponse.json(response, { status: 200 });
  }
}
