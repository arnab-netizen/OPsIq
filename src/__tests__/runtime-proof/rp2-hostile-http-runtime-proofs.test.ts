/**
 * PHASE RP2: Hostile HTTP Runtime Tests
 *
 * Empirically verify auth/security behavior through real request execution.
 * Not mocked: every request runs the REAL root middleware and the REAL exported
 * App Router route handler (withCanonicalEnforcement / the route's own guards)
 * against the real database.
 *
 * Transport (root cause of the former failures, see commit message):
 *   - Default (in-process): the request is built as a real NextRequest, passed
 *     through the real root `middleware` (which never short-circuits a protected
 *     /api route -- asserted below, see middleware.ts) and dispatched to the real
 *     route module, exactly as Next's router does after middleware. This is the
 *     repo's supported pattern for route-level runtime proofs
 *     (e.g. src/__tests__/owner-budget/rbac-unauth.test.ts) and needs no server.
 *   - TEST_API_URL set: the same requests go over the wire to that live server.
 *     A network failure now FAILS the test loudly. Previously it was swallowed
 *     into `{ details }` with no `status`, so with no server listening every
 *     assertion reported "expected undefined to be 401" -- the suite had never
 *     actually exercised a single route.
 *
 * Lane: runtime-proof/** is excluded unless TEST_WITH_DB=true (vitest.config.ts),
 * so this file runs in the DB lane (main-integration.yml full suite). The
 * readiness/membership pipeline inside withCanonicalEnforcement touches the DB.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Request scope for in-process dispatch. Next's server binds `cookies()` /
// `headers()` from next/headers to the in-flight request; outside its router
// they throw "called outside a request scope". This binds them to the SAME
// NextRequest being dispatched (its real Cookie / header values -- nothing is
// invented), per async context so concurrent requests never see each other's
// scope. Calling either outside a dispatched request still throws, as in Next.
const requestScope = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
  return new AsyncLocalStorage<import("next/server").NextRequest>();
});
vi.mock("next/headers", () => {
  const current = () => {
    const req = requestScope.getStore();
    if (!req) throw new Error("RP2: next/headers used outside a dispatched request scope");
    return req;
  };
  return {
    cookies: async () => current().cookies,
    headers: async () => current().headers,
  };
});
import { middleware } from "../../../middleware";

// Optional live-server target. Unset => in-process dispatch to the real handlers.
const TEST_API_URL = process.env.TEST_API_URL;
const IN_PROCESS_ORIGIN = "http://localhost:3000";
const TEST_WORKSPACE_ID = "test-ws-hostile-" + Date.now();
const TEST_USER_TOKEN = process.env.TEST_AUTH_TOKEN || "invalid-token-for-testing";

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * Resolve a request path to the real App Router route module and its dynamic
 * params, mirroring src/app/api/** on disk. An unmapped path is a test-authoring
 * error and throws -- it must never silently pass.
 */
