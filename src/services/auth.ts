import { db } from "@/lib/db";
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

export async function getSession(): Promise<SessionInfo | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  const session = await db.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session) return null;

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

export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError("Valid session required");
  }
  return session;
}

export async function getPolicyContext(): Promise<PolicyContext | null> {
  const session = await getSession();
  if (!session) return null;

  const roleAssignments = await db.userRoleAssignment.findMany({
    where: { userId: session.user.id, isActive: true, revokedAt: null },
  });

  return {
    userId: session.user.id,
    roles: roleAssignments.map((ra: UserRoleAssignment) => ({
      role: ra.role as RoleName,
      scope: ra.scope,
      scopeId: ra.scopeId,
    })),
  };
}

export async function requirePolicyContext(): Promise<PolicyContext> {
  const ctx = await getPolicyContext();
  if (!ctx) {
    throw new UnauthorizedError("Authentication required");
  }
  return ctx;
}

export function getSessionDurationMs(): number {
  return SESSION_DURATION_MS;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}
