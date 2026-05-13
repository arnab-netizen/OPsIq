import { db, getDbInstance } from "@/lib/db";
import type { UserRoleAssignment } from "@/generated/prisma/client";
import { UnauthorizedError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { PolicyContext } from "@/policies/capability-check";
import type { RoleName } from "@/domain/constants/roles";
import { cookies } from "next/headers";

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

export async function getSession(workspaceId: string = "system"): Promise<SessionInfo | null> {
  // CRITICAL: Ensure database is initialized before ANY db access
  // This prevents the db Proxy from throwing "Database not initialized" errors
  await getDbInstance();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  const session = await db.session.findUnique({
    where: { token: sessionToken, user: { workspaceMemberships: { some: { workspaceId } } } },
    include: { user: true },
  });

  if (!session) return null;

  if (session.revokedAt) {
    logger.info("Session revoked", { sessionId: session.id });
    return null;
  }

  if (session.expiresAt < new Date()) {
    logger.info("Session expired", { sessionId: session.id });
    return null;
  }

  if (!session.user.isActive) {
    logger.warn("Inactive user attempted session use", {
      userId: session.user.id,
    });
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

export async function requireSession(workspaceId: string = "system"): Promise<SessionInfo> {
  const session = await getSession(workspaceId);
  if (!session) {
    throw new UnauthorizedError("Valid session required");
  }
  return session;
}

export async function getPolicyContext(workspaceId: string = "system"): Promise<PolicyContext | null> {
  // Ensure database is initialized (getSession does this too, but be explicit)
  await getDbInstance();

  const session = await getSession(workspaceId);
  if (!session) return null;

  const [roleAssignments, engagementMemberships] = await Promise.all([
    db.userRoleAssignment.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        revokedAt: null,
        scope: "workspace",
        scopeId: workspaceId,
      },
    }),
    db.engagementMembership.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        engagement: { workspaceId },
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
    engagementMemberships: engagementMemberships.map((em: any) => ({
      engagementId: em.engagementId,
      role: em.role as RoleName,
    })),
  };
}

export async function requirePolicyContext(workspaceId: string = "system"): Promise<PolicyContext> {
  const ctx = await getPolicyContext(workspaceId);
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
  authContext: any
): Promise<void> {
  const actorId = typeof authContext === "string" ? authContext : authContext.session.user.id;
  await db.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  logger.info("Session revoked", { sessionId, revokedBy: actorId });
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}
