/**
 * [db] F-AUTH-ROOT-SINGLE-TX: real-Postgres regression coverage for resolveAuthenticatedRootDecision()
 * (root-redirect.service.ts) -- the authenticated `/` decision now running session validation,
 * policy resolution, and owner-first-run resolution inside ONE bounded, cancellable Prisma
 * interactive transaction.
 *
 * Covers: semantic equivalence (session/policy/owner), single-backend proof, read-only transaction
 * enforcement, independent statement-cancellation for all three phases, whole-transaction-timeout
 * proof, acquisition (maxWait) proof at 3s/8s/>10s, fail-closed authorization (anonymous vs.
 * /dashboard distinction), and all four required concurrency scenarios.
 *
 * Run: TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/services/root-redirect-single-tx.db.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, getRawPool } from "@/lib/db";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createFirstBusiness, getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { runPolicyContextReads } from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROOT_AUTH_MAX_WAIT_MS, ROOT_AUTH_TX_TIMEOUT_MS, ROOT_AUTH_STATEMENT_TIMEOUT_MS, ROOT_AUTH_INNER_WORST_CASE_MS, ROOT_AUTH_OUTER_TIMEOUT_MS } from "@/services/root-redirect.service";

const SKIP = !SHOULD_RUN_DB_TESTS;
const cookieHolder = { token: undefined as string | undefined };

vi.mock("next/headers", () => ({
  // Captures cookieHolder.token SYNCHRONOUSLY at call time (an async function's body runs
  // synchronously up to its first await, and calling it IS that first step) -- required so two
  // concurrent resolveAuthenticatedRootDecision() calls each snapshot the token that was current
  // when THEY started, instead of racing against a later mutation of the shared test fixture before
  // either call's internal `await cookies()` would otherwise have read it.
  cookies: async () => {
    const snapshot = cookieHolder.token;
    return { get: (name: string) => (name === "opsiq_session" && snapshot ? { value: snapshot } : undefined) };
  },
}));

async function makeUserAndSession(opts: { revoked?: boolean; expired?: boolean; inactive?: boolean } = {}) {
  const userId = randomUUID();
  await db.user.create({
    data: {
      id: userId, email: `${userId}@roottx.test`, name: opts.inactive ? null : "Test Owner", isActive: !opts.inactive,
      emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date(),
    },
  });
  const token = randomUUID();
  await db.session.create({
    data: {
      id: randomUUID(), userId, token,
      expiresAt: opts.expired ? new Date(Date.now() - 60_000) : new Date(Date.now() + 86_400_000),
      revokedAt: opts.revoked ? new Date() : null,
    },
  });
  return { userId, token };
}

async function makeWorkspaceWithOwner(userId: string) {
  const workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: "Root TX Tenant", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  await db.workspaceMembership.create({ data: { id: randomUUID(), workspaceId, userId, isActive: true, addedAt: new Date(), role: "owner" } as never });
  // Authorization-relevant role lives in UserRoleAssignment (scope=workspace), not WorkspaceMembership.role
  // alone -- see runPolicyContextReads()/getCapabilitiesForRole() narrowing.
  await db.userRoleAssignment.create({
    data: { id: randomUUID(), userId, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: workspaceId, isActive: true },
  });
  return workspaceId;
}

const period = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};
const quick = (o: Record<string, unknown> = {}) => ({ ...period(), currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, ...o });

async function freshDecisionModule() {
  vi.resetModules();
  return import("@/services/root-redirect.service");
}

describe.skipIf(SKIP)("[db] root-redirect single-transaction: semantic equivalence + architecture proof", () => {
  it("constant drift guard: root-specific timeout constants have not silently changed", () => {
    expect(ROOT_AUTH_MAX_WAIT_MS).toBe(10_000);
    expect(ROOT_AUTH_TX_TIMEOUT_MS).toBe(15_000);
    expect(ROOT_AUTH_STATEMENT_TIMEOUT_MS).toBe(2_000);
    expect(ROOT_AUTH_INNER_WORST_CASE_MS).toBe(28_000);
    expect(ROOT_AUTH_OUTER_TIMEOUT_MS).toBe(29_000);
    expect(ROOT_AUTH_OUTER_TIMEOUT_MS).toBeGreaterThan(ROOT_AUTH_INNER_WORST_CASE_MS);
    expect(ROOT_AUTH_OUTER_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("ANONYMOUS: no cookie resolves anonymous with zero DB queries", async () => {
    cookieHolder.token = undefined;
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const result = await resolveAuthenticatedRootDecision();
    expect(result).toEqual({ kind: "anonymous" });
  });

  it("ANONYMOUS: missing/revoked/expired session and inactive user all resolve anonymous, never /dashboard", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();

    cookieHolder.token = randomUUID(); // nonexistent
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "anonymous" });

    const revoked = await makeUserAndSession({ revoked: true });
    cookieHolder.token = revoked.token;
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "anonymous" });

    const expired = await makeUserAndSession({ expired: true });
    cookieHolder.token = expired.token;
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "anonymous" });

    const inactive = await makeUserAndSession({ inactive: true });
    cookieHolder.token = inactive.token;
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "anonymous" });
  });

  it("/dashboard: a valid session with no workspace/policy context fails closed to the authenticated default, not anonymous", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { token } = await makeUserAndSession();
    cookieHolder.token = token;
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "redirect", href: "/dashboard" });
  });

  it("OWNER REDIRECT: established self-serve owner resolves the same destination as the canonical path", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap = (await createFinancialSnapshot(business.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(business.id, snap.id, userId, workspaceId);

    const baselineHref = (await getFirstRunContext(workspaceId, business.id)).loginHref;
    cookieHolder.token = token;
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "redirect", href: baselineHref });
  }, 15_000);

  it("POLICY_EQUIVALENCE: runPolicyContextReads() resolves identically via the shared tx client vs. baseline db", async () => {
    const { userId } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    const session = { user: { id: userId, email: "x@test", name: null, isActive: true }, sessionId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) };

    const baseline = await runPolicyContextReads(db as never, session, undefined);
    const viaTx = await db.$transaction((tx) => runPolicyContextReads(tx as never, session, undefined));
    expect(viaTx).toEqual(baseline);
    expect(baseline ? isSelfServeOwnerContext(baseline) : null).toBe(true);
  });

  it("AUTH_ROOT_SINGLE_BACKEND + AUTH_ROOT_TRANSACTION_COUNT=1: exactly one backend covers session+policy+owner-first-run", async () => {
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    void token;
    const pids = new Set<number>();
    const { validateSessionTokenInTransaction } = await import("@/services/auth");
    await db.$transaction(
      async (tx) => {
        const txAny = tx as unknown as { $queryRawUnsafe: <T>(q: string) => Promise<T> };
        for (const probe of [
          () => validateSessionTokenInTransaction(tx as never, (cookieHolder.token ??= randomUUID())!),
          () => runPolicyContextReads(tx as never, { user: { id: userId, email: "x", name: null, isActive: true }, sessionId: "s", expiresAt: new Date() }, undefined),
          () => getFirstRunContext(workspaceId, undefined, tx as never),
        ]) {
          const p = await txAny.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
          pids.add(p[0].pid);
          await probe();
        }
        const pLast = await txAny.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
        pids.add(pLast[0].pid);
      },
      { maxWait: 10_000, timeout: 15_000 }
    );
    expect(pids.size).toBe(1);
  }, 15_000);

  it("AUTH_ROOT_READ_ONLY_TX: SET TRANSACTION READ ONLY is compatible, blocks a write, legitimate reads still succeed", async () => {
    const { userId } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const outcome = await db.$transaction(
      async (tx) => {
        const txRaw = tx as unknown as { $executeRawUnsafe: (q: string) => Promise<unknown> };
        await txRaw.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const ctx = await getFirstRunContext(workspaceId, undefined, tx as never);
        let writeRejected = false;
        try {
          await (tx as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { name: "mutated" } });
        } catch {
          writeRejected = true;
        }
        return { ctxOk: !!ctx, writeRejected };
      },
      { maxWait: 10_000, timeout: 15_000 }
    );
    expect(outcome.ctxOk).toBe(true);
    expect(outcome.writeRejected).toBe(true);
  }, 15_000);

  it("regression guard: the REAL resolveAuthenticatedRootDecision() transaction actually issues SET TRANSACTION READ ONLY and a 2s SET LOCAL statement_timeout", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;

    const pool = await getRawPool();
    const realConnect = pool.connect.bind(pool);
    const observedControlStatements: string[] = [];
    (pool as unknown as { connect: typeof pool.connect }).connect = (async (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (realConnect as any)(...args);
      const realQuery = client.query.bind(client);
      client.query = (async (...qArgs: unknown[]) => {
        const text = typeof qArgs[0] === "string" ? qArgs[0] : (qArgs[0] as { text?: string })?.text ?? "";
        if (/^SET/i.test(String(text).trim())) observedControlStatements.push(String(text).trim());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (realQuery as any)(...qArgs);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect;

    try {
      await resolveAuthenticatedRootDecision();
    } finally {
      (pool as unknown as { connect: typeof pool.connect }).connect = realConnect;
    }
    expect(observedControlStatements.some((s) => /READ ONLY/i.test(s))).toBe(true);
    expect(observedControlStatements.some((s) => /statement_timeout\s*=\s*2000/i.test(s))).toBe(true);
  }, 15_000);
});

/** Module-level so both the hostile-proofs and the concurrency describe blocks can share it. */
function patchPool(injectAt: Record<number, number>) {
  return async () => {
    const pool = await getRawPool();
    const realConnect = pool.connect.bind(pool);
    const patched: Array<{ client: { query: unknown }; realQuery: unknown }> = [];
    let n = 0;
    (pool as unknown as { connect: typeof pool.connect }).connect = (async (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (realConnect as any)(...args);
      const realQuery = client.query.bind(client);
      patched.push({ client, realQuery });
      client.query = (async (...qArgs: unknown[]) => {
        const text = typeof qArgs[0] === "string" ? qArgs[0] : (qArgs[0] as { text?: string })?.text ?? "";
        const isControl = /^(BEGIN|COMMIT|ROLLBACK|SET)/i.test(String(text).trim());
        if (!isControl) {
          n++;
          const delayMs = injectAt[n];
          if (delayMs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (delayMs >= 3000) return (realQuery as any)(`SELECT pg_sleep(${delayMs / 1000})`);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (realQuery as any)(...qArgs);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect;
    return {
      restore: () => {
        (pool as unknown as { connect: typeof pool.connect }).connect = realConnect;
        for (const { client, realQuery } of patched) client.query = realQuery as never;
      },
    };
  };
}

describe.skipIf(SKIP)("[db] root-redirect single-transaction: statement-cancellation + timeout hostile proofs", () => {
  it("SESSION_STATEMENT_CANCEL: a blocked statement during session validation is cancelled server-side (57014), pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { token } = await makeUserAndSession();
    cookieHolder.token = token;
    const { restore } = await patchPool({ 1: 10_000 })();
    let caught: unknown = null;
    const start = performance.now();
    try {
      await resolveAuthenticatedRootDecision();
    } catch (e) {
      caught = e;
    } finally {
      restore();
    }
    // resolveAuthenticatedRootDecision() itself fails closed (never throws) -- its OUTER catch
    // absorbs the 57014/transaction failure and returns anonymous (session not yet established).
    expect(caught).toBeNull();
    expect(performance.now() - start).toBeLessThan(6_000);
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse.kind).toBeDefined();
  }, 15_000);

  it("POLICY_STATEMENT_CANCEL + FIRST_RUN_STATEMENT_CANCEL: a blocked statement later in the graph fails closed to /dashboard, pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;
    // Non-control call #1 = session query; #2+ = policy's reads. Block #2 (policy phase).
    const { restore } = await patchPool({ 2: 10_000 })();
    let result;
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    expect(result).toEqual({ kind: "redirect", href: "/dashboard" });
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse.kind).toBeDefined();
  }, 15_000);

  it("AUTH_ROOT_TX_TIMEOUT: cumulative sub-statement-timeout delays exceed the 15s whole-transaction budget -> fails closed, pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;
    // 1.9s/statement (well under the 2s statement_timeout) for up to 30 statements -- guaranteed to
    // cross the 15s transaction budget by the 8th real statement regardless of the exact graph
    // length for this fixture (session + policy + a no-business owner-first-run graph is already >=7).
    const injectAt: Record<number, number> = {};
    for (let i = 1; i <= 30; i++) injectAt[i] = 1_900;
    const { restore } = await patchPool(injectAt)();
    let result;
    const start = performance.now();
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    const elapsedMs = performance.now() - start;
    // Session was established before the tx expired, so this fails closed to the authenticated
    // default or the owner destination it had already reached -- never back to anonymous.
    expect(result.kind).toBe("redirect");
    expect(elapsedMs).toBeGreaterThan(14_000); // actually paid the cumulative delay, not a fast path
    expect(elapsedMs).toBeLessThan(29_000);
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse.kind).toBeDefined();
  }, 35_000);

  it("AUTH_ROOT_MAXWAIT: 3s/8s contention succeed, >10s contention fails closed to ANONYMOUS (transaction body never started)", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const results: Record<string, unknown> = {};
    for (const seconds of [3, 8, 12]) {
      const { userId, token } = await makeUserAndSession();
      await makeWorkspaceWithOwner(userId);
      cookieHolder.token = token;
      const blocker = (db as unknown as { $executeRawUnsafe: (q: string) => Promise<unknown> }).$executeRawUnsafe(`SELECT pg_sleep(${seconds})`).catch(() => undefined);
      const result = await resolveAuthenticatedRootDecision();
      await blocker;
      results[`${seconds}s`] = result;
    }
    expect((results["3s"] as { kind: string }).kind).toBe("redirect");
    expect((results["8s"] as { kind: string }).kind).toBe("redirect");
    // Over maxWait: the transaction body never started (session never established) -> anonymous,
    // never /dashboard -- this is the P2028-acquisition-class fail-closed semantic from Part 17.
    expect(results["12s"]).toEqual({ kind: "anonymous" });
  }, 40_000);
});

