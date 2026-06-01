/**
 * DEMO PERMISSION RUNTIME PROOF & BACKFILL
 *
 * Protected endpoint (requires OPSIQ_DIAGNOSTIC_KEY) that:
 * 1. GET: Proves demo user permission state in the exact deployed runtime
 * 2. POST: Idempotently backfills missing UserRoleAssignment in same database
 *
 * Purpose: Close permission gap without depending on external seed workflows.
 * Uses: Same database and capability registry as /api/engagements.
 * Safety: Idempotent, fail-closed, no destructive writes, no duplicate roles.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { UserRoleAssignment } from "@/generated/prisma/client";
import { ROLES } from "@/domain/constants/roles";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { logger } from "@/infra/logger";
import { verifyDiagnosticKeyFromRequest } from "@/lib/security/diagnostic-key";

const DEMO_USER_EMAIL = "operator@demo.local";

// Helper: Check if role grants engagement:view capability
function roleGrantsEngagementView(role: string): boolean {
  const capabilities = getCapabilitiesForRole(role as any);
  return capabilities.includes(CAPABILITIES.ENGAGEMENT_VIEW);
}

// Helper: Mask workspace ID for safe output
function maskId(id: string): string {
  if (id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

interface PermissionProofResponse {
  userFound: boolean;
  membershipFound: boolean;
  membershipActive: boolean;
  workspaceIdUuidLike: boolean;
  workspaceIdSample?: string;
  roleAssignmentFound: boolean;
  role?: string | null;
  roleAssignmentActive: boolean;
  roleGrantsEngagementView: boolean;
  policyContextHasEngagementView: boolean;
  classification:
    | "permission_ready"
    | "role_assignment_missing"
    | "membership_missing"
    | "workspace_id_invalid"
    | "policy_context_mismatch";
}

// GET: Prove current permission state
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  try {
    const correlationId = `demo-perm-${Date.now()}`;

    // 1. Find demo user
    const user = await db.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      logger.warn("[DEMO_PERMISSION_PROOF] User not found", { correlationId });
      return NextResponse.json(
        {
          userFound: false,
          membershipFound: false,
          membershipActive: false,
          workspaceIdUuidLike: false,
          roleAssignmentFound: false,
          roleAssignmentActive: false,
          roleGrantsEngagementView: false,
          policyContextHasEngagementView: false,
          classification: "membership_missing",
        } as PermissionProofResponse,
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
      logger.warn("[DEMO_PERMISSION_PROOF] Membership not found", {
        correlationId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          userFound: true,
          membershipFound: false,
          membershipActive: false,
          workspaceIdUuidLike: false,
          roleAssignmentFound: false,
          roleAssignmentActive: false,
          roleGrantsEngagementView: false,
          policyContextHasEngagementView: false,
          classification: "membership_missing",
        } as PermissionProofResponse,
        { status: 200 }
      );
    }

    // 3. Validate workspace ID is UUID-like
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const workspaceIdUuidLike = uuidRegex.test(membership.workspaceId);

    if (!workspaceIdUuidLike) {
      logger.warn("[DEMO_PERMISSION_PROOF] Workspace ID not UUID-like", {
        correlationId,
        workspaceId: membership.workspaceId,
      });
      return NextResponse.json(
        {
          userFound: true,
          membershipFound: true,
          membershipActive: true,
          workspaceIdUuidLike: false,
          workspaceIdSample: maskId(membership.workspaceId),
          roleAssignmentFound: false,
          roleAssignmentActive: false,
          roleGrantsEngagementView: false,
          policyContextHasEngagementView: false,
          classification: "workspace_id_invalid",
        } as PermissionProofResponse,
        { status: 200 }
      );
    }

    // 4. Check UserRoleAssignment
    const roleAssignment = await db.userRoleAssignment.findFirst({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: membership.workspaceId,
        role: "admin_or_portfolio_manager",
      },
    });

    const roleAssignmentFound = !!roleAssignment;
    const roleAssignmentActive = roleAssignment?.isActive ?? false;
    const adminRoleGrantsEngagementView = roleGrantsEngagementView("admin_or_portfolio_manager");

    // 5. Verify getPolicyContext resolves engagement:view
    // This simulates what canonical enforcement does
    const roleAssignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: membership.workspaceId,
        isActive: true,
        revokedAt: null,
      },
    });

    const hasEngagementViewFromRoles = roleAssignments.some((ra: UserRoleAssignment) =>
      getCapabilitiesForRole(ra.role as any).includes(CAPABILITIES.ENGAGEMENT_VIEW)
    );

    // Determine classification
    let classification: PermissionProofResponse["classification"];
    if (!roleAssignmentFound) {
      classification = "role_assignment_missing";
    } else if (!roleAssignmentActive) {
      classification = "role_assignment_missing";
    } else if (!hasEngagementViewFromRoles) {
      classification = "policy_context_mismatch";
    } else {
      classification = "permission_ready";
    }

    logger.debug("[DEMO_PERMISSION_PROOF] Permission state", {
      correlationId,
      userFound: true,
      membershipFound: true,
      roleAssignmentFound,
      roleAssignmentActive,
      hasEngagementView: hasEngagementViewFromRoles,
      classification,
    });

    return NextResponse.json(
      {
        userFound: true,
        membershipFound: true,
        membershipActive: membership.isActive,
        workspaceIdUuidLike: true,
        workspaceIdSample: maskId(membership.workspaceId),
        roleAssignmentFound,
        role: roleAssignment?.role ?? null,
        roleAssignmentActive,
        roleGrantsEngagementView: adminRoleGrantsEngagementView,
        policyContextHasEngagementView: hasEngagementViewFromRoles,
        classification,
      } as PermissionProofResponse,
      { status: 200 }
    );
  } catch (error) {
    logger.error("[DEMO_PERMISSION_PROOF] GET failed", error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        userFound: false,
        membershipFound: false,
        membershipActive: false,
        workspaceIdUuidLike: false,
        roleAssignmentFound: false,
        roleAssignmentActive: false,
        roleGrantsEngagementView: false,
        policyContextHasEngagementView: false,
        classification: "membership_missing",
      } as PermissionProofResponse,
      { status: 500 }
    );
  }
}

// POST: Idempotently backfill missing UserRoleAssignment
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyDiagnosticKeyFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  try {
    const correlationId = `demo-backfill-${Date.now()}`;

    // 1. Find demo user
    const user = await db.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      logger.warn("[DEMO_PERMISSION_BACKFILL] User not found", { correlationId });
      return NextResponse.json(
        {
          status: "failed",
          reason: "user_not_found",
          message: "Demo user not found",
        },
        { status: 400 }
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
      logger.warn("[DEMO_PERMISSION_BACKFILL] Membership not found", {
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

    // 3. Validate workspace ID is UUID-like
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(membership.workspaceId)) {
      logger.warn("[DEMO_PERMISSION_BACKFILL] Workspace ID not UUID-like", {
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

    // 4. Upsert UserRoleAssignment
    // Use updateOrCreate pattern: first try to find, then create if not exists
    let roleAssignment = await db.userRoleAssignment.findFirst({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: membership.workspaceId,
        role: "admin_or_portfolio_manager",
      },
    });

    if (!roleAssignment) {
      // Create new assignment
      roleAssignment = await db.userRoleAssignment.create({
        data: {
          id: require("crypto").randomUUID(),
          userId: user.id,
          role: "admin_or_portfolio_manager",
          scope: "workspace",
          scopeId: membership.workspaceId,
          grantedAt: new Date(),
          isActive: true,
        },
      });
      logger.info("[DEMO_PERMISSION_BACKFILL] Created role assignment", {
        correlationId,
        userId: user.id,
        role: roleAssignment.role,
      });
    } else if (!roleAssignment.isActive) {
      // Reactivate if was deactivated
      roleAssignment = await db.userRoleAssignment.update({
        where: { id: roleAssignment.id },
        data: { isActive: true, revokedAt: null },
      });
      logger.info("[DEMO_PERMISSION_BACKFILL] Reactivated role assignment", {
        correlationId,
        userId: user.id,
      });
    } else {
      logger.debug("[DEMO_PERMISSION_BACKFILL] Role assignment already exists and active", {
        correlationId,
        userId: user.id,
      });
    }

    // 5. Verify the result
    const roleAssignments = await db.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        scope: "workspace",
        scopeId: membership.workspaceId,
        isActive: true,
      },
    });

    const hasEngagementView = roleAssignments.some((ra: UserRoleAssignment) =>
      getCapabilitiesForRole(ra.role as any).includes(CAPABILITIES.ENGAGEMENT_VIEW)
    );

    // 6. Backfill engagementMembership for ENG-001 (required by dashboard route's assertEngagementAccess)
    const engagement = await db.engagement.findFirst({
      where: {
        code: "ENG-001",
        workspaceId: membership.workspaceId,
      },
    });

    let engagementMembershipBackfilled = false;
    if (engagement) {
      let engagementMembership = await db.engagementMembership.findFirst({
        where: {
          userId: user.id,
          engagementId: engagement.id,
        },
      });

      if (!engagementMembership) {
        // Create new membership
        engagementMembership = await db.engagementMembership.create({
          data: {
            id: require("crypto").randomUUID(),
            userId: user.id,
            engagementId: engagement.id,
            role: "member",
            joinedAt: new Date(),
            isActive: true,
          },
        });
        logger.info("[DEMO_PERMISSION_BACKFILL] Created engagement membership", {
          correlationId,
          userId: user.id,
          engagementId: engagement.id,
        });
        engagementMembershipBackfilled = true;
      } else if (!engagementMembership.isActive) {
        // Reactivate if deactivated
        await db.engagementMembership.update({
          where: { id: engagementMembership.id },
          data: { isActive: true },
        });
        logger.info("[DEMO_PERMISSION_BACKFILL] Reactivated engagement membership", {
          correlationId,
          userId: user.id,
          engagementId: engagement.id,
        });
        engagementMembershipBackfilled = true;
      } else {
        logger.debug("[DEMO_PERMISSION_BACKFILL] Engagement membership already exists and active", {
          correlationId,
          userId: user.id,
          engagementId: engagement.id,
        });
      }
    }

    logger.info("[DEMO_PERMISSION_BACKFILL] Backfill complete", {
      correlationId,
      roleAssignmentExists: true,
      roleAssignmentActive: true,
      hasEngagementView,
      engagementMembershipBackfilled,
    });

    return NextResponse.json(
      {
        status: "success",
        message: "Role assignment and engagement membership backfilled or already present",
        roleAssignmentActive: true,
        roleGrantsEngagementView: hasEngagementView,
        engagementMembershipBackfilled,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("[DEMO_PERMISSION_BACKFILL] POST failed", error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      {
        status: "failed",
        reason: "internal_error",
        message: "Failed to backfill role assignment",
      },
      { status: 500 }
    );
  }
}
