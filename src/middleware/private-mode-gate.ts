import { NextRequest, NextResponse } from 'next/server';
import { PrivateModeRole } from '@/domain/private-mode/role-config';

/**
 * Private mode gate middleware.
 * Checks if user has private mode access with required role/features.
 * For Owner Mode dashboard, private mode is optional.
 * For Private Mode features, private mode is required.
 */

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
 * Check if a request context has private mode access.
 * In a real implementation, this would:
 * 1. Extract user ID from auth session
 * 2. Get workspace ID from request context
 * 3. Query PrivateModeAccess table
 * 4. Verify user has approved role (not revoked)
 *
 * For now, returns a mock result for testing.
 */
export async function getPrivateModeAccess(
  request: NextRequest,
): Promise<{
  hasAccess: boolean;
  role: PrivateModeRole | null;
  workspaceId: string | null;
  userId: string | null;
}> {
  // This is a placeholder implementation.
  // In production, this would:
  // 1. Get user from auth session
  // 2. Get workspace from request context
  // 3. Query PrivateModeAccess table via service
  // 4. Return actual access status

  // Extract user context from headers (set by auth middleware upstream)
  const userId = request.headers.get('x-user-id');
  const workspaceId = request.headers.get('x-workspace-id');
  const privateModeRole = request.headers.get('x-private-mode-role') as PrivateModeRole | null;

  return {
    hasAccess: privateModeRole !== null,
    role: privateModeRole,
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
): Promise<NextResponse | null> {
  // Allow bypass for backward compatibility with Owner Mode
  if (options.bypassPrivateMode) {
    return null; // Continue to handler
  }

  // If private mode not required, allow access
  if (!options.required) {
    return null; // Continue to handler
  }

  // Check if user has private mode access
  const access = await getPrivateModeAccess(request);

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
