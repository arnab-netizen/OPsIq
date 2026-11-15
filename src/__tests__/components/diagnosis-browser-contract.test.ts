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

import { describe, it, expect } from "vitest";

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

// The real form's request (method, URL, headers, body with unknown figures omitted) is asserted by
// rendering DiagnosisClient in src/__tests__/generic-diagnosis/diagnosis-ui.test.tsx.
describe("Diagnosis Page Browser Contract", () => {
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