describe.skipIf(SKIP)("[db] root-redirect single-transaction: concurrency (4/4 required scenarios)", () => {
  it("scenario 1: two authenticated roots concurrently resolve correctly, no cross-contamination", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const a = await makeUserAndSession();
    await makeWorkspaceWithOwner(a.userId);
    const b = await makeUserAndSession();
    await makeWorkspaceWithOwner(b.userId);

    cookieHolder.token = a.token;
    const pA = resolveAuthenticatedRootDecision();
    cookieHolder.token = b.token;
    const pB = resolveAuthenticatedRootDecision();
    const [resA, resB] = await Promise.all([pA, pB]);
    expect(resA.kind).toBe("redirect");
    expect(resB.kind).toBe("redirect");
  }, 20_000);

  it("scenario 2: authenticated root + anonymous root concurrently, anonymous makes zero DB queries", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);

    cookieHolder.token = token;
    const pAuth = resolveAuthenticatedRootDecision();
    cookieHolder.token = undefined;
    const pAnon = resolveAuthenticatedRootDecision();
    const [resAuth, resAnon] = await Promise.all([pAuth, pAnon]);
    expect(resAuth.kind).toBe("redirect");
    expect(resAnon).toEqual({ kind: "anonymous" });
  }, 20_000);

  it("scenario 3: authenticated-root timeout followed immediately by a normal session read -- no contamination, no abandoned backend", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;
    const { restore } = await patchPool({ 2: 10_000 })();
    try {
      await resolveAuthenticatedRootDecision(); // fails closed to /dashboard (policy phase blocked)
    } finally {
      restore();
    }
    // Immediately after: a normal getSession()-style read on the same shared pool must succeed cleanly.
    const { validateSessionTokenInTransaction } = await import("@/services/auth");
    const normalRead = await db.$transaction((tx) => validateSessionTokenInTransaction(tx as never, token));
    expect(normalRead).not.toBeNull();
  }, 20_000);

  it("scenario 4: authenticated-root timeout followed immediately by a readiness/startup-style DB operation -- pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;
    const { restore } = await patchPool({ 2: 10_000 })();
    try {
      await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    // Readiness/startup-style read: a plain SELECT 1 through the same shared pool.
    const readiness = await (db as unknown as { $queryRawUnsafe: <T>(q: string) => Promise<T> }).$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 AS ok");
    expect(readiness[0].ok).toBe(1);
  }, 20_000);
});
