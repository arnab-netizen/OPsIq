/**
 * F-AUTH-ROOT-FAST-FAIL RED-before-fix / GREEN-after-fix proof.
 *
 * THE GAP THIS TEST DEMONSTRATES, PRE-FIX: the authenticated root route's
 * redirect decision (policy-context resolution, then owner-login-href
 * resolution for a proven self-serve owner) had no caller-side bound at
 * all -- a hung nested read anywhere in that decision would have hung the
 * whole route indefinitely (bounded only by Vercel's 300s function
 * ceiling). This suite exercises resolveAuthenticatedRootDestination()
 * directly, with the underlying policy/owner-login calls mocked to hang or
 * fail, proving: (1) the decision is now bounded well under
 * AUTH_ROOT_DECISION_TIMEOUT_MS, (2) it ALWAYS fails closed to "/dashboard"
 * on timeout or error -- never an owner-surface redirect, and (3) a healthy
 * owner resolution still reaches the real owner destination.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { getPolicyContextForSession as GetPolicyContextForSession } from "@/services/auth";
import type { isSelfServeOwnerContext as IsSelfServeOwnerContext } from "@/policies/capability-check";
import type { resolveOwnerLoginHref as ResolveOwnerLoginHref } from "@/services/owner-first-run/first-run.service";

// TypeScript-review finding (MEDIUM #3): typed against the real functions'
// signatures, not bare vi.fn() -- a future signature change to any of
// these (param order, new required arg, narrower return type) now fails
// `tsc --noEmit` on this file instead of silently passing while the mock
// quietly diverges from the real contract.
const mocks = vi.hoisted(() => ({
  getPolicyContextForSession: vi.fn<typeof GetPolicyContextForSession>(),
  isSelfServeOwnerContext: vi.fn<typeof IsSelfServeOwnerContext>(),
  resolveOwnerLoginHref: vi.fn<typeof ResolveOwnerLoginHref>(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: { warn: mocks.loggerWarn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/auth", () => ({
  getPolicyContextForSession: mocks.getPolicyContextForSession,
  // Real values (not placeholders) -- root-redirect.service.ts derives its
  // own exported AUTH_ROOT_DECISION_TIMEOUT_MS (and the module-load safety
  // assertion against Vercel's 300s ceiling) from these at module-eval
  // time, so this suite exercises the REAL budget, not an arbitrary mock
  // number (database-review finding H1, rounds 1-3).
  //   SESSION_QUERY_TIMEOUT_MS = withRawStatementTimeoutWorstCaseMs(4000) + 3000
  //                            = (90000+4000+5000+5000) + 3000 = 107000
  //   POLICY_CONTEXT_QUERY_TIMEOUT_MS = withRawStatementTimeoutWorstCaseMs(4000, 20000) + 3000
  //                            = (90000+4000+20000+5000) + 3000 = 122000
  // (round 3 enlarged the multi-statement backstop margin to
  // POLICY_CONTEXT_MAIN_BACKSTOP_MARGIN_MS=20000 -- santa-loop review
  // finding: this mock had drifted stale at the pre-round-3 value of 107000
  // after that change; kept as a LITERAL, not re-derived via import, so a
  // real drift between this value and auth.ts's actual export is caught by
  // the dedicated constant-drift test below, not silently hidden.)
  POLICY_CONTEXT_STATEMENT_TIMEOUT_MS: 4000,
  POLICY_CONTEXT_QUERY_TIMEOUT_MS: 122000,
  SESSION_QUERY_TIMEOUT_MS: 107000,
}));

vi.mock("@/policies/capability-check", () => ({
  isSelfServeOwnerContext: mocks.isSelfServeOwnerContext,
}));

vi.mock("@/services/owner-first-run/first-run.service", () => ({
  resolveOwnerLoginHref: mocks.resolveOwnerLoginHref,
}));

import { resolveAuthenticatedRootDestination, AUTH_ROOT_DECISION_TIMEOUT_MS } from "@/services/root-redirect.service";

const SESSION = {
  user: { id: "user-1", email: "a@b.com", name: "A", isActive: true },
  sessionId: "sess-1",
  expiresAt: new Date(Date.now() + 60_000),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mocked constants vs. the real module — drift guard", () => {
  it("the literal values mocked above for @/services/auth match the REAL exports, so this suite's budget assertions are not silently testing a stale number", async () => {
    const real = await vi.importActual<typeof import("@/services/auth")>("@/services/auth");
    expect(real.POLICY_CONTEXT_STATEMENT_TIMEOUT_MS).toBe(4000);
    expect(real.POLICY_CONTEXT_QUERY_TIMEOUT_MS).toBe(122000);
    expect(real.SESSION_QUERY_TIMEOUT_MS).toBe(107000);
  });
});

describe("resolveAuthenticatedRootDestination() — F-AUTH-ROOT-FAST-FAIL", () => {
  it("resolves to the owner destination for a real self-serve owner, well under the decision budget", async () => {
    mocks.getPolicyContextForSession.mockResolvedValue({ userId: "user-1", roles: [] });
    mocks.isSelfServeOwnerContext.mockReturnValue(true);
    mocks.resolveOwnerLoginHref.mockResolvedValue("/owner/cockpit");

    const start = Date.now();
    const dest = await resolveAuthenticatedRootDestination(SESSION);
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(dest).toBe("/owner/cockpit");
  });

  it(
    "santa-loop review finding (both independent reviewers): actually calls getPolicyContextForSession WITH the statementTimeoutMs option -- deleting that option (the core database fix for this route) would otherwise leave every other test in this file green",
    async () => {
      mocks.getPolicyContextForSession.mockResolvedValue({ userId: "user-1", roles: [] });
      mocks.isSelfServeOwnerContext.mockReturnValue(false);

      await resolveAuthenticatedRootDestination(SESSION);

      expect(mocks.getPolicyContextForSession).toHaveBeenCalledWith(SESSION, undefined, { statementTimeoutMs: 4000 });
    },
  );

  it("resolves to /dashboard for a non-owner actor without ever calling resolveOwnerLoginHref", async () => {
    mocks.getPolicyContextForSession.mockResolvedValue({ userId: "user-1", roles: [] });
    mocks.isSelfServeOwnerContext.mockReturnValue(false);

    const dest = await resolveAuthenticatedRootDestination(SESSION);
    expect(dest).toBe("/dashboard");
    expect(mocks.resolveOwnerLoginHref).not.toHaveBeenCalled();
  });

  it("resolves to /dashboard (fail closed) when policy-context lookup throws", async () => {
    mocks.getPolicyContextForSession.mockRejectedValue(new Error("db exploded"));

    const dest = await resolveAuthenticatedRootDestination(SESSION);
    expect(dest).toBe("/dashboard");
  });

  it("resolves to /dashboard (fail closed) when policy context is null", async () => {
    mocks.getPolicyContextForSession.mockResolvedValue(null);

    const dest = await resolveAuthenticatedRootDestination(SESSION);
    expect(dest).toBe("/dashboard");
    expect(mocks.isSelfServeOwnerContext).not.toHaveBeenCalled();
  });

  it(
    "RED-before/GREEN-after: when the policy-context lookup hangs forever, the decision still resolves within the bounded budget (not sooner, not later), failing closed to /dashboard -- never hangs the caller",
    async () => {
      // Fake timers (TypeScript/fresh-context review finding): the real
      // AUTH_ROOT_DECISION_TIMEOUT_MS budget is now ~152s (derived from
      // POOL_CONNECTION_TIMEOUT_MS, database-review finding H1) -- waiting
      // that out with real timers on every CI run is exactly the wall-clock
      // cost those reviews flagged. Advancing virtual time proves the same
      // bound deterministically and near-instantly.
      vi.useFakeTimers();
      try {
        mocks.getPolicyContextForSession.mockImplementation(() => new Promise(() => {})); // never resolves

        let settled = false;
        const resultPromise = resolveAuthenticatedRootDestination(SESSION).finally(() => {
          settled = true;
        });

        // One tick short of the budget: santa-loop review finding -- this
        // step previously advanced time but asserted NOTHING, so it would
        // have passed even if the backstop fired at 1ms. Now actually
        // proves the promise has NOT settled yet at T-1.
        await vi.advanceTimersByTimeAsync(AUTH_ROOT_DECISION_TIMEOUT_MS - 1);
        expect(settled).toBe(false);

        // Exactly at the budget: the backstop fires and the race settles.
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toBe(true);

        expect(await resultPromise).toBe("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it(
    "RED-before/GREEN-after: when a proven owner's resolveOwnerLoginHref() itself hangs forever, the decision still fails closed to /dashboard within budget -- a hang can only ever REDUCE access, never grant the owner surface",
    async () => {
      vi.useFakeTimers();
      try {
        mocks.getPolicyContextForSession.mockResolvedValue({ userId: "user-1", roles: [] });
        mocks.isSelfServeOwnerContext.mockReturnValue(true);
        mocks.resolveOwnerLoginHref.mockImplementation(() => new Promise(() => {})); // never resolves

        const resultPromise = resolveAuthenticatedRootDestination(SESSION);
        await vi.advanceTimersByTimeAsync(AUTH_ROOT_DECISION_TIMEOUT_MS);

        expect(await resultPromise).toBe("/dashboard");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("never grants the owner surface when resolveOwnerLoginHref rejects", async () => {
    mocks.getPolicyContextForSession.mockResolvedValue({ userId: "user-1", roles: [] });
    mocks.isSelfServeOwnerContext.mockReturnValue(true);
    mocks.resolveOwnerLoginHref.mockRejectedValue(new Error("boom"));

    const dest = await resolveAuthenticatedRootDestination(SESSION);
    expect(dest).toBe("/dashboard");
  });
});
