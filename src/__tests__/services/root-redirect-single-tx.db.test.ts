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
import { createBusiness } from "@/services/founder-recovery/business.service";
import { correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
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
    // santa-loop review finding: the test's own name claimed "zero DB queries" with nothing
    // actually counting them -- instrument the raw pool's connect() so a regression that touches
    // the DB before the cookie check (or after a missing-cookie return) is caught.
    const pool = await getRawPool();
    const realConnect = pool.connect.bind(pool);
    let connectCalls = 0;
    (pool as unknown as { connect: typeof pool.connect }).connect = (async (...args: unknown[]) => {
      connectCalls++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (realConnect as any)(...args);
    }) as typeof pool.connect;
    let result;
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      (pool as unknown as { connect: typeof pool.connect }).connect = realConnect;
    }
    expect(result).toEqual({ kind: "anonymous" });
    expect(connectCalls).toBe(0);
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

  it("OWNER REDIRECT: a fixture-only workspace is never mistaken for an established owner (fixture exclusion holds inside the shared tx)", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const fixture = await createBusiness(
      { name: "OPSIQ Acceptance - root-redirect-mutation-check", businessType: "laundry_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      userId,
      workspaceId,
      { isFixtureBusiness: true }
    );
    const snap = (await createFinancialSnapshot(fixture.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(fixture.id, snap.id, userId, workspaceId);

    cookieHolder.token = token;
    // If the fixture business were (incorrectly) counted, this workspace would look ESTABLISHED
    // (full evidence + diagnosis) and resolve to the owner cockpit, not the first-run start.
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "redirect", href: "/owner/first-run" });
  }, 15_000);

  it("OWNER REDIRECT: of two real businesses in one workspace, the OLDEST one governs the root decision, never the newest", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const older = await createBusiness(
      { name: "Older Co", businessType: "laundry_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      userId,
      workspaceId
    );
    const snap = (await createFinancialSnapshot(older.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(older.id, snap.id, userId, workspaceId);
    await createBusiness(
      { name: "Newer Co", businessType: "laundry_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      userId,
      workspaceId
    );

    cookieHolder.token = token;
    // The older business has full evidence + diagnosis (ESTABLISHED, owner cockpit); the newer one
    // has none (NEEDS_EVIDENCE, first-run start). If ordering ever picked the newest business, this
    // would resolve to "/owner/first-run" instead.
    expect(await resolveAuthenticatedRootDecision()).toEqual({ kind: "redirect", href: "/owner/cockpit" });
  }, 15_000);

  it("OWNER: a snapshot-amendment trusted-interaction fact is scoped strictly to ITS OWN business, never leaks from a sibling business in the same workspace", async () => {
    const { userId } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const businessA = await createBusiness(
      { name: "Business A", businessType: "laundry_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      userId,
      workspaceId
    );
    const snapA = (await createFinancialSnapshot(businessA.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(businessA.id, snapA.id, userId, workspaceId);

    const businessB = await createBusiness(
      { name: "Business B", businessType: "laundry_local_service", currency: "GBP", b2cSupported: true, b2bSupported: false },
      userId,
      workspaceId
    );
    const snapB = (await createFinancialSnapshot(businessB.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(businessB.id, snapB.id, userId, workspaceId);
    await correctFirstResultEvidence(workspaceId, userId, businessB.id, snapB.id, {
      amendmentReason: "Checked the bank statement",
      cashOnHand: 999,
      evidenceQuality: "ACTUAL",
    } as never);

    // Business A has its own full evidence + diagnosis but NO amendment of its own -- business B's
    // amendment must never be read as A's trusted-interaction fact.
    const ctxA = await db.$transaction((tx) => getFirstRunContext(workspaceId, businessA.id, tx as never));
    expect(ctxA.firstTrustedInteractionAt).toBeNull();
    // Positive control (santa-loop review finding): without this, a broken read that found NOTHING
    // for either business would also satisfy the assertion above. Prove the amendment really is
    // visible, through the exact same transaction-client path, for the business it actually belongs to.
    const ctxB = await db.$transaction((tx) => getFirstRunContext(workspaceId, businessB.id, tx as never));
    expect(ctxB.firstTrustedInteractionAt).not.toBeNull();
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

  it("POLICY: a role assignment scoped to a DIFFERENT workspace must not satisfy self-serve-owner for THIS workspace", async () => {
    const { userId } = await makeUserAndSession();
    // Workspace A: membership only, NO role assignment scoped to it.
    const workspaceA = randomUUID();
    await db.workspace.create({ data: { id: workspaceA, name: "WS A", slug: `ws-${workspaceA.slice(0, 8)}`, createdBy: userId } });
    await db.workspaceMembership.create({ data: { id: randomUUID(), workspaceId: workspaceA, userId, isActive: true, addedAt: new Date(), role: "owner" } as never });
    // Workspace B: a real role assignment scoped to B, unrelated to A.
    const workspaceB = await makeWorkspaceWithOwner(userId);
    void workspaceB;
    const session = { user: { id: userId, email: "x@test", name: null, isActive: true }, sessionId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) };
    const policyForA = await db.$transaction((tx) => runPolicyContextReads(tx as never, session, workspaceA));
    expect(policyForA ? isSelfServeOwnerContext(policyForA) : null).toBe(false);
  });

  it("POLICY: an inactive workspace membership resolves no policy context, never a role/scope match", async () => {
    const { userId } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    await db.workspaceMembership.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { isActive: false } });
    const session = { user: { id: userId, email: "x@test", name: null, isActive: true }, sessionId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) };
    const policy = await db.$transaction((tx) => runPolicyContextReads(tx as never, session, workspaceId));
    expect(policy).toBeNull();
  });

  it("AUTH_ROOT_TRANSACTION_COUNT=1: the REAL resolveAuthenticatedRootDecision(), with a real business, opens exactly one transaction, never escapes to the global pool", async () => {
    // santa-loop review finding: the prior version of this test (a) never called the real
    // resolveAuthenticatedRootDecision() -- it hand-rolled its own db.$transaction with manual
    // probes, so it proved nothing about production wiring; (b) used a workspace with no business,
    // so the audit-event read inside getFirstRunContext's business-exists branch (first-run.service.ts's
    // own doc comment calls this "the one real escape point in this graph") never ran; (c) sampled
    // pg_backend_pid() through the SAME `tx` for every probe, so pids.size===1 held by construction,
    // not because the code only ever used one transaction; (d) under this test harness's own max:1
    // pool, EVERY connect() call hands back the identical physical client regardless of how many
    // transactions the code opens, so counting distinct backend PIDs can never distinguish "one
    // transaction" from "several" here either. What CAN distinguish them is counting BEGIN
    // statements: more than one means the code opened a second transaction (or escaped to the
    // global `db` outside this one) somewhere in the graph.
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap = (await createFinancialSnapshot(business.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(business.id, snap.id, userId, workspaceId);
    cookieHolder.token = token;

    const pool = await getRawPool();
    const realConnect = pool.connect.bind(pool);
    let beginCount = 0;
    let commitOrRollbackCount = 0;
    (pool as unknown as { connect: typeof pool.connect }).connect = (async (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (realConnect as any)(...args);
      const realQuery = client.query.bind(client);
      client.query = (async (...qArgs: unknown[]) => {
        const text = typeof qArgs[0] === "string" ? qArgs[0] : (qArgs[0] as { text?: string })?.text ?? "";
        const trimmed = String(text).trim();
        if (/^BEGIN/i.test(trimmed)) beginCount++;
        if (/^(COMMIT|ROLLBACK)/i.test(trimmed)) commitOrRollbackCount++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (realQuery as any)(...qArgs);
      }) as typeof client.query;
      return client;
    }) as typeof pool.connect;

    let result;
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      (pool as unknown as { connect: typeof pool.connect }).connect = realConnect;
    }
    expect(result.kind).toBe("redirect");
    expect(beginCount).toBe(1);
    expect(commitOrRollbackCount).toBe(1);
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
        } catch (e) {
          // santa-loop review finding: any error used to count as "rejected" -- confirm it is
          // specifically Postgres's read-only-transaction rejection (SQLSTATE 25006), not an
          // unrelated failure (e.g. a Prisma validation error) that would also satisfy a bare
          // catch. Prisma's @prisma/adapter-pg wraps the raw driver error without exposing the
          // SQLSTATE on a `.code` field, but its message text is this exact, unambiguous string.
          writeRejected = /cannot execute UPDATE in a read-only transaction/i.test(String((e as { message?: string })?.message ?? e));
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
        // santa-loop review finding: under this test harness's max:1 pool, connect() can return
        // the SAME physical client more than once while patched, nesting a second wrap on top of
        // the first (each entry's "realQuery" is really just the PREVIOUS wrap, not necessarily
        // the true original). Restoring in reverse (last-patched-first) correctly unwinds one
        // level per step; forward order would leave the innermost wrapper installed.
        for (let i = patched.length - 1; i >= 0; i--) {
          const { client, realQuery } = patched[i];
          client.query = realQuery as never;
        }
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
    let result: { kind: string } | undefined;
    const start = performance.now();
    try {
      result = await resolveAuthenticatedRootDecision();
    } catch (e) {
      caught = e;
    } finally {
      restore();
    }
    // resolveAuthenticatedRootDecision() itself fails closed (never throws) -- its OUTER catch
    // absorbs the 57014/transaction failure. Session validation itself was cancelled before it
    // could ever positively succeed, so this MUST be anonymous, never /dashboard -- a cancelled
    // session-validation statement is exactly "session not proven," not "session proven, later
    // step failed."
    expect(caught).toBeNull();
    expect(result).toEqual({ kind: "anonymous" });
    expect(performance.now() - start).toBeLessThan(6_000);
    // santa-loop review finding: resolveAuthenticatedRootDecision() never throws, so
    // `reuse.kind` is ALWAYS defined regardless of pool health -- assert the exact expected
    // outcome (this session is still valid, no workspace -> /dashboard) within a tight elapsed
    // bound, so a poisoned/abandoned connection that only limps to a result via the 29s outer
    // backstop is still caught.
    const reuseStart = performance.now();
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse).toEqual({ kind: "redirect", href: "/dashboard" });
    expect(performance.now() - reuseStart).toBeLessThan(2_000);
  }, 15_000);

  it("POLICY_STATEMENT_CANCEL: a blocked statement during policy resolution fails closed to /dashboard, pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId);
    cookieHolder.token = token;
    // Non-control call #1 = session query; #2+ = policy's reads. Block #2 (policy phase).
    const { restore } = await patchPool({ 2: 10_000 })();
    let result;
    const start = performance.now();
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    const elapsedMs = performance.now() - start;
    expect(result).toEqual({ kind: "redirect", href: "/dashboard" });
    // santa-loop review finding: without this bound, a statement_timeout regression that let the
    // blocked statement run to completion (well within the 15s tx budget) could coincidentally
    // produce the SAME /dashboard result (e.g. a malformed row failing policy resolution) and still
    // pass. A real 57014 cancellation lands near the 2s statement_timeout, not anywhere close to it.
    expect(elapsedMs).toBeLessThan(6_000);
    // santa-loop review finding: assert the exact expected result (owner, no business ->
    // /owner/first-run) within a tight elapsed bound, not merely that SOME result came back.
    const reuseStart = performance.now();
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse).toEqual({ kind: "redirect", href: "/owner/first-run" });
    expect(performance.now() - reuseStart).toBeLessThan(2_000);
  }, 15_000);

  it("FIRST_RUN_STATEMENT_CANCEL (deep graph, real business): a blocked statement inside getFirstRunContext's business-exists fan-out fails closed to /dashboard -- NEVER /owner/cockpit -- not silently swallowed, pool reusable", async () => {
    // Database/security-review finding: resolveOwnerLoginHref()'s own pre-existing try/catch used to
    // swallow a mid-transaction statement cancellation here and return "/owner/cockpit" (a real
    // owner-labeled destination) without ever reaching this function's outer fail-closed/logging
    // path. Fixed by inlining the lookup in root-redirect.service.ts without that catch. This test
    // specifically targets the business-exists branch (prefetchOwnerDomainRows' fan-out,
    // firstRunEvidence, trustedInteractionFacts) that the swallow-bug actually lived in -- the
    // `makeWorkspaceWithOwner`-only fixture used elsewhere in this file never reaches it.
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap = (await createFinancialSnapshot(business.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(business.id, snap.id, userId, workspaceId);
    cookieHolder.token = token;

    // Non-control calls: #1 session, #2-5 policy's 4 reads, #6+ owner-first-run (membership, then
    // getFirstRunContext's workspace+business parallel pair, then the business-exists fan-out).
    // Block deep in the fan-out, well past where ownerHome is already proven true.
    const { restore } = await patchPool({ 9: 10_000 })();
    let result: unknown;
    let caughtOwnerCockpit = false;
    const start = performance.now();
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    const elapsedMs = performance.now() - start;
    if ((result as { href?: string })?.href === "/owner/cockpit") caughtOwnerCockpit = true;
    expect(caughtOwnerCockpit).toBe(false);
    expect(result).toEqual({ kind: "redirect", href: "/dashboard" });
    // santa-loop review finding: bounds this to "cancelled near the 2s statement_timeout," not
    // merely "eventually resolved somewhere under the 15s tx budget" -- the latter would also be
    // satisfied by the blocked statement simply completing late but successfully.
    expect(elapsedMs).toBeLessThan(6_000);
    // santa-loop review finding: assert the exact expected result (full evidence + diagnosis, no
    // trusted interaction -> FIRST_RESULT -> /owner/cockpit) within a tight elapsed bound.
    const reuseStart = performance.now();
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse).toEqual({ kind: "redirect", href: "/owner/cockpit" });
    expect(performance.now() - reuseStart).toBeLessThan(2_000);
  }, 15_000);

  it("AUTH_ROOT_TX_TIMEOUT: cumulative sub-statement-timeout delays exceed the 15s whole-transaction budget -> fails closed, pool reusable", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    const workspaceId = await makeWorkspaceWithOwner(userId);
    const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
    const snap = (await createFinancialSnapshot(business.id, quick() as never, userId, workspaceId)) as { id: string };
    await runFinanceDiagnosis(business.id, snap.id, userId, workspaceId);
    cookieHolder.token = token;
    // A real, fully-diagnosed business gives this transaction a long enough statement graph
    // (session + policy + the full owner-first-run fan-out, well over 15 statements) that letting
    // ALL of them run to completion -- which is what a widened/broken inner timeout would allow --
    // takes meaningfully longer than being cut off at the real 15s budget. 1.9s/statement (well
    // under the 2s statement_timeout) for up to 25 statements.
    const injectAt: Record<number, number> = {};
    for (let i = 1; i <= 25; i++) injectAt[i] = 1_900;
    const { restore } = await patchPool(injectAt)();
    let result;
    const start = performance.now();
    try {
      result = await resolveAuthenticatedRootDecision();
    } finally {
      restore();
    }
    const elapsedMs = performance.now() - start;
    // santa-loop review finding: this fixture's business has full evidence + diagnosis but no
    // trusted interaction, so a LEGITIMATE, non-cancelled completion of the real graph would also
    // resolve "/owner/cockpit" (FIRST_RESULT state) -- a bare `result.kind === "redirect"` check
    // cannot tell that apart from the cumulative delays actually tripping the 15s tx timeout. Assert
    // the exact fail-closed destination so a widened/broken inner timeout that merely lets the real
    // graph finish within the elapsed-time window is still caught.
    expect(result).toEqual({ kind: "redirect", href: "/dashboard" });
    expect(elapsedMs).toBeGreaterThan(14_000); // actually paid the cumulative delay, not a fast path
    // Tight upper bound: this must be caught by the INNER 15s db.$transaction `timeout`, not merely
    // by the outer 29s safety-net race (mutation-review finding: a 29_000ms bound alone does not
    // distinguish the two -- a widened/broken inner timeout still resolves "redirect" by ~29s via
    // the outer race, silently passing a loose assertion).
    expect(elapsedMs).toBeLessThan(ROOT_AUTH_TX_TIMEOUT_MS + ROOT_AUTH_STATEMENT_TIMEOUT_MS + 5_000);
    // santa-loop review finding: assert the exact expected result within a tight elapsed bound,
    // not merely that SOME result came back (true even on a poisoned pool, via the 29s backstop).
    const reuseStart = performance.now();
    const reuse = await resolveAuthenticatedRootDecision();
    expect(reuse).toEqual({ kind: "redirect", href: "/owner/cockpit" });
    expect(performance.now() - reuseStart).toBeLessThan(2_000);
  }, 60_000);

  it("AUTH_ROOT_MAXWAIT: 3s/8s contention succeed, >10s contention fails closed to ANONYMOUS (transaction body never started)", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const results: Record<string, unknown> = {};
    const elapsed: Record<string, number> = {};
    for (const seconds of [3, 8, 12]) {
      const { userId, token } = await makeUserAndSession();
      await makeWorkspaceWithOwner(userId);
      cookieHolder.token = token;
      const blocker = (db as unknown as { $executeRawUnsafe: (q: string) => Promise<unknown> }).$executeRawUnsafe(`SELECT pg_sleep(${seconds})`).catch(() => undefined);
      const start = performance.now();
      const result = await resolveAuthenticatedRootDecision();
      elapsed[`${seconds}s`] = performance.now() - start;
      await blocker;
      results[`${seconds}s`] = result;
    }
    // santa-loop review finding: a bare `kind === "redirect"` check is also satisfied by a
    // transaction that failed mid-flight (policy/owner-first-run) for an unrelated reason -- assert
    // the exact destination this specific fixture (workspace + owner role, no business) resolves to.
    expect(results["3s"]).toEqual({ kind: "redirect", href: "/owner/first-run" });
    expect(results["8s"]).toEqual({ kind: "redirect", href: "/owner/first-run" });
    // Over maxWait: the transaction body never started (session never established) -> anonymous,
    // never /dashboard -- this is the P2028-acquisition-class fail-closed semantic from Part 17.
    // Elapsed must be bounded by ROOT_AUTH_MAX_WAIT_MS specifically, not the much longer 29s outer
    // backstop -- otherwise a broken/removed maxWait could still resolve "anonymous" late via some
    // other failure and silently pass.
    expect(results["12s"]).toEqual({ kind: "anonymous" });
    expect(elapsed["12s"]).toBeGreaterThan(ROOT_AUTH_MAX_WAIT_MS - 1_000);
    expect(elapsed["12s"]).toBeLessThan(ROOT_AUTH_MAX_WAIT_MS + 5_000);
  }, 40_000);
});

describe.skipIf(SKIP)("[db] root-redirect single-transaction: concurrency (4/4 required scenarios)", () => {
  it("scenario 1: two authenticated roots concurrently resolve correctly, no cross-contamination", async () => {
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    // santa-loop review finding: A and B must resolve to DIFFERENT destinations, or a swapped/
    // cross-contaminated result would still satisfy a bare `kind === "redirect"` check for both.
    const a = await makeUserAndSession();
    await makeWorkspaceWithOwner(a.userId); // owner, no business -> "/owner/first-run"
    const b = await makeUserAndSession(); // no workspace at all -> "/dashboard"

    cookieHolder.token = a.token;
    const pA = resolveAuthenticatedRootDecision();
    cookieHolder.token = b.token;
    const pB = resolveAuthenticatedRootDecision();
    const [resA, resB] = await Promise.all([pA, pB]);
    expect(resA).toEqual({ kind: "redirect", href: "/owner/first-run" });
    expect(resB).toEqual({ kind: "redirect", href: "/dashboard" });
  }, 20_000);

  it("scenario 2: authenticated root + anonymous root concurrently resolve correctly, no cross-contamination", async () => {
    // santa-loop review finding: this test's own name previously claimed "anonymous makes zero DB
    // queries," which nothing here verified, and under concurrency a per-call connect count can't
    // be cleanly attributed to one call vs. the other anyway -- the dedicated single-call
    // "ANONYMOUS: no cookie ... zero DB queries" test above instruments that claim precisely. This
    // test's own job is just the concurrency outcome: two different fixtures, so a swapped or
    // contaminated result is distinguishable.
    const { resolveAuthenticatedRootDecision } = await freshDecisionModule();
    const { userId, token } = await makeUserAndSession();
    await makeWorkspaceWithOwner(userId); // owner, no business -> "/owner/first-run"

    cookieHolder.token = token;
    const pAuth = resolveAuthenticatedRootDecision();
    cookieHolder.token = undefined;
    const pAnon = resolveAuthenticatedRootDecision();
    const [resAuth, resAnon] = await Promise.all([pAuth, pAnon]);
    expect(resAuth).toEqual({ kind: "redirect", href: "/owner/first-run" });
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
