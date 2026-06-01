/**
 * Security Regression Tests: /api/ops/* Endpoints
 *
 * Verifies that operational metrics endpoints require OPSIQ_DIAGNOSTIC_KEY
 * and do not expose sensitive information to unauthorized requesters.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";

describe("GET /api/ops/* endpoints - Auth requirements", () => {
  const endpoints = [
    "/api/ops/errors",
    "/api/ops/metrics",
    "/api/ops/readiness",
    "/api/ops/runtime",
  ];

  const validDiagnosticKey = process.env.OPSIQ_DIAGNOSTIC_KEY || "test-key";

  describe("Without diagnostic key", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should return 404 without key`, async () => {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
      });
    });
  });

  describe("With valid diagnostic key (header)", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should accept valid key in header`, async () => {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-opsiq-diagnostic-key": validDiagnosticKey,
          },
        });

        // Should not be 404 (Unauthorized)
        expect(response.status).not.toBe(404);
      });
    });
  });

  describe("With valid diagnostic key (query param)", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should accept valid key in query param`, async () => {
        const url = new URL(`http://localhost:3000${endpoint}`);
        url.searchParams.set("key", validDiagnosticKey);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        // Should not be 404 (Unauthorized)
        expect(response.status).not.toBe(404);
      });
    });
  });

  describe("With invalid diagnostic key", () => {
    endpoints.forEach((endpoint) => {
      it(`${endpoint} should reject invalid key`, async () => {
        const response = await fetch(`http://localhost:3000${endpoint}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-opsiq-diagnostic-key": "wrong-key-123",
          },
        });

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
      });
    });
  });
});
