import {
  db,
  getDbInstance,
  getRawPool,
  withRawStatementTimeout,
  withRawStatementTimeoutWorstCaseMs,
  type RawQueryClient,
} from "@/lib/db";
import type { Prisma, UserRoleAssignment, EngagementMembership } from "@/generated/prisma/client";
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
 * Database-enforced bound for the session-lookup query below. Postgres
 * cancels the statement itself if exceeded, so a stalled connection can
 * never hold the shared pool's sole connection (max: 1) indefinitely — see
 * withRawStatementTimeout() in src/lib/db.ts.
 */
export const SESSION_STATEMENT_TIMEOUT_MS = 4000;

/**
 * F-PROD-STARTUP-COLDSTART second-mechanism forensic: getSession() no longer
 * goes through Prisma's interactive $transaction() (withStatementTimeout()) —
 * a per-caller audit found no multi-statement atomicity, snapshot, or
 * row-lock requirement for its single findUnique-with-join read (session
 * revocation/expiry are always separate prior-or-subsequent writes, never
 * expected to be observed atomically with this read; workspace resolution
 * always runs as its own later, independent query). It now uses
 * withRawStatementTimeout() — a raw pg client, inside its own explicit
 * BEGIN/SET LOCAL/COMMIT-or-ROLLBACK (F-PGBOUNCER-TXN-SAFETY, src/lib/db.ts)
 * — matching claimStartup()/checkDatabase()/checkMigrationReadiness(). This
 * outer JS-side race is a pure defensive backstop: it MUST stay longer than
 * withRawStatementTimeout()'s own real worst case
 * (withRawStatementTimeoutWorstCaseMs(), which already accounts for that
 * primitive's own two internal client-side backstops), so it can only ever
 * fire after the inner bound would already have settled — this is a read,
 * so there is no orphaned-write risk from the outer race abandoning the
 * caller either way, but a pure backstop that can never actually fire
 * first is strictly simpler to reason about than one that could. Derived
 * from the shared formula, not a hand-rolled copy, so the two can never
 * silently drift back out of sync the way an earlier version of this fix
 * did twice (caught by santa-loop adversarial review both times).
 */
export const SESSION_QUERY_TIMEOUT_MS = withRawStatementTimeoutWorstCaseMs(SESSION_STATEMENT_TIMEOUT_MS) + 3000;

/**
 * F-AUTH-ROOT-FAST-FAIL (database-review findings C1/H1, round 2): the
 * Postgres-side statement_timeout getPolicyContextForSession() uses when a
 * caller opts into options.statementTimeoutMs via this exact value.
 *
 * Round-1 of this fix used withStatementTimeout() (Prisma's interactive
 * $transaction()) for this. Database review (round 2) correctly rejected
 * that: $transaction()'s own `maxWait` (TRANSACTION_ACQUIRE_MAX_WAIT_MS,
 * 10s) races CONNECTION ACQUISITION independent of whether the pool's own
 * much longer connectionTimeoutMillis would have succeeded -- this is the
 * EXACT P2028 false-failure class db.ts's own doc comments document in
 * detail (see withStatementTimeout()'s header and the
 * fresh-connection-acquisition-hostile/startup-coldstart-pool-contention
 * forensics it cites) and the reason getSession(), claimStartup(),
 * checkDatabase(), and checkMigrationReadiness() all deliberately moved
 * OFF this exact mechanism already. Reusing it here would have
 * reintroduced that same already-fixed-elsewhere defect class for this one
 * new caller. Fixed by using withRawStatementTimeout() instead (below) --
 * the SAME raw-pg primitive getSession() itself uses, whose acquisition is
 * bounded only by the pool's own connectionTimeoutMillis, with no separate
 * Prisma-imposed maxWait ceiling to race.
 */
export const POLICY_CONTEXT_STATEMENT_TIMEOUT_MS = 4000;

