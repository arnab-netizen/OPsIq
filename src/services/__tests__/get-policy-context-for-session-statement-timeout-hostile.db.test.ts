/**
 * F-AUTH-ROOT-FAST-FAIL database-review finding (CRITICAL/HIGH) proof,
 * against REAL disposable PostgreSQL -- not mocks.
 *
 * getPolicyContextForSession()'s four reads previously ran as plain Prisma
 * calls with no server-side statement_timeout at all. The fix:
 * options.statementTimeoutMs now routes them as RAW SQL through
 * withRawStatementTimeout() (src/lib/db.ts) -- the SAME primitive
 * getSession() itself uses, not Prisma's interactive $transaction() (round
 * 1 of this fix used that; database review round 2 correctly rejected it,
 * since $transaction()'s own maxWait races connection ACQUISITION
 * independent of the pool's real connectionTimeoutMillis -- the exact
 * P2028-under-ordinary-contention class this codebase already diagnosed
 * and moved getSession() away from, see POLICY_CONTEXT_QUERY_TIMEOUT_MS's
 * doc comment in auth.ts). Postgres itself cancels the statement
 * (statement_timeout) and the connection is guaranteed back to the pool
 * (or cleanly discarded), independent of what any caller's own outer
 * JS-side race decides to do.
 *
 * Two things are proven here against a real database:
 *  1. EXECUTION-level cancellation actually applies to this call site: a
 *     real ACCESS EXCLUSIVE lock on `workspace_memberships` forces a
 *     genuine SQLSTATE 57014 cancellation near the statement_timeout
 *     bound, and the pool recovers cleanly afterward.
 *  2. ACQUISITION-level contention does NOT spuriously fail this call site
 *     the way it would have under the round-1 Prisma-transaction mechanism
 *     (whose maxWait was only 10s): holding the shared application pool's
 *     sole connection busy with an UNRELATED query for longer than that
 *     old 10s ceiling, but well under the real POOL_CONNECTION_TIMEOUT_MS
 *     (90s) acquisition ceiling, must NOT produce a premature failure --
 *     the call must simply wait for the connection, exactly like
 *     getSession() already does.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const cookieHolder = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined,
  }),
}));

import { db, getRawPool, withRawStatementTimeout } from "@/lib/db";
import {
  getSession,
  getPolicyContextForSession,
  POLICY_CONTEXT_STATEMENT_TIMEOUT_MS,
  POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS,
} from "@/services/auth";

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[get-policy-context-for-session-statement-timeout-hostile] DATABASE_URL is not a valid URL");
  }
  const isLocal = hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[get-policy-context-for-session-statement-timeout-hostile] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`,
    );
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] getPolicyContextForSession() statement_timeout actually applies to this call site", () => {
  const stamp = randomUUID().substring(0, 8);
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const email = `pctsh-user-${stamp}@test.local`;
  const otherEmail = `pctsh-other-user-${stamp}@test.local`;
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const thirdWorkspaceId = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const otherEngagementId = randomUUID();
  const sessionToken = `pctsh-token-${stamp}`;
  let lockHolderPool: Pool | undefined;

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: otherUserId, email: otherEmail, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "PCTSH WS", slug: `pctsh-${stamp}` } });
    await db.workspace.create({ data: { id: otherWorkspaceId, name: "PCTSH Other WS", slug: `pctsh-other-${stamp}` } });
    await db.workspace.create({ data: { id: thirdWorkspaceId, name: "PCTSH Third WS", slug: `pctsh-third-${stamp}` } });
    // santa-loop review finding (round 2, round 3 -- mutation-tested across
    // three independent reviewers): the equivalence test below previously
    // seeded only positive rows, and then only rows distinguishable by
    // scope_id/workspace_id -- never by USER, by a non-'workspace' scope
    // string, or by added_at ORDER BY/is_active on a SECOND real candidate
    // row. Reviewers proved by directly breaking runPolicyContextReadsRaw's
    // WHERE clauses that dropping the user_id filter on the
    // membership-verify or role-assignment query, or the literal
    // scope='workspace' filter, or is_active/ORDER BY on the
    // default-workspace query, left every assertion in this file green,
    // because nothing in the seeded data could tell the broken query apart
    // from the correct one. The fixtures below close each of those
    // specific, named gaps (see the comment directly above each negative
    // row for which filter it targets).
    //
    // added_at ordering across workspaceId/otherWorkspaceId/thirdWorkspaceId
    // is explicit and 1 minute apart so it can never depend on insertion
    // order or clock-resolution ties: otherWorkspaceId (earliest, INACTIVE)
    // < workspaceId (correct answer, ACTIVE) < thirdWorkspaceId (latest,
    // ACTIVE). If is_active is dropped from the default-workspace query,
    // otherWorkspaceId's row would be ordered first and wrongly returned.
    // If ORDER BY is dropped or reversed, thirdWorkspaceId's row would be
    // (wrongly) preferred over workspaceId's.
    const now = Date.now();
    await db.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: otherWorkspaceId, userId, role: "inactive-earlier", isActive: false, addedAt: new Date(now - 60_000) },
    });
    // A second real user's OWN active membership in the SAME workspace,
    // with a DIFFERENT role value -- targets: dropping the user_id filter
    // from the membership-verify query (workspace_id=$1 AND user_id=$2).
    // Inserted BEFORE the primary user's own membership row below
    // deliberately: this test table has only a handful of rows, so
    // Postgres's planner chooses a sequential scan (not an index scan) for
    // `WHERE workspace_id = $1 LIMIT 1`, which returns rows in INSERTION
    // order when no ORDER BY is present -- empirically confirmed by
    // reproducing the exact "drop user_id from this query" mutation
    // locally against real Postgres: inserting this row first made the
    // equivalence test below genuinely catch the mutation (it silently
    // passed when this row was inserted AFTER the correct one instead).
    await db.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId, userId: otherUserId, role: "other-user-admin" },
    });
    await db.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId, userId, role: "owner", addedAt: new Date(now) },
    });
    await db.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: thirdWorkspaceId, userId, role: "active-later", isActive: true, addedAt: new Date(now + 60_000) },
    });
    await db.session.create({
      data: { id: randomUUID(), token: sessionToken, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role: "OWNER", scope: "workspace", scopeId: workspaceId, isActive: true },
    });
    await db.userRoleAssignment.create({
      data: {
        id: randomUUID(), userId, role: "REVOKED_ADMIN", scope: "workspace", scopeId: workspaceId,
        isActive: true, revokedAt: new Date(),
      },
    });
    await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role: "INACTIVE_VIEWER", scope: "workspace", scopeId: workspaceId, isActive: false },
    });
    await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role: "WRONG_WORKSPACE_OWNER", scope: "workspace", scopeId: otherWorkspaceId, isActive: true },
    });
    // Targets: dropping the literal `scope = 'workspace'` filter. Same
    // user, same scopeId as the correct row, but a DIFFERENT scope string
    // -- if that filter is dropped, this leaks into `roles` alongside (or
    // instead of) the real OWNER row.
    await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role: "WRONG_SCOPE_STRING_OWNER", scope: "engagement", scopeId: workspaceId, isActive: true },
    });
    // Targets: dropping the user_id filter from the role-assignment query.
    // A DIFFERENT user, SAME scope/scopeId/role shape as the real row.
    await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId: otherUserId, role: "OTHER_USER_OWNER", scope: "workspace", scopeId: workspaceId, isActive: true },
    });
    await db.clientAccount.create({ data: { id: clientId, name: "PCTSH Client", workspaceId, updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementId,
        code: `PCTSH-ENG-${stamp}`,
        title: "PCTSH Test Engagement",
        clientId,
        workspaceId,
        engagementMode: "consulting",
        serviceTier: "standard",
        updatedAt: new Date(),
      },
    });
    await db.engagement.create({
      data: {
        id: otherEngagementId,
        code: `PCTSH-OTHER-ENG-${stamp}`,
        title: "PCTSH Other-Workspace Engagement",
        clientId,
        workspaceId: otherWorkspaceId,
        engagementMode: "consulting",
        serviceTier: "standard",
        updatedAt: new Date(),
      },
    });
    await db.engagementMembership.create({
      data: { id: randomUUID(), userId, engagementId, role: "CONSULTANT", isActive: true },
    });
    await db.engagementMembership.create({
      data: { id: randomUUID(), userId, engagementId, role: "INACTIVE_ANALYST", isActive: false },
    });
    await db.engagementMembership.create({
      data: { id: randomUUID(), userId, engagementId: otherEngagementId, role: "WRONG_WORKSPACE_LEAD", isActive: true },
    });
    // Targets: dropping the user_id filter from the engagement-membership
    // query. A DIFFERENT user, active, on the SAME engagement.
    await db.engagementMembership.create({
      data: { id: randomUUID(), userId: otherUserId, engagementId, role: "OTHER_USER_CONSULTANT", isActive: true },
    });
  });

  afterAll(async () => {
    try {
      await db.engagementMembership.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await db.engagement.deleteMany({ where: { id: { in: [engagementId, otherEngagementId] } } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.userRoleAssignment.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await db.session.deleteMany({ where: { userId } });
      await db.workspaceMembership.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId, thirdWorkspaceId] } } });
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    } catch {
      // best-effort cleanup (ephemeral CI database)
    }
  });

  afterEach(async () => {
    if (lockHolderPool) {
      await lockHolderPool.end().catch(() => undefined);
      lockHolderPool = undefined;
    }
  });

  it(
    "a real ACCESS EXCLUSIVE lock on workspace_memberships forces a genuine statement_timeout cancellation (SQLSTATE 57014), and the shared pool recovers to a verified-working connection afterward",
    async () => {
      assertLocalUrl();
      cookieHolder.token = sessionToken;
      const session = await getSession();
      expect(session).not.toBeNull();

      const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
      lockHolderPool = new Pool({ connectionString: url, max: 1 });
      const lockClient = await lockHolderPool.connect();
      await lockClient.query("BEGIN");
      await lockClient.query("LOCK TABLE workspace_memberships IN ACCESS EXCLUSIVE MODE");

      let caught: unknown;
      const start = Date.now();
      try {
        await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS });
      } catch (err) {
        caught = err;
      }
      const elapsed = Date.now() - start;

      // Cancelled close to POLICY_CONTEXT_STATEMENT_TIMEOUT_MS (4000ms), not
      // left waiting for the lock indefinitely -- and NOT the much larger
      // ACQUISITION_QUEUE_WAIT_MS/TRANSACTION_ACQUIRE_MAX_WAIT_MS ceilings
      // (proving the EXECUTION-level timeout, not just an acquisition bound,
      // is what fired here).
      expect(elapsed).toBeGreaterThan(3_500);
      expect(elapsed).toBeLessThan(8_000);
      // The real, expected server-side mechanism -- not inferred from timing alone.
      expect((caught as { code?: unknown; cause?: { code?: unknown } } | undefined)?.code ?? (caught as { cause?: { code?: unknown } } | undefined)?.cause?.code).toBe("57014");

      await lockClient.query("ROLLBACK");
      lockClient.release();

      // Pool recovery: the cancelled transaction must not have poisoned the
      // SHARED pool (the same one getSession() and every other authenticated
      // route uses) for the next caller -- exact expected value, not merely
      // "did not throw".
      const after = await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS });
      expect(after).not.toBeNull();
      expect(after?.userId).toBe(userId);
    },
    20_000,
  );

  it(
    "without options (the default, unbounded path every other getPolicyContext() caller still uses), the same lock does not trigger any statement_timeout cancellation -- proving the bound is genuinely opt-in, not a hidden global change",
    async () => {
      assertLocalUrl();
      cookieHolder.token = sessionToken;
      const session = await getSession();

      const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
      lockHolderPool = new Pool({ connectionString: url, max: 1 });
      const lockClient = await lockHolderPool.connect();
      await lockClient.query("BEGIN");
      await lockClient.query("LOCK TABLE workspace_memberships IN ACCESS EXCLUSIVE MODE");

      // santa-loop review finding: releasing the lock BEFORE
      // POLICY_CONTEXT_STATEMENT_TIMEOUT_MS (4000ms) elapses would make this
      // test pass even if the default path WERE (incorrectly) bounded by
      // that same statement_timeout -- it would prove nothing about
      // "unbounded" specifically. Releasing comfortably AFTER that bound
      // (6000ms > 4000ms) means a successful, correct result here is only
      // possible because the default path genuinely has NO statement_timeout
      // to have been cancelled by.
      const RELEASE_AFTER_MS = POLICY_CONTEXT_STATEMENT_TIMEOUT_MS + 2_000;
      const releaseSoon = new Promise<void>((resolve) =>
        setTimeout(async () => {
          await lockClient.query("ROLLBACK").catch(() => undefined);
          lockClient.release();
          resolve();
        }, RELEASE_AFTER_MS)
      );

      const [ctx] = await Promise.all([getPolicyContextForSession(session!), releaseSoon]);
      expect(ctx).not.toBeNull();
      expect(ctx?.userId).toBe(userId);
    },
    20_000,
  );

  it(
    "santa-loop review finding (both independent reviewers): the raw-SQL bounded path resolves the IDENTICAL PolicyContext (roles, engagementMemberships, workspaceRole) as the ORM unbounded default path -- not just the same userId",
    async () => {
      assertLocalUrl();
      cookieHolder.token = sessionToken;
      const session = await getSession();

      const viaOrm = await getPolicyContextForSession(session!);
      const viaRaw = await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS });

      expect(viaOrm).not.toBeNull();
      // Deep equality, not just userId -- a wrong scope/role filter or a
      // mismatched column in the raw SQL would otherwise pass every
      // existing test in this file silently (every prior fixture here had
      // zero role assignments and zero engagement memberships).
      expect(viaRaw).toEqual(viaOrm);
      expect(viaRaw?.roles).toEqual([{ role: "OWNER", scope: "workspace", scopeId: workspaceId }]);
      expect(viaRaw?.engagementMemberships).toEqual([{ engagementId, role: "CONSULTANT" }]);
      expect(viaRaw?.workspaceRole).toBe("owner");
    },
    20_000,
  );

  it(
    "both paths agree the user has NO policy context for an explicit workspaceId where their own membership is inactive -- exercises the !membership.is_active guard on the EXPLICIT-workspaceId branch (never hit by the default-workspace-resolution tests above)",
    async () => {
      assertLocalUrl();
      cookieHolder.token = sessionToken;
      const session = await getSession();

      const viaOrm = await getPolicyContextForSession(session!, otherWorkspaceId);
      const viaRaw = await getPolicyContextForSession(session!, otherWorkspaceId, { statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS });

      expect(viaOrm).toBeNull();
      expect(viaRaw).toBeNull();
    },
    20_000,
  );

  it(
    "database-review finding (round 2): tolerates shared-pool CONNECTION-ACQUISITION contention for longer than Prisma's old withStatementTimeout() maxWait (10s) without a spurious failure -- proves this call site no longer uses that primitive's acquisition mechanism",
    async () => {
      assertLocalUrl();
      cookieHolder.token = sessionToken;
      const session = await getSession();

      // Hold the APPLICATION's own shared pool's sole connection (max:1,
      // same pool getSession()/getPolicyContextForSession() use) busy with
      // an UNRELATED query from a second checkout on that SAME pool --
      // simulating ordinary same-process contention, not a table lock.
      const pool = await getRawPool();
      const holder = await pool.connect();
      const HOLD_MS = 13_000; // comfortably past the OLD Prisma $transaction maxWait (10_000ms), well under POOL_CONNECTION_TIMEOUT_MS (90_000ms)
      const holderDone = holder.query(`SELECT pg_sleep(${HOLD_MS / 1000})`).finally(() => holder.release());

      const start = Date.now();
      const ctx = await getPolicyContextForSession(session!, undefined, { statementTimeoutMs: POLICY_CONTEXT_STATEMENT_TIMEOUT_MS });
      const elapsed = Date.now() - start;

      // Succeeded only AFTER the holder's ~13s hold lifted -- proves this
      // call genuinely WAITED for the connection (bounded only by the
      // pool's own connectionTimeoutMillis) rather than racing a separate,
      // much shorter Prisma-imposed maxWait and failing early at ~10s.
      expect(elapsed).toBeGreaterThan(HOLD_MS - 1_000);
      expect(ctx).not.toBeNull();
      expect(ctx?.userId).toBe(userId);

      await holderDone;
    },
    25_000,
  );

  it(
    "RED-before/GREEN-after (database-review finding, round 3): a merely slow-but-healthy multi-statement sequence that exceeds withRawStatementTimeout()'s DEFAULT single-statement backstop margin still succeeds under runPolicyContextReadsRaw()'s actual multi-statement margin",
    async () => {
      assertLocalUrl();
      const pool = await getRawPool();
      // 4 real, successfully-executing statements (never cancelled server-side --
      // each individually well under POLICY_CONTEXT_STATEMENT_TIMEOUT_MS=4000ms)
      // whose AGGREGATE wall-clock time (~11.2s) exceeds the DEFAULT backstop
      // (statementTimeoutMs + CLIENT_SIDE_BACKSTOP_MARGIN_MS = 4000+5000 = 9000ms)
      // but fits comfortably within POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS's
      // real value (4000+20000 = 24000ms).
      const fourSlowButHealthyStatements = async (client: { query: (text: string) => Promise<unknown> }) => {
        for (let i = 0; i < 4; i++) {
          await client.query("SELECT pg_sleep(2.8)");
        }
        return "ok";
      };

      // RED (the old, single-statement default margin): the exact same
      // workload DOES trip the client-side backstop and discard the
      // connection -- proving this is a real, reproducible gap, not a
      // hypothetical one.
      let redCaught: unknown;
      try {
        await withRawStatementTimeout(pool, POLICY_CONTEXT_STATEMENT_TIMEOUT_MS, fourSlowButHealthyStatements, "red-default-margin");
      } catch (err) {
        redCaught = err;
      }
      expect((redCaught as { name?: string } | undefined)?.name).toBe("ClientSideExecutionTimeoutError");

      // GREEN (runPolicyContextReadsRaw()'s actual multi-statement margin):
      // the SAME workload against a FRESH connection succeeds.
      const result = await withRawStatementTimeout(
        pool,
        POLICY_CONTEXT_STATEMENT_TIMEOUT_MS,
        fourSlowButHealthyStatements,
        "green-multi-statement-margin",
        POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS
      );
      expect(result).toBe("ok");
    },
    30_000,
  );
});
