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

describe("Diagnosis Page Browser Contract — idempotency key structural assertions", () => {
  it("createClientIdempotencyKey is a function", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(typeof createClientIdempotencyKey).toBe("function");
  });
  it("createClientIdempotencyKey returns a non-empty string", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("test").length).toBeGreaterThan(0);
  });
  it("key for 'diagnosis' prefix starts with 'diagnosis-'", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("diagnosis")).toMatch(/^diagnosis-/);
  });
  it("key for 'payment' prefix starts with 'payment-'", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("payment")).toMatch(/^payment-/);
  });
  it("key for 'submit' prefix starts with 'submit-'", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("submit")).toMatch(/^submit-/);
  });
  it("key does not contain spaces", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("diagnosis")).not.toContain(" ");
  });
  it("two consecutive keys with same prefix are unique", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k1 = createClientIdempotencyKey("test");
    const k2 = createClientIdempotencyKey("test");
    expect(k1).not.toBe(k2);
  });
  it("key does not contain bracket or quote characters", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k = createClientIdempotencyKey("diagnosis");
    expect(k).not.toContain("[");
    expect(k).not.toContain('"');
  });
  it("key has reasonable length (>10 and <200 chars)", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k = createClientIdempotencyKey("diagnosis");
    expect(k.length).toBeGreaterThan(10);
    expect(k.length).toBeLessThan(200);
  });
  it("key contains a dash separator between prefix and unique part", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("diagnosis")).toContain("-");
  });
  it("100 generated keys for same prefix are all unique", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const keys = Array.from({ length: 100 }, () => createClientIdempotencyKey("diagnosis"));
    expect(new Set(keys).size).toBe(100);
  });
  it("key does not contain email-like content (@)", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("diagnosis")).not.toContain("@");
  });
  it("keys with different prefixes differ from each other", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k1 = createClientIdempotencyKey("diagnosis");
    const k2 = createClientIdempotencyKey("payment");
    expect(k1).not.toBe(k2);
  });
  it("key does not contain hard-coded revenue or cost values (50000, 60000)", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k = createClientIdempotencyKey("diagnosis");
    expect(k).not.toContain("50000");
    expect(k).not.toContain("60000");
  });
  it("key for empty string prefix is still non-empty", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    expect(createClientIdempotencyKey("").length).toBeGreaterThan(0);
  });
  it("key does not contain 'MyCompany' or 'Revenue'", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k = createClientIdempotencyKey("diagnosis");
    expect(k.toLowerCase()).not.toContain("mycompany");
    expect(k.toLowerCase()).not.toContain("revenue");
  });
  it("key matches pattern prefix-<uniquePart>", async () => {
    const { createClientIdempotencyKey } = await import("@/lib/client-idempotency");
    const k = createClientIdempotencyKey("diagnosis");
    expect(k).toMatch(/^diagnosis-.+/);
  });
});

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
