import { db, getDbInstance } from "@/lib/db";
import type { UserRoleAssignment } from "@/generated/prisma/client";
import { UnauthorizedError } from "@/infra/errors";
import type { PolicyContext } from "@/policies/capability-check";
import type { RoleName } from "@/domain/constants/roles";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { cookies } from "next/headers";
import type { SessionFact, PolicyFact } from "@/lib/canonical-auth-facts";
import { buildSessionFact, buildPolicyFact } from "@/lib/canonical-auth-facts";
import { checkShadowRead } from "@/lib/runtime-shadow-read-enforcer";

const SESSION_COOKIE_NAME = "opsiq_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
}

export interface SessionInfo {
  user: AuthenticatedUser;
  sessionId: string;
  expiresAt: Date;
}

/**
 * PHASE A: Legacy Auth System - Now Pure Data Providers
 *
 * As of PHASE A, the legacy auth system is being transitioned to pure data providers.
 * All auth semantic decisions (status codes, error types, flow control) have moved to:
 * - Canonical wrapper: src/lib/canonical-route-enforcement.ts
 * - Facts system: src/lib/canonical-auth-facts.ts
 *
 * Legacy helpers still exist for backward compatibility and as data sources.
 * New code should use the facts-based functions instead of throwing versions.
 *
 * Throwing versions (requireSession, requirePolicyContext, etc.) will be deprecated
 * after PHASE F when legacy is fully stripped down.
 */

export async function getSession(): Promise<SessionInfo | null> {
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("getSession");

  // CRITICAL: Ensure database is initialized before ANY db access
  // This prevents the db Proxy from throwing "Database not initialized" errors
  await getDbInstance();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  const session = await db.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session) return null;

  if (session.revokedAt) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isActive: session.user.isActive,
    },
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

export async function requireSession(workspaceId?: string): Promise<SessionInfo> {
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("requireSession");

  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError("Valid session required");
  }
  return session;
}

export async function getPolicyContext(workspaceId?: string): Promise<PolicyContext | null> {
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("getPolicyContext");

  // Ensure database is initialized (getSession does this too, but be explicit)
  await getDbInstance();

  const session = await getSession();
  if (!session) return null;

  // If no explicit workspace provided, use user's first workspace membership
  let resolvedWorkspaceId = workspaceId;
  if (!resolvedWorkspaceId) {
    const membership = await db.workspaceMembership.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { addedAt: "asc" },
    });
    resolvedWorkspaceId = membership?.workspaceId;
  }

  // Cannot determine policy without workspace scope
  if (!resolvedWorkspaceId) return null;

  // Verify user has membership in the target workspace
  const membership = await db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: resolvedWorkspaceId, userId: session.user.id } },
  });

  if (!membership || !membership.isActive) return null;

  const [roleAssignments, engagementMemberships] = await Promise.all([
    db.userRoleAssignment.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        revokedAt: null,
        scope: "workspace",
        scopeId: resolvedWorkspaceId,
      },
    }),
    db.engagementMembership.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        engagement: { workspaceId: resolvedWorkspaceId },
      },
    }),
  ]);

  return {
    userId: session.user.id,
    roles: roleAssignments.map((ra: UserRoleAssignment) => ({
      role: ra.role as RoleName,
      scope: ra.scope,
      scopeId: ra.scopeId,
    })),
    engagementMemberships: engagementMemberships.map((em: unknown) => ({
      engagementId: em.engagementId,
      role: em.role as RoleName,
    })),
  };
}

export async function requirePolicyContext(workspaceId?: string): Promise<PolicyContext> {
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("requirePolicyContext");

  const ctx = await getPolicyContext(workspaceId || undefined);
  if (!ctx) {
    throw new UnauthorizedError("Authentication required");
  }
  return ctx;
}

export function getSessionDurationMs(): number {
  return SESSION_DURATION_MS;
}

export async function revokeSession(
  sessionId: string,
  authContext: CanonicalAuthContext
): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

// ─── PHASE A: Fact-Returning Versions (No Errors Thrown) ─────────────────────

/**
 * Get session and return raw facts (not throwing).
 * Used by canonical wrapper to evaluate auth state.
 */
export async function getSessionFact(workspaceId?: string): Promise<SessionFact> {
  const session = await getSession();

  if (!session) {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return buildSessionFact(null, "not_found");
    }

    return buildSessionFact(null, "not_found");
  }

  return buildSessionFact(session, undefined);
}

/**
 * Get policy context and return raw facts (not throwing).
 * Used by canonical wrapper to evaluate auth state.
 */
export async function getPolicyContextFact(workspaceId?: string): Promise<PolicyFact> {
  const policy = await getPolicyContext(workspaceId);

  if (!policy) {
    return buildPolicyFact(null, "not_found");
  }

  return buildPolicyFact(policy, undefined);
}
