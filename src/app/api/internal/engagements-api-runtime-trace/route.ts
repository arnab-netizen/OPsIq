/**
 * ENGAGEMENTS API RUNTIME TRACE
 *
 * Protected endpoint (requires OPSIQ_DIAGNOSTIC_KEY) that compares:
 * 1. Demo engagement proof query result
 * 2. Raw Prisma queries with different filters
 * 3. listEngagements service call
 * 4. /api/engagements route response
 *
 * Purpose: Identify exact point where demo engagement is filtered out
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { listEngagements } from "@/services/engagement";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const DEMO_USER_EMAIL = "operator@demo.local";
const DEMO_ENGAGEMENT_CODE = "ENG-001";

function verifyDiagnosticKey(request: NextRequest): boolean {
  const providedKey = request.headers.get("x-opsiq-diagnostic-key");
  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  if (!providedKey || !expectedKey) {
    return false;
  }

  return providedKey === expectedKey;
}

function maskId(id: string): string {
  if (id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyDiagnosticKey(request)) {
    return new NextResponse(null, { status: 404 });
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

    // 3. Run proof query (same as demo-engagement-proof GET)
    const proofCount = await db.engagement.count({
      where: { workspaceId },
    });

    // 4. Check raw engagement data
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

    // 5. Try to call listEngagements service directly
    let serviceCount = 0;
    let serviceEngagements: any[] = [];
    let serviceError = null;

    try {
      // Simulate non-admin access (same as demo user without internal access)
      const result = await listEngagements(workspaceId, {}, false);
      if (Array.isArray(result)) {
        serviceCount = result.length;
        serviceEngagements = result.slice(0, 3);
      }
    } catch (error) {
      serviceError = error instanceof Error ? error.message : String(error);
    }

    // 6. Analyze the data
    const proofEngagement = rawEngagements.find((e: any) => e.code === DEMO_ENGAGEMENT_CODE);

    const analysis = {
      workspaceIdSample,
      proofCount,
      rawEngagementsCount: rawEngagements.length,
      rawEngagements: rawEngagements.map((e: any) => ({
        code: e.code,
        status: e.status,
        visibility: e.visibility,
        serviceTier: e.serviceTier,
        healthStatus: e.healthStatus,
      })),
      demoEngagementInRaw: !!proofEngagement,
      demoEngagementVisibility: proofEngagement?.visibility || null,
      serviceCountResult: serviceCount,
      serviceError,
      serviceEngagementsCount: serviceEngagements.length,
      serviceEngagementsSample: serviceEngagements.slice(0, 2).map((e: any) => ({
        code: e.code || e.engagement?.code,
        status: e.status || e.engagement?.status,
      })),
      rootCauseClassification:
        proofCount === 0
          ? "no_engagement_in_database"
          : proofCount > 0 && serviceCount === 0 && rawEngagements.length > 0
          ? "service_filter_excludes_engagement"
          : proofCount > 0 && serviceCount > 0
          ? "response_or_parser_issue"
          : "unknown",
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