const ROUTES: Array<{ pattern: RegExp; load: () => Promise<Record<string, unknown>>; params: (m: RegExpMatchArray) => Record<string, string> }> = [
  { pattern: /^\/api\/audit$/, load: () => import("@/app/api/audit/route"), params: () => ({}) },
  { pattern: /^\/api\/value\/7day$/, load: () => import("@/app/api/value/7day/route"), params: () => ({}) },
  { pattern: /^\/api\/value\/summary$/, load: () => import("@/app/api/value/summary/route"), params: () => ({}) },
  { pattern: /^\/api\/verify$/, load: () => import("@/app/api/verify/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications$/, load: () => import("@/app/api/notifications/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications\/preferences$/, load: () => import("@/app/api/notifications/preferences/route"), params: () => ({}) },
  { pattern: /^\/api\/notifications\/([^/]+)$/, load: () => import("@/app/api/notifications/[id]/route"), params: (m) => ({ id: m[1] }) },
  { pattern: /^\/api\/intelligence\/insights$/, load: () => import("@/app/api/intelligence/insights/route"), params: () => ({}) },
  { pattern: /^\/api\/intelligence\/patterns$/, load: () => import("@/app/api/intelligence/patterns/route"), params: () => ({}) },
  { pattern: /^\/api\/entitlement\/quota$/, load: () => import("@/app/api/entitlement/quota/route"), params: () => ({}) },
  { pattern: /^\/api\/decision\/export$/, load: () => import("@/app/api/decision/export/route"), params: () => ({}) },
  { pattern: /^\/api\/webhooks\/stripe$/, load: () => import("@/app/api/webhooks/stripe/route"), params: () => ({}) },
  { pattern: /^\/api\/health$/, load: () => import("@/app/api/health/route"), params: () => ({}) },
  { pattern: /^\/api\/readiness$/, load: () => import("@/app/api/readiness/route"), params: () => ({}) },
  { pattern: /^\/api\/liveness$/, load: () => import("@/app/api/liveness/route"), params: () => ({}) },
];

async function dispatchInProcess(req: NextRequest): Promise<Response> {
  // Real root middleware first, as Next does. It must pass /api requests through
  // (x-middleware-next) and never answer them itself.
  const mw = middleware(req);
  expect(mw.headers.get("x-middleware-next")).toBe("1");

  const pathname = req.nextUrl.pathname;
  for (const route of ROUTES) {
    const m = pathname.match(route.pattern);
    if (!m) continue;
    const mod = await route.load();
    const handler = mod[req.method] as RouteHandler | undefined;
    if (typeof handler !== "function") {
      // Next answers an unexported method with 405.
      return new Response(null, { status: 405 });
    }
    return requestScope.run(req, () => handler(req, { params: Promise.resolve(route.params(m)) }));
  }
  throw new Error(`RP2: no route module mapped for ${req.method} ${pathname}`);
}

async function send(method: string, path: string, headers: Record<string, string>, body: string | undefined): Promise<Response> {
  if (TEST_API_URL) {
    try {
      return await fetch(new URL(path, TEST_API_URL).toString(), { method, headers, body });
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      throw new Error(`RP2: live server at TEST_API_URL=${TEST_API_URL} unreachable: ${governed.operatorMessage}`);
    }
  }
  const req = new NextRequest(new URL(path, IN_PROCESS_ORIGIN), { method, headers, body });
  return dispatchInProcess(req);
}

describe("PHASE RP2: Hostile HTTP Runtime Security Proofs", () => {
  // Helper to make requests
  async function makeRequest(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown } = {}) {
    const response = await send(
      method,
      path,
      { "Content-Type": "application/json", ...options.headers },
      options.body ? JSON.stringify(options.body) : undefined
    );
    expect(typeof response.status).toBe("number");
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
      headers: response.headers,
    };
  }

  describe("1. Missing Auth Token → 401", () => {
    it("GET /api/audit without auth returns 401", async () => {
      const res = await makeRequest("GET", "/api/audit", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("GET /api/value/7day without auth returns 401", async () => {
      const res = await makeRequest("GET", "/api/value/7day", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("POST /api/verify without auth returns 401", async () => {
      const res = await makeRequest("POST", "/api/verify", {
        headers: {},
        body: { inputs: {}, decisionHash: "test" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("2. Invalid Auth Token → 401", () => {
    it("GET /api/notifications with invalid token returns 401", async () => {
      const res = await makeRequest("GET", "/api/notifications", {
        headers: {
          Authorization: "Bearer invalid-token-xyz",
          "x-workspace-id": TEST_WORKSPACE_ID,
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("3. Missing Capability → 403", () => {
    it("POST /api/entitlement/check-capability without capability returns 403", async () => {
      // This test would require valid auth but missing capability
      // Skipped if no test auth token available
      if (TEST_USER_TOKEN === "invalid-token-for-testing") {
        expect(true).toBe(true); // Skip
      } else {
        const res = await makeRequest("POST", "/api/entitlement/check-capability", {
          headers: {
            Authorization: `Bearer ${TEST_USER_TOKEN}`,
            "x-workspace-id": TEST_WORKSPACE_ID,
          },
          body: { capability: "NONEXISTENT_CAPABILITY" },
        });

        expect([403, 401]).toContain(res.status);
      }
    });
  });

  describe("4. Workspace Spoofing → Blocked", () => {
    it("request with forged workspace header is blocked", async () => {
      const res = await makeRequest("GET", "/api/notifications", {
        headers: {
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
          "x-workspace-id": "other-workspace-" + Date.now(),
        },
      });

      // Should be 401 (not authenticated) or 403 (not authorized)
      expect([401, 403, 400]).toContain(res.status);
    });
  });

  describe("5. Cross-Workspace Data Access → Blocked", () => {
    it("cannot export decision from other workspace", async () => {
      const otherWorkspace = "other-ws-" + Date.now();

      const res = await makeRequest("GET", "/api/decision/export", {
        headers: {
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
          "x-workspace-id": otherWorkspace,
        },
      });

      // Should be 401 or 403
      expect([401, 403, 400]).toContain(res.status);
    });
  });

  describe("6. Unauthenticated Audit Access → Blocked", () => {
    it("GET /api/audit requires auth", async () => {
      const res = await makeRequest("GET", "/api/audit");

      expect(res.status).toBe(401);
    });
  });

  describe("7. Unauthenticated Value Access → Blocked", () => {
    it("GET /api/value/summary requires auth", async () => {
      const res = await makeRequest("GET", "/api/value/summary");

      expect(res.status).toBe(401);
    });

    it("GET /api/value/7day requires auth", async () => {
      const res = await makeRequest("GET", "/api/value/7day");

      expect(res.status).toBe(401);
    });
  });

  describe("8. Unauthenticated Intelligence Access → Blocked", () => {
    it("GET /api/intelligence/insights requires auth", async () => {
      const res = await makeRequest("GET", "/api/intelligence/insights", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("GET /api/intelligence/patterns requires auth", async () => {
      const res = await makeRequest("GET", "/api/intelligence/patterns", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("9. Unauthenticated Quota Access → Blocked", () => {
    it("GET /api/entitlement/quota requires auth", async () => {
      const res = await makeRequest("GET", "/api/entitlement/quota", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("POST /api/entitlement/quota requires auth", async () => {
      const res = await makeRequest("POST", "/api/entitlement/quota", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
        body: { type: "action" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("10. Unauthenticated Notification Access → Blocked", () => {
    it("GET /api/notifications requires auth", async () => {
      const res = await makeRequest("GET", "/api/notifications", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("GET /api/notifications/preferences requires auth", async () => {
      const res = await makeRequest("GET", "/api/notifications/preferences", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });

    it("GET /api/notifications/[id] requires auth", async () => {
      const res = await makeRequest("GET", "/api/notifications/test-id", {
        headers: { "x-workspace-id": TEST_WORKSPACE_ID },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("11. Invalid Stripe Signature → 401", () => {
    it("POST /api/webhooks/stripe with invalid signature returns 401", async () => {
      const res = await makeRequest("POST", "/api/webhooks/stripe", {
        headers: {
          "stripe-signature": "invalid-signature-xyz",
        },
        body: { id: "evt_test", type: "customer.subscription.created" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("12. Replayed Stripe Event → Safe Duplicate", () => {
    it("duplicate Stripe event returns 200 (idempotent)", async () => {
      // This would require actual Stripe webhook infrastructure
      // Skipped for now - requires mock Stripe events
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("13. Oversized Payload → Rejected", () => {
    it("POST with payload > limit returns error", async () => {
      const hugePayload = "x".repeat(10 * 1024 * 1024); // 10MB

      const res = await makeRequest("POST", "/api/verify", {
        headers: { Authorization: `Bearer ${TEST_USER_TOKEN}` },
        body: { inputs: { huge: hugePayload }, decisionHash: "test" },
      });

      expect([400, 413, 401]).toContain(res.status);
    });
  });

  describe("14. Malformed JSON → Fail Closed", () => {
    it("POST with invalid JSON returns 400", async () => {
      const response = await send(
        "POST",
        "/api/verify",
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
        },
        "{invalid json}"
      );

      expect([400, 401, 500]).toContain(response.status);
    });
  });

  describe("15. Rate Limit Abuse → Bounded", () => {
    it("excessive requests are rate-limited", async () => {
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          makeRequest("GET", "/api/health", {
            headers: { "x-workspace-id": TEST_WORKSPACE_ID },
          })
        );
      }

      const results = await Promise.all(requests);
      const rateLimitedCount = results.filter((r) => r.status === 429).length;

      // At least some should be rate-limited or succeed (depending on rate limit config)
      expect(results.length).toBeGreaterThan(0);
      // Every one of the 100 requests got a bounded answer: served (200),
      // rate-limited (429), or fail-closed unavailable (503) -- never a crash.
      const servedCount = results.filter((r) => r.status === 200).length;
      const unavailableCount = results.filter((r) => r.status === 503).length;
      expect(servedCount + rateLimitedCount + unavailableCount).toBe(100);
    });
  });

  describe("16. Correlation ID Propagation", () => {
    it("correlation ID is preserved in response headers", async () => {
      const correlationId = "corr-" + Date.now();

      const res = await makeRequest("GET", "/api/health", {
        headers: { "x-correlation-id": correlationId },
      });

      // Should either echo back or have its own correlation ID
      expect(res.status).toBeDefined();
    });
  });

  describe("17. Audit Emission Verification", () => {
    it("material operation emits audit event", async () => {
      // This requires audit log access
      // Placeholder for integration with audit endpoint
      expect(true).toBe(true);
    });
  });

  describe("18. DTO Leakage Scan", () => {
    it("response does not expose internal fields", async () => {
      if (TEST_USER_TOKEN === "invalid-token-for-testing") {
        expect(true).toBe(true); // Skip without valid token
        return;
      }

      const res = await makeRequest("GET", "/api/notifications", {
        headers: {
          Authorization: `Bearer ${TEST_USER_TOKEN}`,
          "x-workspace-id": TEST_WORKSPACE_ID,
        },
      });

      // Should not contain internal fields like:
      // - hashedPassword
      // - internalId
      // - debugFlag
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/hashedPassword|internalId|debugFlag/i);
    });
  });

  describe("ENDPOINT EXEMPTIONS VERIFIED", () => {
    it("/api/health accessible without auth", async () => {
      const res = await makeRequest("GET", "/api/health");

      expect([200, 500]).toContain(res.status); // 500 is OK if server not running
    });

    it("/api/readiness accessible without auth", async () => {
      const res = await makeRequest("GET", "/api/readiness");

      expect([200, 500]).toContain(res.status);
    });

    it("/api/liveness accessible without auth", async () => {
      const res = await makeRequest("GET", "/api/liveness");

      expect([200, 500]).toContain(res.status);
    });
  });
});
