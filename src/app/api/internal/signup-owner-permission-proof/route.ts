/**
 * GET /api/internal/signup-owner-permission-proof
 *
 * Protected diagnostic endpoint to verify permission provisioning for new signup owners.
 * Traces: user → workspace → membership → role assignment → capability check → dashboard access
 *
 * Protected by x-opsiq-diagnostic-key header.
 * Returns safe diagnostic output only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasCapability } from "@/policies/capability-check";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import type { PolicyContext } from "@/policies/capability-check";
import type { UserRoleAssignment } from "@/generated/prisma/client";
import type { RoleName } from "@/domain/constants/roles";
import { ROLES } from "@/domain/constants/roles";

function maskId(id: string): string {
  if (!id || id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

export const GET = async (request: NextRequest) => {
  // Verify diagnostic key
  const diagnosticKey = request.headers.get("x-opsiq-diagnostic-key");
  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  if (!diagnosticKey || !expectedKey || diagnosticKey !== expectedKey) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 404, // 404 instead of 401 to keep diagnostic endpoint opaque
    });
  }

  try {
    // Find the most recently created user (likely the test user from smoke test)
    const latestUser = await db.user.findFirst({
      where: {
        email: {
          contains: "opsiq-smoke",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!latestUser) {
      return NextResponse.json({
        userFound: false,
        classification: "no_test_user_found",
        firstMissingRequirement: "user",
      });
    }

    // Get the user's workspace (from membership)
    const membership = await db.workspaceMembership.findFirst({
      where: {
        userId: latestUser.id,
        isActive: true,
      },
    });

    if (!membership) {
      return NextResponse.json({
        userFound: true,
        userIdMasked: maskId(latestUser.id),
        workspaceFound: false,
        workspaceMembershipFound: false,
        classification: "no_workspace_membership",
        firstMissingRequirement: "workspace_membership",
      });
    }

    const workspace = await db.workspace.findUnique({
      where: { id: membership.workspaceId },
    });

    // Get role assignments for this user in this workspace
    const scopedRoleAssignments = await db.userRoleAssignment.findMany({
      where: {
        userId: latestUser.id,
        scope: "workspace",
        scopeId: membership.workspaceId,
        isActive: true,
        revokedAt: null,
      },
    });

    // Build policy context from role assignments
    const policy: PolicyContext | null = scopedRoleAssignments.length > 0
      ? {
          userId: latestUser.id,
          roles: scopedRoleAssignments.map((ra: UserRoleAssignment) => ({
            role: ra.role as RoleName,
            scope: ra.scope,
            scopeId: ra.scopeId,
          })),
          engagementMemberships: [],
        }
      : null;

    // Check OWNER_VIEW capability
    const hasOwnerView = policy ? hasCapability(policy, CAPABILITIES.OWNER_VIEW) : false;

    // Get actual capabilities from the role
    const actualCapabilities: string[] = [];
    if (policy && policy.roles.length > 0) {
      for (const roleAssignment of policy.roles) {
        const caps = getCapabilitiesForRole(roleAssignment.role);
        actualCapabilities.push(...Array.from(caps));
      }
    }

    const uniqueCapabilities = Array.from(new Set(actualCapabilities));

    return NextResponse.json({
      userFound: true,
      userIdMasked: maskId(latestUser.id),
      workspaceFound: !!workspace,
      workspaceIdMasked: workspace ? maskId(workspace.id) : undefined,
      workspaceMembershipFound: !!membership,
      workspaceMembershipRole: membership?.role,
      userRoleAssignmentFound: scopedRoleAssignments.length > 0,
      userRoleAssignmentCount: scopedRoleAssignments.length,
      userRoleAssignments: scopedRoleAssignments.map((ra: UserRoleAssignment) => ({
        role: ra.role,
        scope: ra.scope,
        scopeId: ra.scopeId ? maskId(ra.scopeId) : undefined,
        isActive: ra.isActive,
      })),
      userRoleAssignmentScope: scopedRoleAssignments[0]?.scope,
      userRoleAssignmentWorkspaceMatches:
        scopedRoleAssignments.length > 0 &&
        scopedRoleAssignments[0]?.scopeId === membership?.workspaceId,
      OWNER_VIEW_in_role_capability_map: getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER).includes(
        CAPABILITIES.OWNER_VIEW
      ),
      actualCapabilitiesForUser: uniqueCapabilities.sort(),
      has_OWNER_VIEW: hasOwnerView,
      dashboardWouldPass: hasOwnerView,
      firstMissingRequirement: !hasOwnerView ? "OWNER_VIEW_capability" : undefined,
      classification: hasOwnerView ? "permission_provisioning_correct" : "permission_provisioning_incomplete",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        classification: "diagnostic_error",
        error: message,
      },
      { status: 500 }
    );
  }
};
