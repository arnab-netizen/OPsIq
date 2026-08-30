/**
 * Login duplicate-session reproduction — PostgreSQL contract.
 *
 * Production evidence (2026-08-30 manual signup acceptance): one intentional login
 * action (via the browser UI, which drives POST /api/auth/login through
 * useOperatorMutation) left 2 valid, unrevoked Session rows for a user who had
 * exactly 1 valid session immediately before that action.
 *
 * Root cause traced by code reading, proven here against a real database:
 *  - POST /api/auth/login never reads `request.signal` and has no idempotency
 *    key or existing-session check. It unconditionally executes
 *    `db.session.create(...)` on every successful invocation.
 *  - useOperatorMutation aborts the in-flight request's AbortController when the
 *    same mutation is timed out or re-invoked, but an abort()'d fetch() does NOT
 *    stop the server from finishing an already-dispatched Next.js route handler
 *    that never observes that signal. The client only stops *waiting* for the
 *    first response; the server-side write still commits.
 *
 * These tests exercise the REAL route handler (no direct db.session.create()
 * stand-in) to prove that two overlapping/duplicate invocations for a single
 * logical login action produce two Session rows, and that a later, deliberate,
 * fully-independent login is unaffected.
 *
 * Skipped when TEST_WITH_DB is not set; runs against a real local/CI Postgres.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] login duplicate-session reproduction — one logical action, real route handler",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const password = "correct-horse-battery-staple";
    const email = `login-dup-repro-${stamp}@test.local`;
    const workspaceId = randomUUID();
    let userId: string;

    const loginRequest = (ip: string) =>
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password }),
      });

    // Invoke the real route handler. Session creation happens well before the
    // cookie_set stage, so even a sandbox-induced cookie_set failure (next/headers
    // outside a request scope) does not affect whether the DB write committed —
    // it only affects the HTTP response, which these tests do not assert on.
    const invokeLogin = async (ip: string) => {
      try {
        await loginPOST(loginRequest(ip) as never);
      } catch {
        // Ignore — only the persisted Session rows are the proof surface.
      }
    };

    const sessionCount = () => db.session.count({ where: { userId } });
    const auditEventCount = () =>
      db.auditEvent.count({ where: { actorId: userId, eventName: "user.logged_in" } });

    beforeAll(async () => {
      userId = randomUUID();
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.user.create({
        data: { id: userId, email, hashedPassword, isActive: true, updatedAt: new Date() },
      });
      // emitAuditEvent fail-safes to a no-op (by design, for workspace isolation)
      // when workspaceId is absent, so a membership is required for the audit-event
      // assertions below to exercise the real write path rather than the fail-safe.
      await db.workspace.create({ data: { id: workspaceId, name: "Login Dup Repro WS", slug: `login-dup-repro-${stamp}` } });
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId, role: "owner" },
      });
    });

    afterAll(async () => {
      await db.session.deleteMany({ where: { userId } });
      await db.auditEvent.deleteMany({ where: { actorId: userId } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    // afterEach (not a tail-of-test call) so a failed assertion still resets
    // state before the next test runs, instead of corrupting its counts.
    afterEach(async () => {
      await db.session.deleteMany({ where: { userId } });
      await db.auditEvent.deleteMany({ where: { actorId: userId, eventName: "user.logged_in" } });
    });

    it("[db] baseline: a single login invocation creates exactly one Session and one user.logged_in audit event", async () => {
      await invokeLogin("203.0.113.20");
      expect(await sessionCount()).toBe(1);
      expect(await auditEventCount()).toBe(1);
    });

    it("[db] REPRODUCES THE DEFECT: two concurrent invocations for one logical action create two Sessions and two audit events — the server has no dedup of its own (SERVER_LOGIN_ENDPOINT_IDEMPOTENT = NO)", async () => {
      // Simulates: client fires request 1, then (timeout fires, or the user
      // clicks again) fires request 2 before request 1's response is used —
      // both server-side executions are allowed to run to completion, exactly
      // as they do in production because the route never observes the client's
      // AbortController.
      await Promise.all([invokeLogin("203.0.113.21"), invokeLogin("203.0.113.21")]);

      // THIS IS THE PROVEN DEFECT AT THE SERVER LAYER: expected <= 1 for one
      // logical action, actual 2. The chosen fix (login/page.tsx) works by never
      // letting a second request reach this route for one logical action — it
      // does not, and is not claimed to, make this route itself idempotent. Two
      // independently-issued valid login POSTs may still legitimately create two
      // sessions and two audit events.
      expect(await sessionCount()).toBe(2);
      expect(await auditEventCount()).toBe(2);
    });

    it("[db] a later, deliberate, fully-sequential retry after the first action has settled is a distinct legitimate action and may create its own Session + audit event", async () => {
      await invokeLogin("203.0.113.22");
      expect(await sessionCount()).toBe(1);
      expect(await auditEventCount()).toBe(1);

      // Fully awaited before the next one starts — a genuinely new, independent
      // user-initiated login, not a client-side artifact of the first.
      await invokeLogin("203.0.113.22");
      expect(await sessionCount()).toBe(2);
      expect(await auditEventCount()).toBe(2);
    });
  }
);
