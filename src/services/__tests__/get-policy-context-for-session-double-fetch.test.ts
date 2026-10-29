/**
 * F-AUTH-ROOT-FAST-FAIL Phase 2 proof (DOUBLE_SESSION_FETCH).
 *
 * Pre-fix: the authenticated root route called getSession() once directly
 * (HomePage) and then AGAIN inside getPolicyContext() -- two full session
 * lookups (cookie read + the bounded raw-SQL round trip) for one request.
 *
 * Fix: getPolicyContextForSession(session, workspaceId?) takes an
 * ALREADY-validated SessionInfo and performs every workspace-membership /
 * role / capability read getPolicyContext() does, WITHOUT calling
 * getSession() (and therefore without reading the session cookie or
 * re-running the raw-SQL session lookup) a second time.
 *
 * This proves, with no real database (mocked Prisma model calls only):
 *  - getPolicyContext() itself still reads the cookie exactly once (its own
 *    internal getSession() call) -- unchanged, pre-existing behavior for
 *    every OTHER caller of getPolicyContext().
 *  - getPolicyContextForSession() reads the cookie ZERO times -- it never
 *    touches next/headers at all, proving no second session fetch occurs.
 *  - Both return the SAME resolved PolicyContext for the same inputs --
 *    the fix is behavior-preserving, not merely "faster but different".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieHolder = vi.hoisted(() => ({ token: "session-token-1" as string | undefined }));
const cookieGetSpy = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      cookieGetSpy(name);
      return name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined;
    },
  }),
}));

const sessionQueryMock = vi.hoisted(() => vi.fn());
// F-AUTH-ROOT-FAST-FAIL round 2: the bounded (statementTimeoutMs) path now
// runs as RAW SQL through withRawStatementTimeout() -- the same primitive
// getSession() itself uses -- not through Prisma's withStatementTimeout()
// (round 1 used that, but database review correctly rejected it: Prisma's
// interactive $transaction() races connection ACQUISITION against its own
// maxWait independent of the pool's real connectionTimeoutMillis, the exact
// P2028-under-ordinary-contention class this codebase already diagnosed and
// moved getSession() away from). This mock dispatches raw query text to the
// right fixture, mirroring get-session-db-resilience.test.ts's style.
const policyRawQueryMock = vi.hoisted(() => vi.fn());
const withRawStatementTimeoutSpy = vi.hoisted(() => vi.fn());

const workspaceMembershipFindFirst = vi.hoisted(() => vi.fn());
const workspaceMembershipFindUnique = vi.hoisted(() => vi.fn());
const userRoleAssignmentFindMany = vi.hoisted(() => vi.fn());
const engagementMembershipFindMany = vi.hoisted(() => vi.fn());
const mockDbClient = vi.hoisted(() => ({
  workspaceMembership: { findFirst: workspaceMembershipFindFirst, findUnique: workspaceMembershipFindUnique },
  userRoleAssignment: { findMany: userRoleAssignmentFindMany },
  engagementMembership: { findMany: engagementMembershipFindMany },
}));

vi.mock("@/lib/db", () => ({
  db: mockDbClient,
  getDbInstance: vi.fn().mockResolvedValue({}),
  getRawPool: vi.fn().mockResolvedValue({
    connect: vi.fn().mockResolvedValue({
      query: (text: string, values?: unknown[]) =>
        text.includes("FROM sessions") ? sessionQueryMock(text, values) : policyRawQueryMock(text, values),
    }),
  }),
  withRawStatementTimeout: async (
    pool: { connect: () => Promise<{ query: (...args: unknown[]) => unknown }> },
    timeoutMs: number,
    fn: (client: { query: (...args: unknown[]) => unknown }) => unknown,
    label: string,
    mainBackstopMarginMs?: number
  ) => {
    withRawStatementTimeoutSpy(timeoutMs, label, mainBackstopMarginMs);
    return fn(await pool.connect());
  },
  withRawStatementTimeoutWorstCaseMs: (statementTimeoutMs: number, mainBackstopMarginMs = 5_000) => 90_000 + statementTimeoutMs + mainBackstopMarginMs + 5_000,
  CLIENT_SIDE_BACKSTOP_MARGIN_MS: 5_000,
}));

vi.mock("@/lib/runtime-shadow-read-enforcer", () => ({
  checkShadowRead: vi.fn(),
}));

import { getSession, getPolicyContext, getPolicyContextForSession } from "@/services/auth";

const WORKSPACE_ID = "ws-1";

function mockHealthySession() {
  sessionQueryMock.mockResolvedValue({
    rows: [
      {
        session_id: "sess-1",
        expires_at: new Date(Date.now() + 60_000),
        revoked_at: null,
        user_id: "user-1",
        user_email: "a@b.com",
        user_name: "A",
        user_is_active: true,
      },
    ],
  });
}

function mockHealthyPolicyReads() {
  workspaceMembershipFindFirst.mockResolvedValue({ workspaceId: WORKSPACE_ID });
  workspaceMembershipFindUnique.mockResolvedValue({ isActive: true, role: "ADMIN_OR_PORTFOLIO_MANAGER" });
  userRoleAssignmentFindMany.mockResolvedValue([{ role: "OWNER", scope: "workspace", scopeId: WORKSPACE_ID }]);
  engagementMembershipFindMany.mockResolvedValue([]);

  // Raw-SQL equivalents for the opt-in statementTimeoutMs path (runPolicyContextReadsRaw).
  policyRawQueryMock.mockImplementation(async (text: string) => {
    if (text.includes("SELECT workspace_id FROM workspace_memberships")) {
      return { rows: [{ workspace_id: WORKSPACE_ID }] };
    }
    if (text.includes("SELECT is_active, role FROM workspace_memberships")) {
      return { rows: [{ is_active: true, role: "ADMIN_OR_PORTFOLIO_MANAGER" }] };
    }
    if (text.includes("FROM user_role_assignments")) {
      return { rows: [{ role: "OWNER", scope: "workspace", scope_id: WORKSPACE_ID }] };
    }
    if (text.includes("FROM engagement_memberships")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected raw policy query in test: ${text}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieHolder.token = "session-token-1";
  mockHealthySession();
  mockHealthyPolicyReads();
});

describe("getPolicyContext() vs getPolicyContextForSession() — double session fetch", () => {
  it("getPolicyContext() reads the session cookie exactly once (its own internal getSession() call) — unchanged baseline", async () => {
    const ctx = await getPolicyContext();
    expect(cookieGetSpy).toHaveBeenCalledTimes(1);
    expect(sessionQueryMock).toHaveBeenCalledTimes(1);
    expect(ctx).not.toBeNull();
  });

  it("getPolicyContextForSession() never reads the session cookie or re-runs the session query — DOUBLE_SESSION_FETCH_REMOVED", async () => {
    const session = await getSession();
    expect(cookieGetSpy).toHaveBeenCalledTimes(1);
    expect(sessionQueryMock).toHaveBeenCalledTimes(1);
    cookieGetSpy.mockClear();
    sessionQueryMock.mockClear();

    const ctx = await getPolicyContextForSession(session!);

    expect(cookieGetSpy).not.toHaveBeenCalled();
    expect(sessionQueryMock).not.toHaveBeenCalled();
    expect(ctx).not.toBeNull();
  });

  it("getPolicyContext() and getPolicyContextForSession() resolve the identical PolicyContext for the same session — behavior-preserving", async () => {
    const session = await getSession();
    const viaReuse = await getPolicyContextForSession(session!);

    cookieHolder.token = "session-token-1";
    const viaFullFetch = await getPolicyContext();

    expect(viaReuse).toEqual(viaFullFetch);
  });

  it("getPolicyContextForSession() returns null, performing zero DB reads beyond what membership resolution needs, when the caller passes a session but the user has no workspace membership", async () => {
    workspaceMembershipFindFirst.mockResolvedValue(null);
    const session = await getSession();
    cookieGetSpy.mockClear();

    const ctx = await getPolicyContextForSession(session!);

    expect(ctx).toBeNull();
    expect(cookieGetSpy).not.toHaveBeenCalled();
    expect(userRoleAssignmentFindMany).not.toHaveBeenCalled();
  });
});

describe("getPolicyContextForSession() — opt-in statementTimeoutMs, raw-SQL mechanism (F-AUTH-ROOT-FAST-FAIL database-review fix, round 2)", () => {
  it("without options, issues no ADDITIONAL withRawStatementTimeout() call beyond the one getSession() itself already made -- every existing caller of getPolicyContext() keeps its exact unbounded (plain Prisma ORM) behavior", async () => {
    const session = await getSession();
    withRawStatementTimeoutSpy.mockClear(); // clear the one call getSession() itself just made

    const ctx = await getPolicyContextForSession(session!);

    expect(withRawStatementTimeoutSpy).not.toHaveBeenCalled();
    expect(workspaceMembershipFindFirst).toHaveBeenCalled(); // took the plain-Prisma-ORM path, not raw SQL
    expect(ctx).not.toBeNull();
  });

  it("with options.statementTimeoutMs, routes every read as raw SQL through withRawStatementTimeout() with that exact statement_timeout and a descriptive label", async () => {
    const session = await getSession();
    withRawStatementTimeoutSpy.mockClear();

    const ctx = await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: 4000 });

    expect(withRawStatementTimeoutSpy).toHaveBeenCalledTimes(1);
    // 20_000 = 4 * CLIENT_SIDE_BACKSTOP_MARGIN_MS (POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS) --
    // database-review finding (round 3): the multi-statement fn needs a larger-than-default
    // client-side backstop margin than withRawStatementTimeout()'s single-statement default.
    expect(withRawStatementTimeoutSpy).toHaveBeenCalledWith(4000, "getPolicyContextForSession", 20_000);
    expect(workspaceMembershipFindFirst).not.toHaveBeenCalled(); // took the raw-SQL path, not plain Prisma ORM
    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({ userId: "user-1" });
  });

  it("the bounded path still reads the cookie zero times -- the double-fetch fix is preserved under the new options parameter", async () => {
    const session = await getSession();
    cookieGetSpy.mockClear();

    await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: 4000 });

    expect(cookieGetSpy).not.toHaveBeenCalled();
  });

  it("propagates a raw-SQL read failure (e.g. a real statement_timeout cancellation) to the caller rather than silently swallowing it", async () => {
    const session = await getSession();
    policyRawQueryMock.mockRejectedValueOnce(new Error("statement timeout"));

    await expect(getPolicyContextForSession(session!, undefined, { statementTimeoutMs: 4000 })).rejects.toThrow("statement timeout");
  });
});
