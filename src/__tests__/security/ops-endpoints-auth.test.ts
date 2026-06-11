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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
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

  describe("With invalid diagnostic key", () => {
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
});
