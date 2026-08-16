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

/**
 * Bound for the session-lookup query below, matching the 5s budget
 * startup-orchestrator.ts's checkDatabase()/migration-readiness checks
 * already use for a single DB round trip on a possibly-cold connection.
 */
const SESSION_QUERY_TIMEOUT_MS = 5000;

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

  // P0-15 forensic finding: this was the one real, user-facing DB query on
  // the root cold-start path with no bespoke timeout and no error handling —
  // a slow/failed Neon connection here rode the raw pg.Pool 90s ceiling and
  // then surfaced as an unhandled render exception. Bounded + caught here,
  // exactly like every other DB-backed probe already does, with the SAME
  // fallback this function already uses for "no valid session found": null.
  // This is a fail-CLOSED change, not fail-open — a DB failure can only ever
  // produce the same "not authenticated" outcome this function already
  // returns for a missing/expired/revoked/inactive session; it can never
  // produce an authenticated result. No new security state is introduced.
  let session;
  try {
    session = await Promise.race([
      db.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Session lookup timed out after 5s")), SESSION_QUERY_TIMEOUT_MS)
      ),
    ]);
  } catch {
    // Transient/timeout/connection failure: treat exactly like "no session
    // found" below. Never inferred as authenticated.
    return null;
  }

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
      // M6: full deterministic order (workspaceId tiebreaker) so this matches the canonical wrapper's
      // workspace derivation exactly — a same-addedAt tie must resolve to the same workspace in both.
      orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
      // Phase 5C: select ONLY the column consumed (workspaceId). A bare/default select reads EVERY
      // workspace_memberships column, so under production schema drift (a newer nullable column missing
      // from the deployed DB — e.g. columns added by 20260625120000_owner_mode_execution_tables) Prisma
      // throws P2022 and every owner-facing route that resolves policy 500s. Narrowing is drift-safe and
      // behavior-preserving: only workspaceId is used below.
      select: { workspaceId: true },
    });
    resolvedWorkspaceId = membership?.workspaceId;
  }

  // Cannot determine policy without workspace scope
  if (!resolvedWorkspaceId) return null;

  // Verify user has membership in the target workspace
  const membership = await db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: resolvedWorkspaceId, userId: session.user.id } },
    // Phase 5C: select ONLY isActive (the sole field consumed). A default select would read every
    // workspace_memberships column and 500 under schema drift; this narrow read is drift-safe and
    // behavior-preserving.
    select: { isActive: true },
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
    engagementMemberships: engagementMemberships.map((em: any) => ({
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

/**
 * Revoke exactly one authenticated session.
 *
 * Takes the verified session identity rather than a bare string so a user id
 * can no longer be passed where a session id is required — the defect that
 * made logout return 500 (`prisma.session.update` raising P2025 because no
 * session row has an id equal to the actor's user id).
 *
 * Idempotent by construction: `updateMany` reports a count instead of throwing
 * when the row is absent or already revoked, so a repeated or racing logout is
 * a no-op rather than an error. Connection and other database failures still
 * propagate — only "nothing matched" is treated as success.
 *
 * Scoping the update to `revokedAt: null` also preserves the original
 * revocation timestamp when a session is revoked twice.
 *
 * @returns true when this call performed the revocation, false when the
 *          session was already revoked or no longer exists.
 */
export async function revokeSession(
  session: Pick<SessionInfo, "sessionId">,
  authContext: CanonicalAuthContext
): Promise<boolean> {
  const result = await db.session.updateMany({
    where: { id: session.sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
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
