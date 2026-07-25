/**
 * PRIVATE MODE ENFORCEMENT — Option B route wrapper.
 *
 * Architecture rationale: root middleware.ts is Edge Runtime with zero DB access,
 * so private-mode role cannot be checked there. This wrapper runs inside route
 * handlers, after withCanonicalEnforcement has verified the session, workspace
 * membership, and actor identity. Only at that point do we look up the private-mode
 * role from the DB — keyed on VERIFIED identity (ctx.verifiedActorId,
 * ctx.verifiedWorkspaceId), never on caller-supplied headers.
 *
 * Identity note: ctx.verifiedWorkspaceId = Workspace.id.
 * PrivateModeAccess.workspaceId is a FK to ClientAccount.id.
 * For the private deployment, OPSIQ_PRIVATE_WORKSPACE_ID is used as both
 * Workspace.id and ClientAccount.id (same UUID), so the lookup works directly.
 */

import { NextResponse } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PrivateModeRoleAccessService } from "@/services/private-mode/role-access.service";
import type { PrivateModeRole } from "@/domain/private-mode/role-config";
import { hasRequiredFeatures } from "@/domain/private-mode/role-config";
import type { PrivateModeFeatures } from "@/domain/private-mode/role-config";
import { withCanonicalEnforcement, type CanonicalHandler } from "@/lib/canonical-route-enforcement";

export interface PrivateModeGateOptions {
  requiredRole?: PrivateModeRole;
  requiredFeatures?: string[];
  required?: boolean;
  bypassPrivateMode?: boolean;
}

export interface PrivateModeEnforcementDeps {
  prisma?: PrismaClient;
}

/**
 * Resolve a user's private-mode role from the database.
 * Takes pre-verified identity from the canonical context — never derives
 * identity from request headers.
 *
 * @param identity.workspaceId  Workspace.id from ctx.verifiedWorkspaceId (= ClientAccount.id in private deployment)
 * @param identity.userId       Actor ID from ctx.verifiedActorId
 * @param deps.prisma           Prisma client (defaults to shared db instance)
 */
export async function resolvePrivateModeRole(
  identity: { workspaceId: string; userId: string },
  deps: PrivateModeEnforcementDeps = {},
): Promise<PrivateModeRole | null> {
  const prismaClient = deps.prisma ?? db;
  const service = new PrivateModeRoleAccessService(prismaClient as PrismaClient);
  return service.getUserRole(identity.workspaceId, identity.userId);
}

/**
 * Route-level private-mode enforcement wrapper.
 *
 * Usage:
 *   export const GET = withPrivateModeEnforcement(
 *     async (ctx, params) => { ... },
 *     { requiredRole: 'OWNER' },
 *   );
 *
 * The handler is called ONLY when:
 * 1. Canonical auth passed (session valid, workspace membership confirmed)
 * 2. Private-mode role resolved from DB (not from any header)
 * 3. All role + feature requirements satisfied
 *
 * Failure modes:
 * - No approved PrivateModeAccess record → 403 PRIVATE_MODE_REQUIRED
 * - Role mismatch → 403 ROLE_INSUFFICIENT
 * - Missing required feature → 403 FEATURES_UNAVAILABLE
 * - No DB resolver wired / incomplete identity → 403 (via resolvePrivateModeRole returning null)
 */
export function withPrivateModeEnforcement(
  handler: CanonicalHandler,
  options: PrivateModeGateOptions = {},
  deps: PrivateModeEnforcementDeps = {},
): ReturnType<typeof withCanonicalEnforcement> {
  const enforcingHandler: CanonicalHandler = async (ctx, params) => {
    // Bypass: backward-compatible Owner Mode routes that do not require private mode
    if (options.bypassPrivateMode) {
      return handler(ctx, params);
    }

    // If private mode not required, skip the role check entirely
    if (!options.required && !options.requiredRole && !options.requiredFeatures?.length) {
      return handler(ctx, params);
    }

    // Resolve role from DB using VERIFIED identity from canonical context.
    // ctx.verifiedActorId and ctx.verifiedWorkspaceId come from withCanonicalEnforcement —
    // they are never caller-supplied headers.
    const role = await resolvePrivateModeRole(
      { workspaceId: ctx.verifiedWorkspaceId, userId: ctx.verifiedActorId },
      deps,
    );

    // When private mode is required, no approved role means no access
    if (options.required && role === null) {
      return NextResponse.json(
        { error: "Private mode access required", code: "PRIVATE_MODE_REQUIRED" },
        { status: 403 },
      );
    }

    // Role requirement: exact role match (only enforced if role was found)
    if (options.requiredRole && role !== options.requiredRole) {
      return NextResponse.json(
        {
          error: "Insufficient role for this action",
          code: "ROLE_INSUFFICIENT",
          required: options.requiredRole,
          actual: role,
        },
        { status: 403 },
      );
    }

    // Feature requirement: all required features must be present in the resolved role
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      if (role === null) {
        return NextResponse.json(
          { error: "Private mode access required", code: "PRIVATE_MODE_REQUIRED" },
          { status: 403 },
        );
      }
      const featureKeys = options.requiredFeatures as (keyof PrivateModeFeatures)[];
      if (!hasRequiredFeatures(role, featureKeys)) {
        return NextResponse.json(
          {
            error: "Required features not available",
            code: "FEATURES_UNAVAILABLE",
            required: options.requiredFeatures,
          },
          { status: 403 },
        );
      }
    }

    return handler(ctx, params);
  };

  return withCanonicalEnforcement(enforcingHandler, { requireWorkspace: true });
}
