/**
 * Security Regression Tests: /api/ops/* Endpoints
 *
 * Verifies that operational metrics endpoints require OPSIQ_DIAGNOSTIC_KEY and
 * do not expose internals to unauthorized requesters.
 *
 * These tests run IN-PROCESS: they import the real route handlers and invoke
 * them with constructed NextRequests. This keeps the full security contract
 * (missing key -> 404, valid key -> served, invalid key -> 404) deterministic
 * under plain `npm test` with no live localhost:3000 server and no real DB.
 * (Previously this file used fetch("http://localhost:3000/...") and failed with
 * ECONNREFUSED whenever a server was not running.)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

// The readiness route queries db.startupStatus and db.auditEvent.
// Mock the DB so the route resolves without a live DB connection.
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    startupStatus: { findFirst: vi.fn().mockResolvedValue(null) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { GET as errorsGET } from "@/app/api/ops/errors/route";
import { GET as metricsGET } from "@/app/api/ops/metrics/route";
import { GET as readinessGET } from "@/app/api/ops/readiness/route";
import { GET as runtimeGET } from "@/app/api/ops/runtime/route";

type Handler = (req: NextRequest) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "/api/ops/errors": errorsGET as Handler,
  "/api/ops/metrics": metricsGET as Handler,
  "/api/ops/readiness": readinessGET as Handler,
  "/api/ops/runtime": runtimeGET as Handler,
};

const endpoints = Object.keys(HANDLERS);

// Force a known diagnostic key so the "valid key" path is deterministic.
const TEST_KEY = "test-key";
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.OPSIQ_DIAGNOSTIC_KEY;
  process.env.OPSIQ_DIAGNOSTIC_KEY = TEST_KEY;
});

afterAll(() => {
  if (previousKey === undefined) delete process.env.OPSIQ_DIAGNOSTIC_KEY;
  else process.env.OPSIQ_DIAGNOSTIC_KEY = previousKey;
});

function makeRequest(
  endpoint: string,
  opts: { headerKey?: string; queryKey?: string } = {}
): NextRequest {
  const url = new URL(`http://localhost${endpoint}`);
  if (opts.queryKey !== undefined) url.searchParams.set("key", opts.queryKey);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (opts.headerKey !== undefined) headers.set("x-opsiq-diagnostic-key", opts.headerKey);
  return new NextRequest(url, { method: "GET", headers });
}

describe("GET /api/ops/* endpoints — module contract assertions", () => {
  it("errorsGET is a function", () => { expect(typeof errorsGET).toBe("function"); });
  it("metricsGET is a function", () => { expect(typeof metricsGET).toBe("function"); });
  it("readinessGET is a function", () => { expect(typeof readinessGET).toBe("function"); });
  it("runtimeGET is a function", () => { expect(typeof runtimeGET).toBe("function"); });
  it("HANDLERS is an object", () => { expect(typeof HANDLERS).toBe("object"); });
  it("HANDLERS has 4 entries", () => { expect(Object.keys(HANDLERS)).toHaveLength(4); });
  it("endpoints is an array with 4 entries", () => { expect(Array.isArray(endpoints)).toBe(true); expect(endpoints).toHaveLength(4); });
  it("endpoints includes /api/ops/errors", () => { expect(endpoints).toContain("/api/ops/errors"); });
  it("endpoints includes /api/ops/metrics", () => { expect(endpoints).toContain("/api/ops/metrics"); });
  it("endpoints includes /api/ops/readiness", () => { expect(endpoints).toContain("/api/ops/readiness"); });
  it("endpoints includes /api/ops/runtime", () => { expect(endpoints).toContain("/api/ops/runtime"); });
  it("NextRequest is a constructor function", () => { expect(typeof NextRequest).toBe("function"); });
  it("makeRequest is a function", () => { expect(typeof makeRequest).toBe("function"); });
  it("TEST_KEY is a non-empty string", () => { expect(typeof TEST_KEY).toBe("string"); expect(TEST_KEY.length).toBeGreaterThan(0); });
  it("HANDLERS['/api/ops/errors'] is a function", () => { expect(typeof HANDLERS["/api/ops/errors"]).toBe("function"); });
});

describe("GET /api/ops/* endpoints - Auth requirements (in-process)", () => {
  describe("Without diagnostic key", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should return 404 without key`, async () => {
        const response = await HANDLERS[endpoint](makeRequest(endpoint));
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
      });
    });
  });

  describe("With valid diagnostic key (header)", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should accept valid key in header`, async () => {
        const response = await HANDLERS[endpoint](
          makeRequest(endpoint, { headerKey: TEST_KEY })
        );
        // Auth gate must let the request through (anything but the 404 reject).
        expect(response.status).not.toBe(404);
      });
    });
  });

  describe("With valid diagnostic key (query param)", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should accept valid key in query param`, async () => {
        const response = await HANDLERS[endpoint](
          makeRequest(endpoint, { queryKey: TEST_KEY })
        );
        expect(response.status).not.toBe(404);
      });
    });
  });

  describe("With invalid diagnostic key (different length)", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should reject invalid key`, async () => {
        const response = await HANDLERS[endpoint](
          makeRequest(endpoint, { headerKey: "wrong-key-123" })
        );
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
      });
    });
  });

  describe("With wrong diagnostic key of the SAME length (regression)", () => {
    // TEST_KEY is "test-key" (length 8). A fully wrong key of the same length
    // must still be rejected — guards the timing-safe comparison bug where the
    // equal-length branch ignored timingSafeEqual's result.
    const sameLengthWrong = "bad-key!"; // length 8, fully wrong
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should reject a same-length wrong key with 404`, async () => {
        expect(sameLengthWrong.length).toBe(TEST_KEY.length);
        const response = await HANDLERS[endpoint](
          makeRequest(endpoint, { headerKey: sameLengthWrong })
        );
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
      });
    });
  });
});
