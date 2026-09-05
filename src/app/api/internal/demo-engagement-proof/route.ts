/**
 * DEMO ENGAGEMENT RUNTIME PROOF & BACKFILL
 *
 * Protected endpoint (requires OPSIQ_DIAGNOSTIC_KEY) that:
 * 1. GET: Proves demo engagement data state in the exact deployed runtime
 * 2. POST: Idempotently backfills missing/mislinked demo engagement in same database
 *
 * Purpose: Close demo data gap without depending on external seed workflows.
 * Uses: Same database and schema as /api/engagements.
 * Safety: Idempotent, fail-closed, no destructive writes, transaction-protected.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { randomUUID } from "crypto";
import { verifyDiagnosticKeyFromRequest, isNonProductionEnvironment } from "@/lib/security/diagnostic-key";

const DEMO_USER_EMAIL = "operator@demo.local";
const DEMO_ENGAGEMENT_CODE = "ENG-001";
const DEMO_CLIENT_NAME = "Demo Manufacturing Corp";

// Helper: Mask ID for safe output
function maskId(id: string): string {
  if (id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

interface DemoEngagementProofResponse {
  userFound: boolean;
  membershipFound: boolean;
  workspaceIdUuidLike: boolean;
  workspaceIdSample?: string;
  scopedEngagementCount: number;
  totalEngagementCount: number;
  demoEngagementFound: boolean;
  duplicateDemoEngagementCandidates: boolean;
  demoEngagementWorkspaceMatches: boolean;
  demoEngagementVisibility?: string;
  demoEngagementVisibilityCorrect?: boolean;
  demoEngagementMembershipFound?: boolean;
  demoEngagementMembershipActive?: boolean;
  demoClientFound: boolean;
  demoClientWorkspaceMatches: boolean;
  dashboardAccessReady?: boolean;
  driftAccessReady?: boolean;
  classification:
    | "demo_data_ready"
    | "demo_engagement_missing"
    | "demo_engagement_wrong_workspace"
    | "demo_engagement_visibility_wrong"
    | "demo_engagement_membership_missing"
    | "demo_engagement_membership_inactive"
    | "demo_client_missing"
    | "duplicate_demo_engagement_candidates"
    | "membership_missing"
    | "workspace_id_invalid"
    | "diagnostic_key_missing_in_runtime";
}

// GET: Prove current demo engagement state
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  try {
    const correlationId = `demo-eng-${Date.now()}`;

    // 1. Find demo user
    const user = await db.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      logger.warn("[DEMO_ENGAGEMENT_PROOF] User not found", { correlationId });
      return NextResponse.json(
        {
          userFound: false,
          membershipFound: false,
          workspaceIdUuidLike: false,
          scopedEngagementCount: 0,
          totalEngagementCount: 0,
          demoEngagementFound: false,
          duplicateDemoEngagementCandidates: false,
          demoEngagementWorkspaceMatches: false,
          demoClientFound: false,
          demoClientWorkspaceMatches: false,
          classification: "membership_missing",
        } as DemoEngagementProofResponse,
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
      logger.warn("[DEMO_ENGAGEMENT_PROOF] Membership not found", {
        correlationId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          userFound: true,
          membershipFound: false,
          workspaceIdUuidLike: false,
          scopedEngagementCount: 0,
          totalEngagementCount: 0,
          demoEngagementFound: false,
          duplicateDemoEngagementCandidates: false,
          demoEngagementWorkspaceMatches: false,
          demoClientFound: false,
          demoClientWorkspaceMatches: false,
          classification: "membership_missing",
        } as DemoEngagementProofResponse,
        { status: 200 }
      );
    }

    // 3. Validate workspace ID is UUID-like
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const workspaceIdUuidLike = uuidRegex.test(membership.workspaceId);

    if (!workspaceIdUuidLike) {
      logger.warn("[DEMO_ENGAGEMENT_PROOF] Workspace ID not UUID-like", {
        correlationId,
        workspaceId: membership.workspaceId,
      });
      return NextResponse.json(
        {
          userFound: true,
          membershipFound: true,
          workspaceIdUuidLike: false,
          workspaceIdSample: maskId(membership.workspaceId),
          scopedEngagementCount: 0,
          totalEngagementCount: 0,
          demoEngagementFound: false,
          duplicateDemoEngagementCandidates: false,
          demoEngagementWorkspaceMatches: false,
          demoClientFound: false,
          demoClientWorkspaceMatches: false,
          classification: "workspace_id_invalid",
        } as DemoEngagementProofResponse,
        { status: 200 }
      );
    }

    // 4. Count scoped and total engagements
    const scopedEngagementCount = await db.engagement.count({
      where: {
        workspaceId: membership.workspaceId,
      },
    });

    const totalEngagementCount = await db.engagement.count();

    // 5. Find demo engagement by stable code identifier
    const demoEngagementCandidates = await db.engagement.findMany({
      where: {
        code: DEMO_ENGAGEMENT_CODE,
      },
    });

    const duplicateCandidates = demoEngagementCandidates.length > 1;
    const demoEngagement = demoEngagementCandidates.length === 1 ? demoEngagementCandidates[0] : null;

    // 6. Check if demo engagement workspace matches
    const demoEngagementWorkspaceMatches =
      !!demoEngagement && demoEngagement.workspaceId === membership.workspaceId;

    // 6.5 Check if demo engagement has correct visibility for API access
    const demoEngagementVisibilityCorrect =
      !!demoEngagement && demoEngagement.visibility === "client_visible";

    // 7. Check demo client
    const demoClient = await db.clientAccount.findFirst({
      where: {
        name: DEMO_CLIENT_NAME,
      },
    });

    // Client workspace match: check if demo engagement (if exists) links to demo client
    const demoClientWorkspaceMatches =
      !!demoClient &&
      !!demoEngagement &&
      demoEngagement.clientId === demoClient.id;

    // 8. Check demo engagement membership (required by assertEngagementAccess)
    let demoEngagementMembershipFound = false;
    let demoEngagementMembershipActive = false;
    let dashboardAccessReady = false;
    let driftAccessReady = false;

    if (demoEngagement) {
      const engagementMembership = await db.engagementMembership.findFirst({
        where: {
          userId: user.id,
          engagementId: demoEngagement.id,
          isActive: true,
        },
      });

      demoEngagementMembershipFound = !!engagementMembership;
      demoEngagementMembershipActive = !!engagementMembership;
      dashboardAccessReady = demoEngagementWorkspaceMatches && demoEngagementVisibilityCorrect && demoEngagementMembershipActive;
      driftAccessReady = dashboardAccessReady;
    }

    // Determine classification
    let classification: DemoEngagementProofResponse["classification"];

    if (duplicateCandidates) {
      classification = "duplicate_demo_engagement_candidates";
    } else if (!demoClient) {
      classification = "demo_client_missing";
    } else if (!demoEngagement) {
      classification = "demo_engagement_missing";
    } else if (!demoEngagementWorkspaceMatches) {
      classification = "demo_engagement_wrong_workspace";
    } else if (!demoEngagementVisibilityCorrect) {
      classification = "demo_engagement_visibility_wrong";
    } else if (!demoEngagementMembershipFound) {
      classification = "demo_engagement_membership_missing";
    } else if (!demoEngagementMembershipActive) {
      classification = "demo_engagement_membership_inactive";
    } else {
      classification = "demo_data_ready";
    }

    logger.debug("[DEMO_ENGAGEMENT_PROOF] Engagement proof state", {
      correlationId,
      userFound: true,
      membershipFound: true,
      workspaceIdUuidLike: true,
      scopedEngagementCount,
      totalEngagementCount,
      demoEngagementFound: !!demoEngagement,
      duplicateCandidates,
      demoEngagementWorkspaceMatches,
      demoEngagementMembershipFound,
      demoEngagementMembershipActive,
      demoClientFound: !!demoClient,
      demoClientWorkspaceMatches,
      dashboardAccessReady,
      driftAccessReady,
      classification,
    });

    return NextResponse.json(
      {
        userFound: true,
        membershipFound: true,
        workspaceIdUuidLike: true,
        workspaceIdSample: maskId(membership.workspaceId),
        scopedEngagementCount,
        totalEngagementCount,
        demoEngagementFound: !!demoEngagement,
        duplicateDemoEngagementCandidates: duplicateCandidates,
        demoEngagementWorkspaceMatches,
        demoEngagementVisibility: demoEngagement?.visibility,
        demoEngagementVisibilityCorrect: demoEngagementVisibilityCorrect,
        demoEngagementMembershipFound,
        demoEngagementMembershipActive,
        demoClientFound: !!demoClient,
        demoClientWorkspaceMatches,
        dashboardAccessReady,
        driftAccessReady,
        classification,
      } as DemoEngagementProofResponse,
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      "[DEMO_ENGAGEMENT_PROOF] GET failed",
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      {
        userFound: false,
        membershipFound: false,
        workspaceIdUuidLike: false,
        scopedEngagementCount: 0,
        totalEngagementCount: 0,
        demoEngagementFound: false,
        duplicateDemoEngagementCandidates: false,
        demoEngagementWorkspaceMatches: false,
        demoClientFound: false,
        demoClientWorkspaceMatches: false,
        classification: "membership_missing",
      } as DemoEngagementProofResponse,
      { status: 500 }
    );
  }
}

// Helper: Sanitize error message (replace UUIDs and secrets)
function sanitizeErrorMessage(msg: string): string {
  let sanitized = msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID");
  const diagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
  if (diagnosticKey && diagnosticKey.length > 0) {
    sanitized = sanitized.replace(new RegExp(diagnosticKey, "g"), "DIAGNOSTIC_KEY");
  }
  return sanitized;
}

// Helper: Extract stack file:line
function extractStackFileLine(stack: string): string {
  const lines = stack.split("\n");
  for (const line of lines) {
    const match = line.match(/\(([^)]+):(\d+):(\d+)\)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  return "unknown";
}

// Helper: Classify Prisma error code
function classifyPrismaError(code: string, errorMsg: string): string {
  if (code === "P2002") {
    return "duplicate_unique_constraint";
  }
  if (code === "P2025") {
    return "not_found";
  }
  if (code === "P2014") {
    return "wrong_relation_connect";
  }
  if (code === "P2012") {
    return "missing_required_field";
  }
  const lowerMsg = errorMsg.toLowerCase();
  if (lowerMsg.includes("unknown argument") || lowerMsg.includes("unknown field")) {
    return "invalid_field_name";
  }
  if (lowerMsg.includes("missing the required argument")) {
    return "missing_required_field";
  }
  if (lowerMsg.includes("relation")) {
    return "wrong_relation_connect";
  }
  return "cannot_determine";
}

// POST: Idempotently backfill missing/mislinked demo engagement
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Open-beta hardening: this is a real database writer (creates/relinks
  // Engagement, ClientAccount, EngagementMembership rows). It must never be
  // reachable in production merely because the shared OPSIQ_DIAGNOSTIC_KEY
  // leaked — see isNonProductionEnvironment's own doc comment. 404, not 401,
  // so its existence is not disclosed in production either.
  if (!isNonProductionEnvironment()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  const correlationId = `demo-eng-backfill-${Date.now()}`;
  let backfillStage = "initial";

  try {
    backfillStage = "resolve_demo_user";
    // 1. Find demo user
    const user = await db.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      logger.warn("[DEMO_ENGAGEMENT_BACKFILL] User not found", { correlationId });
      return NextResponse.json(
        {
          status: "failed",
          reason: "user_not_found",
          message: "Demo user not found",
        },
        { status: 400 }
      );
    }

    backfillStage = "resolve_workspace_membership";
    // 2. Find active workspace membership
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: { addedAt: "asc" },
    });

    if (!membership) {
      logger.warn("[DEMO_ENGAGEMENT_BACKFILL] Membership not found", {
        correlationId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          status: "failed",
          reason: "membership_not_found",
          message: "No active workspace membership found",
        },
        { status: 400 }
      );
    }

    backfillStage = "resolve_demo_engagement";
    // 3. Validate workspace ID is UUID-like
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(membership.workspaceId)) {
      logger.warn("[DEMO_ENGAGEMENT_BACKFILL] Workspace ID not UUID-like", {
        correlationId,
        workspaceId: membership.workspaceId,
      });
      return NextResponse.json(
        {
          status: "failed",
          reason: "workspace_id_invalid",
          message: "Workspace ID is not UUID-like format",
        },
        { status: 400 }
      );
    }

    // 4. Use transaction for all operations
    const result = await db.$transaction(async (tx: any) => {
      // Re-read proof state within transaction
      const demoEngagementCandidates = await tx.engagement.findMany({
        where: {
          code: DEMO_ENGAGEMENT_CODE,
        },
      });

      if (demoEngagementCandidates.length > 1) {
        throw new Error("DUPLICATE_DEMO_ENGAGEMENT_CANDIDATES");
      }

      let demoClient = await tx.clientAccount.findFirst({
        where: {
          name: DEMO_CLIENT_NAME,
        },
      });

      // Create or reuse demo client
      if (!demoClient) {
        demoClient = await tx.clientAccount.create({
          data: {
            id: randomUUID(),
            workspaceId: membership.workspaceId,
            name: DEMO_CLIENT_NAME,
            legalName: "Demo Manufacturing Corporation",
            industry: "Manufacturing",
            size: "medium",
            status: "active",
            website: "https://demo-mfg.example.com",
            address: "123 Industrial Ave, Factory City, ST 12345",
            updatedAt: new Date(),
          },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Created demo client", {
          correlationId,
        });
      }

      let demoEngagement = demoEngagementCandidates.length === 1 ? demoEngagementCandidates[0] : null;

      if (!demoEngagement) {
        // Create new demo engagement
        demoEngagement = await tx.engagement.create({
          data: {
            id: randomUUID(),
            code: DEMO_ENGAGEMENT_CODE,
            title: "Operational Excellence Initiative",
            clientId: demoClient.id,
            workspaceId: membership.workspaceId,
            serviceTier: "premium",
            engagementMode: "expert",
            status: "active",
            healthStatus: "at_risk",
            interventionMode: "recovery",
            interventionPhase: "implementation",
            description:
              "Comprehensive intervention to improve operational efficiency and profitability",
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            targetEndDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
            visibility: "client_visible",
            updatedAt: new Date(),
          },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Created demo engagement", {
          correlationId,
        });
        return { action: "created", engagement: demoEngagement };
      } else if (demoEngagement.workspaceId !== membership.workspaceId) {
        // Relink known demo engagement to correct workspace
        demoEngagement = await tx.engagement.update({
          where: { id: demoEngagement.id },
          data: {
            workspaceId: membership.workspaceId,
            clientId: demoClient.id,
            visibility: "client_visible",
            updatedAt: new Date(),
          },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Relinked demo engagement workspace", {
          correlationId,
        });
        return { action: "relinked_known_demo", engagement: demoEngagement };
      } else if (demoEngagement.visibility !== "client_visible") {
        // Engagement is scoped correctly but has wrong visibility
        demoEngagement = await tx.engagement.update({
          where: { id: demoEngagement.id },
          data: {
            visibility: "client_visible",
            updatedAt: new Date(),
          },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Fixed demo engagement visibility", {
          correlationId,
        });
        return { action: "fixed_visibility", engagement: demoEngagement };
      } else {
        // Already correct
        logger.debug("[DEMO_ENGAGEMENT_BACKFILL] Demo engagement already ready", {
          correlationId,
        });
        demoEngagement = demoEngagementCandidates[0];
      }

      backfillStage = "inspect_existing_engagement_membership";
      // 5. Ensure engagement membership exists (required by assertEngagementAccess)
      const engagementMembership = await tx.engagementMembership.findFirst({
        where: {
          userId: user.id,
          engagementId: demoEngagement.id,
          role: "lead",
        },
      });

      if (!engagementMembership) {
        backfillStage = "create_engagement_membership";
        // Create engagement membership with specific role
        await tx.engagementMembership.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            engagementId: demoEngagement.id,
            role: "lead",
            addedBy: user.id,
            addedAt: new Date(),
            isActive: true,
          },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Created engagement membership", {
          correlationId,
          userId: user.id,
          engagementId: demoEngagement.id,
        });
      } else if (!engagementMembership.isActive) {
        backfillStage = "activate_engagement_membership";
        // Reactivate if was deactivated
        await tx.engagementMembership.update({
          where: { id: engagementMembership.id },
          data: { isActive: true },
        });
        logger.info("[DEMO_ENGAGEMENT_BACKFILL] Reactivated engagement membership", {
          correlationId,
          userId: user.id,
          engagementId: demoEngagement.id,
        });
      }

      return { action: "already_ready", engagement: demoEngagement };
    });

    backfillStage = "verify_after_backfill";
    logger.info("[DEMO_ENGAGEMENT_BACKFILL] Backfill complete", {
      correlationId,
      action: result.action,
    });

    return NextResponse.json(
      {
        status: "success",
        message: "Demo engagement backfilled or already present",
        backfillAction: result.action,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : typeof error;

    if (errorMsg === "DUPLICATE_DEMO_ENGAGEMENT_CANDIDATES") {
      logger.warn("[DEMO_ENGAGEMENT_BACKFILL] Duplicate demo engagement candidates", {
        correlationId,
      });
      return NextResponse.json(
        {
          status: "failed",
          reason: "duplicate_demo_engagement_candidates",
          message: "Cannot backfill: multiple demo engagement candidates exist",
        },
        { status: 400 }
      );
    }

    // Build safe error response
    let safeErrorMessage = sanitizeErrorMessage(errorMsg);
    let stackFileLine = "unknown";
    let classification = "cannot_determine";

    if (error instanceof Error && error.stack) {
      stackFileLine = extractStackFileLine(error.stack);
    }

    // Classify error
    if (errorName === "PrismaClientKnownRequestError") {
      const prismaError = error as any;
      classification = classifyPrismaError(prismaError.code, errorMsg);
    } else if (errorName === "PrismaClientValidationError") {
      classification = "invalid_field_name";
    } else if (errorMsg.includes("DUPLICATE_DEMO_ENGAGEMENT_CANDIDATES")) {
      classification = "duplicate_unique_constraint";
    }

    logger.error(
      "[DEMO_ENGAGEMENT_BACKFILL] POST failed",
      error instanceof Error ? error : new Error(String(error)),
      {
        correlationId,
        stage: backfillStage,
        classification,
      }
    );

    return NextResponse.json(
      {
        status: "failed",
        reason: "internal_error",
        backfillStage,
        errorName,
        safeErrorMessage: safeErrorMessage.slice(0, 500),
        stackFileLine,
        classification,
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
