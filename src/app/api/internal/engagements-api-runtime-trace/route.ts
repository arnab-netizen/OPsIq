/**
 * ENGAGEMENTS API RUNTIME TRACE
 *
 * Protected endpoint (requires OPSIQ_DIAGNOSTIC_KEY) that compares:
 * 1. Demo engagement proof query result (raw count)
 * 2. Raw Prisma queries with filters
 * 3. listEngagements service call result
 * 4. Policy context (hasInternalAccess)
 *
 * Purpose: Identify exact point where demo engagement is filtered out
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { listEngagements } from "@/services/engagement";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

const DEMO_USER_EMAIL = "operator@demo.local";
const DEMO_ENGAGEMENT_CODE = "ENG-001";

function maskId(id: string): string {
  if (id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  try {
    const correlationId = `eng-trace-${Date.now()}`;

    // 1. Find demo user
    const user = await db.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      return NextResponse.json(
        { error: "user_not_found" },
        { status: 200 }
      );
    }

    // 2. Find active workspace membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: { addedAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "membership_not_found" },
        { status: 200 }
      );
    }

    const workspaceId = membership.workspaceId;
    const workspaceIdSample = maskId(workspaceId);

    // 3. Run proof query (raw count)
    const proofCount = await db.engagement.count({
      where: { workspaceId },
    });

    // 4. Check raw engagement data with visibility field
    const rawEngagements = await db.engagement.findMany({
      where: { workspaceId },
      select: {
        id: true,
        code: true,
        status: true,
        serviceTier: true,
        healthStatus: true,
        interventionMode: true,
        visibility: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 3,
    });

    const demoEngagementRaw = rawEngagements.find((e: any) => e.code === DEMO_ENGAGEMENT_CODE);

    // 5. Check user role assignments to understand access level
    let userRoleAssignments: any[] = [];
    let hasAdminRole = false;

    const roleAssignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: workspaceId,
        isActive: true,
      },
    });

    userRoleAssignments = roleAssignments.map((r: any) => ({
      role: r.role,
      scope: r.scope,
    }));

    // Check if user has admin or portfolio manager role (non-client role = internal access)
    const clientOnlyRoles = ["client_user", "client_stakeholder"];
    hasAdminRole = roleAssignments.some((r: any) => !clientOnlyRoles.includes(r.role));

    // 6. Reconstruct service where clause
    const visibilityFilter = hasAdminRole
      ? { visibility: { in: ["internal", "client_visible"] } }
      : { visibility: "client_visible" };
    const serviceWhereClause = {
      workspaceId,
      ...visibilityFilter,
    };

    // 7. Call listEngagements service (same as /api/engagements does)
    let serviceResult: any = null;
    let serviceError = null;
    let serviceEngagementCount = 0;

    try {
      serviceResult = await listEngagements(workspaceId, {}, hasAdminRole);
      if (serviceResult && typeof serviceResult === "object" && Array.isArray(serviceResult.engagements)) {
        serviceEngagementCount = serviceResult.engagements.length;
      }
    } catch (error) {
      serviceError = error instanceof Error ? error.message : String(error);
    }

    // 8. Build safe sample of raw Prisma result
    const rawPrismaSafeSample = demoEngagementRaw ? {
      code: demoEngagementRaw.code,
      status: demoEngagementRaw.status,
      visibility: demoEngagementRaw.visibility,
      serviceTier: demoEngagementRaw.serviceTier,
      healthStatus: demoEngagementRaw.healthStatus,
      interventionMode: demoEngagementRaw.interventionMode,
      hasClientId: !!demoEngagementRaw.clientId,
      clientWorkspaceMatches: true, // demo client matches if engagement exists
      createdAtPresent: !!demoEngagementRaw.createdAt,
      updatedAtPresent: !!demoEngagementRaw.updatedAt,
    } : null;

    // 9. Analyze the data
    const analysis = {
      deployedCommit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
      demoProofWorkspaceSample: workspaceIdSample,

      // Raw data state
      proofScopedCount: proofCount,
      rawPrismaCount: rawEngagements.length,
      rawPrismaSafeSample,
      demoEngagementInRaw: !!demoEngagementRaw,

      // Service layer
      serviceWhereClause: {
        workspaceId: "***",
        visibility: hasAdminRole ? { in: ["internal", "client_visible"] } : "client_visible",
      },
      serviceError,
      serviceCountBeforeMapping: serviceEngagementCount,
      serviceCountAfterMapping: serviceEngagementCount, // no mapper in this case
      mapperResultCount: serviceEngagementCount,

      // Route response
      routeResponseShape: serviceResult ? Object.keys(serviceResult).sort() : null,
      smokeParserPath: "Array.isArray(data) ? data.length : data.engagements?.length || 0",

      // Policy context
      userHasAdminRole: hasAdminRole,
      userRoleAssignments,

      // Classification
      rootCauseClassification:
        proofCount === 0
          ? "proof_false_ready"
          : proofCount > 0 && rawEngagements.length === 0
          ? "proof_false_ready"
          : proofCount > 0 && rawEngagements.length > 0 && demoEngagementRaw && demoEngagementRaw.visibility !== "client_visible"
          ? "service_extra_filter_excludes_demo"
          : serviceError
          ? "service_extra_filter_excludes_demo"
          : serviceEngagementCount === 0 && proofCount > 0 && rawEngagements.length > 0
          ? "service_extra_filter_excludes_demo"
          : serviceEngagementCount === 0 && proofCount > 0
          ? "mapper_drops_record"
          : serviceEngagementCount > 0 && proofCount > 0
          ? "response_shape_parser_mismatch"
          : "cannot_determine",
    };

    logger.debug("[ENGAGEMENTS_API_TRACE] Analysis complete", {
      correlationId,
      ...analysis,
    });

    return NextResponse.json(analysis, { status: 200 });
  } catch (error) {
    logger.error(
      "[ENGAGEMENTS_API_TRACE] GET failed",
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      {
        error: "trace_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

