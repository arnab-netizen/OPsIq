import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@/generated/prisma/client';
import { PrivateModeRole } from '@/domain/private-mode/role-config';
import { PrivateModeRoleAccessService } from '@/services/private-mode/role-access.service';

/**
 * Private mode gate middleware.
 * Checks if user has private mode access with required role/features.
 * For Owner Mode dashboard, private mode is optional.
 * For Private Mode features, private mode is required.
 *
 * SECURITY (Phase 0 correction): the caller's PRIVATE-MODE ROLE is NEVER read
 * from a request header. A prior implementation trusted `x-private-mode-role`,
 * which let any client self-assign OWNER by sending a header. The role is now
 * resolved ONLY from the database (PrivateModeAccess, via
 * PrivateModeRoleAccessService.getUserRole), keyed on the workspace + the
 * upstream-verified user identity. Without a DB resolver the gate FAILS CLOSED.
 */

/**
 * Resolves a user's approved, non-revoked private-mode role for a workspace.
 * Backed by the real role-access service (DB). Returns null when the user has
 * no approved role — never derived from client-supplied headers.
 */
export type PrivateModeRoleResolver = (
  workspaceId: string,
  userId: string,
) => Promise<PrivateModeRole | null>;

export interface PrivateModeGateDeps {
  /**
   * DB-backed role resolver. When omitted the gate fails closed (no access),
   * so a route must explicitly wire the real service to grant private-mode access.
   */
  resolveRole?: PrivateModeRoleResolver;
}

/**
 * Build a DB-backed role resolver from a Prisma client. This is the wiring point
 * that connects the gate to the real PrivateModeRoleAccessService.
 */
export function createPrismaPrivateModeResolver(prisma: PrismaClient): PrivateModeRoleResolver {
  const service = new PrivateModeRoleAccessService(prisma);
  return (workspaceId: string, userId: string) => service.getUserRole(workspaceId, userId);
}

export interface PrivateModeGateOptions {
  /**
   * Required role to access endpoint (e.g., 'OWNER' for admin features).
   * If not specified, any approved role grants access.
   */
  requiredRole?: PrivateModeRole;

  /**
   * Required features to access endpoint.
   * User must have all specified features available.
   */
  requiredFeatures?: string[];

  /**
   * If true, private mode access is required. If false, optional.
   */
  required?: boolean;

  /**
   * If true, bypass check (for Owner Mode compatibility).
   */
  bypassPrivateMode?: boolean;
}

/**
 * Resolve private-mode access for a request.
 *
 * Identity (userId, workspaceId) is taken from the upstream-verified
 * `x-user-id` / `x-workspace-id` headers — the same identity channel the rest of
 * the middleware stack relies on (workspace/tier/idempotency enforcement). The
 * private-mode ROLE, however, is resolved ONLY from the database via the
 * provided resolver; the spoofable `x-private-mode-role` header is ignored.
 *
 * Fails closed: if identity is incomplete, or no DB resolver is supplied, or the
 * user has no approved role, access is denied (role null, hasAccess false).
 */
export async function getPrivateModeAccess(
  request: NextRequest,
  deps: PrivateModeGateDeps = {},
): Promise<{
  hasAccess: boolean;
  role: PrivateModeRole | null;
  workspaceId: string | null;
  userId: string | null;
}> {
  const userId = request.headers.get('x-user-id');
  const workspaceId = request.headers.get('x-workspace-id');

  // Fail closed on incomplete identity or when no DB resolver is wired.
  // The role is NEVER derived from a client header.
  if (!userId || !workspaceId || !deps.resolveRole) {
    return { hasAccess: false, role: null, workspaceId, userId };
  }

  const role = await deps.resolveRole(workspaceId, userId);

  return {
    hasAccess: role !== null,
    role,
    workspaceId,
    userId,
  };
}

/**
 * Middleware to enforce private mode access gate.
 * Returns 403 Forbidden if user lacks required access.
 */
export async function enforcePrivateModeGate(
  request: NextRequest,
  options: PrivateModeGateOptions = {},
  deps: PrivateModeGateDeps = {},
): Promise<NextResponse | null> {
  // Allow bypass for backward compatibility with Owner Mode
  if (options.bypassPrivateMode) {
    return null; // Continue to handler
  }

  // If private mode not required, allow access
  if (!options.required) {
    return null; // Continue to handler
  }

  // Check if user has private mode access (role resolved from DB, not headers)
  const access = await getPrivateModeAccess(request, deps);

  if (!access.hasAccess) {
    return NextResponse.json(
      {
        error: 'Private mode access required',
        code: 'PRIVATE_MODE_REQUIRED',
      },
      { status: 403 },
    );
  }

  // Check role requirement
  if (options.requiredRole && access.role !== options.requiredRole) {
    return NextResponse.json(
      {
        error: 'Insufficient role for this action',
        code: 'ROLE_INSUFFICIENT',
        required: options.requiredRole,
        actual: access.role,
      },
      { status: 403 },
    );
  }

  // Check feature requirements (in real impl, would use role-config)
  if (options.requiredFeatures && options.requiredFeatures.length > 0) {
    // For now, all approved roles get basic feature set
    // In production, check against PrivateModeRole feature sets
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error: 'Required features not available',
          code: 'FEATURES_UNAVAILABLE',
          required: options.requiredFeatures,
        },
        { status: 403 },
      );
    }
  }

  // All checks passed
  return null; // Continue to handler
}

/**
 * Utility to add private mode context to response headers.
 * Allows handlers to know about user's private mode status.
 */
export function addPrivateModeContext(
  response: NextResponse,
  context: {
    hasAccess: boolean;
    role: PrivateModeRole | null;
  },
): NextResponse {
  response.headers.set('x-private-mode-access', context.hasAccess ? 'true' : 'false');
  if (context.role) {
    response.headers.set('x-private-mode-role', context.role);
  }
  return response;
}

/**
 * Owner dashboard route gate.
 * For Owner Mode: allows public access (bypassPrivateMode=true)
 * For Private Mode features: requires private mode access
 * For private admin features: requires OWNER role
 *
 * This gate permits the existing Owner Mode dashboard to work unchanged,
 * while allowing private mode overlays for high-power features.
 */
export const OWNER_DASHBOARD_GATE: PrivateModeGateOptions = {
  required: false, // Owner Mode dashboard is public
  bypassPrivateMode: true, // Backward compatible
};

/**
 * Gate for private mode admin features (role management, learning logs).
 */
export const PRIVATE_ADMIN_GATE: PrivateModeGateOptions = {
  required: true,
  requiredRole: 'OWNER',
};

/**
 * Gate for private mode consultant features (simulation, growth intelligence).
 */
export const PRIVATE_CONSULTANT_GATE: PrivateModeGateOptions = {
  required: true,
  requiredFeatures: ['caseSimulationRunner', 'growthIntelligence'],
};

/**
 * Gate for private mode analyst features (data upload, analysis).
 */
export const PRIVATE_ANALYST_GATE: PrivateModeGateOptions = {
  required: true,
  requiredFeatures: ['fullDataUpload'],
};
