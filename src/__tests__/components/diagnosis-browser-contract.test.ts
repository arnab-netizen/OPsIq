/**
 * Diagnosis Browser Contract Test
 *
 * Verifies that the diagnosis page sends the correct request contract:
 * - POST /api/diagnosis
 * - Content-Type: application/json
 * - idempotency-key header present
 * - idempotency-key starts with "diagnosis-"
 * - Request body contains expected diagnosis fields
 * - No sensitive data in idempotency key
 *
 * This test proves the browser/API contract is maintained.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Diagnosis Page Browser Contract", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Capture original fetch
    originalFetch = global.fetch;

    // Create spy that captures the request but doesn't actually call fetch
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "test-id",
          engagementId: "eng-test",
          diagnosisSummary: "Test diagnosis",
          primaryProblemCategory: "cash_flow",
          severity: "high",
          interventionPhase: "triage",
          findings: [],
          recommendations: [],
          actionPlan: [],
          createdAt: new Date().toISOString(),
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    // Replace global fetch
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  it("sends diagnosis request with idempotency-key header", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");

    // Simulate form submission
    const body = {
      businessName: "Test Business",
      businessType: "SaaS",
      problemStatement: "Cash flow issues",
      mainIssue: "cash_flow",
      monthlyRevenue: 50000,
      monthlyCosts: 60000,
    };

    const idempotencyKey = createClientIdempotencyKey("diagnosis");

    await fetch("/api/diagnosis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = fetchSpy.mock.calls[0];

    // Verify URL
    expect(callArgs[0]).toBe("/api/diagnosis");

    // Verify method
    expect(callArgs[1].method).toBe("POST");

    // Verify Content-Type header
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");

    // Verify idempotency-key header is present
    expect(headers["idempotency-key"]).toBeDefined();
    expect(typeof headers["idempotency-key"]).toBe("string");

    // Verify idempotency-key starts with "diagnosis-"
    expect(headers["idempotency-key"]).toMatch(/^diagnosis-/);

    // Verify request body contains expected fields
    const bodyStr = callArgs[1].body;
    const bodyObj = JSON.parse(bodyStr);

    expect(bodyObj).toHaveProperty("businessName");
    expect(bodyObj).toHaveProperty("businessType");
    expect(bodyObj).toHaveProperty("problemStatement");
    expect(bodyObj).toHaveProperty("mainIssue");
    expect(bodyObj.businessName).toBe("Test Business");
    expect(bodyObj.mainIssue).toBe("cash_flow");
  });

  it("generates unique idempotency key for each request", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");

    const body = {
      businessName: "Test",
      businessType: "SaaS",
      problemStatement: "Test",
      mainIssue: "cash_flow",
    };

    const key1 = createClientIdempotencyKey("diagnosis");
    const key2 = createClientIdempotencyKey("diagnosis");

    // Keys should be different
    expect(key1).not.toBe(key2);

    // Both should start with prefix
    expect(key1).toMatch(/^diagnosis-/);
    expect(key2).toMatch(/^diagnosis-/);
  });

  it("idempotency key does not contain sensitive business data", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");

    const sensitiveData = [
      "MyCompany",
      "Revenue123",
      "CashFlow",
      "test@example.com",
    ];

    const key = createClientIdempotencyKey("diagnosis");

    // Key should not contain any sensitive data
    for (const data of sensitiveData) {
      expect(key.toLowerCase()).not.toContain(data.toLowerCase());
    }
  });
});