/**
 * F-AUTH-ROOT-FAST-FAIL (database-review finding, round 3): runPolicyContextReadsRaw()
 * issues up to 4 sequential statements over the one checked-out connection
 * (resolve-default-workspace, verify-membership, role-assignments,
 * engagement-memberships) -- withRawStatementTimeout()'s own doc comment is
 * explicit that its DEFAULT client-side backstop margin
 * (CLIENT_SIDE_BACKSTOP_MARGIN_MS) assumes a single-statement `fn`; reusing
 * that default here would let a merely slow-but-healthy (never actually
 * hung) run of ordinary statements trip the backstop and have its
 * connection needlessly discarded. Sized for 4 statements' worth of the
 * SAME per-statement margin the primitive already uses as its
 * single-statement default, rather than an independently hand-picked
 * number.
 *
 * santa-loop review finding: computing this as `4 * CLIENT_SIDE_BACKSTOP_MARGIN_MS`
 * would require importing that constant from db.ts into this module's
 * TOP-LEVEL scope -- a new load-time dependency this file never had before,
 * which broke every pre-existing test that mocks "@/lib/db" without
 * anticipating a brand-new export (reproduced: get-session-db-resilience.test.ts
 * failed to even load). Hard-coded instead, with the derivation stated here
 * for traceability: db.ts's CLIENT_SIDE_BACKSTOP_MARGIN_MS is 5_000 as of
 * this writing, so 4 * 5_000 = 20_000. If that constant ever changes, update
 * this value to match -- intentionally NOT re-wired to a live import, so
 * this module's load-time dependency surface never again silently widens
 * onto every test file that mocks "@/lib/db".
 */
export const POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS = 20_000;

/** withRawStatementTimeout()'s real worst case for POLICY_CONTEXT_STATEMENT_TIMEOUT_MS with the multi-statement margin above, plus the same 3s outer-race margin SESSION_QUERY_TIMEOUT_MS uses. */
export const POLICY_CONTEXT_QUERY_TIMEOUT_MS =
  withRawStatementTimeoutWorstCaseMs(POLICY_CONTEXT_STATEMENT_TIMEOUT_MS, POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS) + 3000;

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

interface RawSessionRow {
  session_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_id: string;
  user_email: string;
  user_name: string | null;
  user_is_active: boolean;
}

export async function getSession(): Promise<SessionInfo | null> {
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("getSession");

  // F-ROOT-ROUTE-300S: cookie is read BEFORE any DB initialization. A request
  // with no session cookie (every anonymous visitor, including the public
  // landing page) has no session to look up, so it must never pay for pool
  // construction/connection at all -- getRawPool() below is a raw pg.Pool
  // accessor used only by the query that follows, not a general "warm the db
  // Proxy" call: db.ts's exported `db` Proxy already lazily self-initializes
  // on first property access for any OTHER caller that needs it.
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  // CRITICAL: Ensure database is initialized before the session-lookup query below.
  const pool = await getRawPool();

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
  //
  // F-PROD-STARTUP-COLDSTART second-mechanism forensic: this single
  // findUnique-with-join read no longer runs inside a Prisma interactive
  // transaction — see withRawStatementTimeout()'s own doc comment and
  // SESSION_QUERY_TIMEOUT_MS above for why. The single-statement JOIN below
  // is the exact equivalent of the prior `session.findUnique({ include:
  // { user: true } })`.
  let row: RawSessionRow | undefined;
  try {
    const result = await Promise.race([
      withRawStatementTimeout(
        pool,
        SESSION_STATEMENT_TIMEOUT_MS,
        (client) =>
          client.query<RawSessionRow>(
            `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
                    u.id AS user_id, u.email AS user_email, u.name AS user_name, u.is_active AS user_is_active
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.token = $1`,
            [sessionToken]
          ),
        "getSession"
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Session lookup timed out after ${SESSION_QUERY_TIMEOUT_MS}ms`)), SESSION_QUERY_TIMEOUT_MS)
      ),
    ]);
    row = result.rows[0];
  } catch {
    // Transient/timeout/connection failure: treat exactly like "no session
    // found" below. Never inferred as authenticated.
    return null;
  }

  if (!row) return null;

  if (row.revoked_at) {
    return null;
  }

  if (row.expires_at < new Date()) {
    return null;
  }

  if (!row.user_is_active) {
    return null;
  }

  return {
    user: {
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      isActive: row.user_is_active,
    },
    sessionId: row.session_id,
    expiresAt: row.expires_at,
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

  const session = await getSession();
  if (!session) return null;

  return getPolicyContextForSession(session, workspaceId);
}

/**
 * F-AUTH-ROOT-FAST-FAIL root-cause context (santa-loop review finding: this
 * comment previously, incorrectly, described THIS function as the bounded
 * one -- it is not). The four reads below run as plain Prisma ORM calls
 * with NO server-side statement_timeout at all -- unlike getSession()'s own
 * raw-SQL read. This is the UNBOUNDED default path: getPolicyContext() and
 * every other existing caller of getPolicyContextForSession() that omits
 * options.statementTimeoutMs runs through exactly this function, with its
 * EXACT pre-existing behavior (no new bound, no new failure mode) --
 * deliberately unchanged so this fix stays root-specific to the
 * authenticated root route rather than silently changing behavior for
 * every other authenticated route that resolves policy today (dashboard,
 * the authenticated layout, diagnosis-access, server-role...). The REAL,
 * server-cancelled, bounded equivalent is runPolicyContextReadsRaw() below,
 * reached only through getPolicyContextForSession()'s options.statementTimeoutMs
 * branch -- see that function's own doc comment for the actual fix.
 */
async function runPolicyContextReads(
  client: Pick<Prisma.TransactionClient, "workspaceMembership" | "userRoleAssignment" | "engagementMembership">,
  session: SessionInfo,
  workspaceId: string | undefined
): Promise<PolicyContext | null> {
  // If no explicit workspace provided, use user's first workspace membership
  let resolvedWorkspaceId = workspaceId;
  if (!resolvedWorkspaceId) {
    const membership = await client.workspaceMembership.findFirst({
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
  const membership = await client.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: resolvedWorkspaceId, userId: session.user.id } },
    // Phase 5C: select ONLY isActive and role (the fields consumed). A default select would read
    // every workspace_memberships column and 500 under schema drift; this narrow read is
    // drift-safe and behavior-preserving. `role` is added here (same query, no extra round trip)
    // so PolicyContext.workspaceRole can narrow ADMIN_OR_PORTFOLIO_MANAGER's self-serve-owner
    // capability set -- see capability-check.ts's OWNER_SCOPED_CAPABILITIES.
    select: { isActive: true, role: true },
  });

  if (!membership || !membership.isActive) return null;

  const [roleAssignments, engagementMemberships] = await Promise.all([
    client.userRoleAssignment.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
        revokedAt: null,
        scope: "workspace",
        scopeId: resolvedWorkspaceId,
      },
    }),
    client.engagementMembership.findMany({
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
    engagementMemberships: engagementMemberships.map((em: EngagementMembership) => ({
      engagementId: em.engagementId,
      role: em.role as RoleName,
    })),
    workspaceRole: membership.role,
  };
}

interface RawPolicyWorkspaceRow {
  workspace_id: string;
}
interface RawMembershipRow {
  is_active: boolean;
  role: string;
}
interface RawRoleAssignmentRow {
  role: string;
  scope: string | null;
  scope_id: string | null;
}
interface RawEngagementMembershipRow {
  engagement_id: string;
  role: string;
}

/**
 * F-AUTH-ROOT-FAST-FAIL root-cause closure (database-review finding, CRITICAL/HIGH):
 * runPolicyContextReads()'s four Prisma ORM calls carry NO server-side
 * statement_timeout at all -- unlike getSession()'s own raw-SQL read. A
 * caller that only races that unbounded path with a JS-side timeout (as
 * the authenticated root route's outer decision does) can abandon the
 * promise when the race times out, but cannot stop the query itself: on
 * production's max:1 pool, an abandoned query that never completes
 * server-side pins the process's SOLE connection until it eventually
 * settles on its own -- and if the function instance freezes/resumes in
 * the meantime (the documented P0-15 failure mode, see
 * attachDatabasePool()'s doc comment in db.ts), that connection may never
 * be released at all, starving every subsequent request on that warm
 * instance.
 *
 * This function is the real fix: the raw-SQL equivalent of
 * runPolicyContextReads() above, reached only through
 * getPolicyContextForSession()'s opt-in options.statementTimeoutMs branch,
 * run inside withRawStatementTimeout() -- the SAME raw-pg primitive
 * getSession() itself uses (NOT Prisma's interactive $transaction(), which
 * round 2 of this fix rejected after reintroducing a P2028-under-ordinary-
 * contention regression -- see POLICY_CONTEXT_QUERY_TIMEOUT_MS's doc
 * comment above). Postgres itself cancels the statement after
 * statementTimeoutMs, guaranteeing the connection returns to the pool (or
 * is discarded cleanly) regardless of what any caller's own outer race
 * decides to do.
 *
 * Deliberately a SEPARATE implementation from the Prisma-ORM version above
 * rather than a shared helper -- matching this file's/db.ts's own
 * established pattern of duplicating a few lines rather than threading two
 * very different client shapes (Prisma model delegates vs. a raw pg
 * client) through one function. Every WHERE clause below is the exact SQL
 * equivalent of its ORM counterpart; see runPolicyContextReads() for the
 * field-selection rationale comments (schema-drift resilience, etc.),
 * which apply identically here.
 */
async function runPolicyContextReadsRaw(
  client: RawQueryClient,
  session: SessionInfo,
  workspaceId: string | undefined
): Promise<PolicyContext | null> {
  let resolvedWorkspaceId = workspaceId;
  if (!resolvedWorkspaceId) {
    const result = await client.query<RawPolicyWorkspaceRow>(
      `SELECT workspace_id FROM workspace_memberships
       WHERE user_id = $1 AND is_active = true
       ORDER BY added_at ASC, workspace_id ASC
       LIMIT 1`,
      [session.user.id]
    );
    resolvedWorkspaceId = result.rows[0]?.workspace_id;
  }

  if (!resolvedWorkspaceId) return null;

  const membershipResult = await client.query<RawMembershipRow>(
    `SELECT is_active, role FROM workspace_memberships
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [resolvedWorkspaceId, session.user.id]
  );
  const membership = membershipResult.rows[0];
  if (!membership || !membership.is_active) return null;

  const [roleResult, engagementResult] = await Promise.all([
    client.query<RawRoleAssignmentRow>(
      `SELECT role, scope, scope_id FROM user_role_assignments
       WHERE user_id = $1 AND is_active = true AND revoked_at IS NULL AND scope = 'workspace' AND scope_id = $2`,
      [session.user.id, resolvedWorkspaceId]
    ),
    client.query<RawEngagementMembershipRow>(
      `SELECT em.engagement_id, em.role FROM engagement_memberships em
       JOIN engagements e ON e.id = em.engagement_id
       WHERE em.user_id = $1 AND em.is_active = true AND e.workspace_id = $2`,
      [session.user.id, resolvedWorkspaceId]
    ),
  ]);

  return {
    userId: session.user.id,
    roles: roleResult.rows.map((ra) => ({
      role: ra.role as RoleName,
      scope: ra.scope,
      scopeId: ra.scope_id,
    })),
    engagementMemberships: engagementResult.rows.map((em) => ({
      engagementId: em.engagement_id,
      role: em.role as RoleName,
    })),
    workspaceRole: membership.role,
  };
}

export interface GetPolicyContextForSessionOptions {
  /**
   * Opt-in: runs the four reads as raw SQL inside withRawStatementTimeout()
   * with this Postgres-side statement_timeout (ms) -- the SAME primitive
   * getSession() itself uses, guaranteeing real server-side cancellation
   * with acquisition bounded only by the pool's own connectionTimeoutMillis
   * (no separate Prisma-imposed maxWait ceiling to race under ordinary
   * pool contention). Omitted (the default) preserves the exact
   * pre-existing unbounded Prisma-ORM behavior for every caller that does
   * not ask for a bound.
   */
  statementTimeoutMs?: number;
}

/**
 * F-AUTH-ROOT-FAST-FAIL: identical to getPolicyContext() except it takes an
 * ALREADY-validated SessionInfo instead of calling getSession() itself.
 * Exists for a caller that has JUST fetched the session in the SAME request
 * (e.g. the authenticated root route) and would otherwise pay for a second,
 * fully redundant session-lookup query (cookie read + the same bounded
 * raw-SQL round trip getSession() already performed microseconds earlier).
 *
 * Safe to reuse rather than re-fetch: nothing between the two calls in a
 * single request can revoke/expire/deactivate the session or its user, so
 * re-running the exact same expiry/revocation/active-user check against the
 * exact same in-flight request's session can only ever re-confirm what the
 * first getSession() call already proved -- it cannot observe a DIFFERENT
 * outcome. No expiry, revocation, session-user-binding, role, workspace, or
 * capability check is skipped or weakened by this: every check this
 * function performs is identical to getPolicyContext()'s, the only removed
 * step is the now-redundant SECOND call to getSession() itself.
 * A caller that has NOT already validated its own session in this same
 * request must call getPolicyContext() (or getSession() first), never this
 * function with an unvalidated/stale SessionInfo.
 *
 * TypeScript-review precision note: "cannot observe a different outcome"
 * above describes the ordinary case, not an absolute guarantee -- there is
 * a real, narrow (sub-millisecond, intra-request) window in which a
 * concurrent revocation could land between the original getSession() call
 * and this reuse that the OLD two-getSession()-call flow would have caught
 * on its second read and this flow does not. This is accepted, not
 * overlooked: every governed mutation this app performs is checked by its
 * own destination route/service through the SAME centralized policy layer
 * (capability-check.ts) before it acts, per CLAUDE.md's "no permission
 * logic outside centralized policy checks" rule -- this function's result
 * only ever decides WHICH page a request is redirected to, never grants a
 * mutation by itself, so a session revoked in that sub-millisecond window
 * is still caught at the destination before anything governed happens.
 */
export async function getPolicyContextForSession(
  session: SessionInfo,
  workspaceId?: string,
  options?: GetPolicyContextForSessionOptions
): Promise<PolicyContext | null> {
  // santa-loop review finding: every other exported auth read
  // (getSession, requireSession, getPolicyContext, requirePolicyContext)
  // calls this; this one, a new exported entry point, had been left out.
  // Safe for the existing allowlist as-is: AUTH_READ_ALLOWLIST's
  // "src/services/auth.ts:getPolicyContext" entry matches via
  // functionName.includes("getPolicyContext"), which "getPolicyContextForSession"
  // satisfies.
  checkShadowRead("getPolicyContextForSession");

  // Ensure database is initialized (getSession does this too, but be explicit)
  await getDbInstance();

  if (options?.statementTimeoutMs === undefined) {
    return runPolicyContextReads(db, session, workspaceId);
  }

  const pool = await getRawPool();
  return withRawStatementTimeout(
    pool,
    options.statementTimeoutMs,
    (client) => runPolicyContextReadsRaw(client, session, workspaceId),
    "getPolicyContextForSession",
    POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS
  );
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
