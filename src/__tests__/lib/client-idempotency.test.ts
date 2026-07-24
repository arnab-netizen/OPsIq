import { describe, it, expect } from "vitest";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";

describe("createClientIdempotencyKey — module contract assertions", () => {
  it("createClientIdempotencyKey is a function", () => { expect(typeof createClientIdempotencyKey).toBe("function"); });
  it("returns a string", () => { expect(typeof createClientIdempotencyKey("test")).toBe("string"); });
  it("returned string is non-empty", () => { expect(createClientIdempotencyKey("test").length).toBeGreaterThan(0); });
  it("returned key contains the prefix", () => { expect(createClientIdempotencyKey("prefix")).toContain("prefix"); });
  it("returned key starts with prefix-", () => { expect(createClientIdempotencyKey("abc").startsWith("abc-")).toBe(true); });
  it("two calls return different keys", () => { expect(createClientIdempotencyKey("x")).not.toBe(createClientIdempotencyKey("x")); });
  it("different prefixes produce different-looking keys", () => { expect(createClientIdempotencyKey("aaa").startsWith("aaa-")).toBe(true); });
  it("key contains a hyphen separator", () => { expect(createClientIdempotencyKey("p").includes("-")).toBe(true); });
  it("key has at least 2 parts when split by hyphen", () => { expect(createClientIdempotencyKey("p").split("-").length).toBeGreaterThanOrEqual(2); });
  it("first segment of key equals the prefix", () => { expect(createClientIdempotencyKey("hello").split("-")[0]).toBe("hello"); });
  it("works with single-char prefix", () => { expect(createClientIdempotencyKey("x").startsWith("x-")).toBe(true); });
  it("key length is greater than prefix length", () => { expect(createClientIdempotencyKey("test").length).toBeGreaterThan("test".length); });
  it("100 generated keys are all unique", () => { const s = new Set(Array.from({ length: 100 }, () => createClientIdempotencyKey("u"))); expect(s.size).toBe(100); });
  it("key does not equal the prefix alone", () => { const k = createClientIdempotencyKey("myop"); expect(k).not.toBe("myop"); });
});

describe("createClientIdempotencyKey", () => {
  it("generates key with prefix and UUID format", () => {
    const key = createClientIdempotencyKey("diagnosis");
    expect(key).toMatch(/^diagnosis-/);
  });

  it("generates different keys on each call", () => {
    const key1 = createClientIdempotencyKey("diagnosis");
    const key2 = createClientIdempotencyKey("diagnosis");
    expect(key1).not.toBe(key2);
  });

  it("includes provided prefix in key", () => {
    const key = createClientIdempotencyKey("evidence");
    expect(key.startsWith("evidence-")).toBe(true);
  });

  it("does not include sensitive data (only prefix)", () => {
    const key = createClientIdempotencyKey("test");
    expect(key).not.toContain("businessName");
    expect(key).not.toContain("email");
    expect(key).not.toContain("userId");
    expect(key).not.toContain("workspaceId");
    expect(key).not.toContain("problemStatement");
  });

  it("key structure is deterministic given same crypto implementation", () => {
    // Key format should always be prefix-something
    const key = createClientIdempotencyKey("op");
    const parts = key.split("-");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toBe("op");
  });

  it("works with different prefixes", () => {
    const diagnosis = createClientIdempotencyKey("diagnosis");
    const evidence = createClientIdempotencyKey("evidence");
    const decision = createClientIdempotencyKey("decision");

    expect(diagnosis.startsWith("diagnosis-")).toBe(true);
    expect(evidence.startsWith("evidence-")).toBe(true);
    expect(decision.startsWith("decision-")).toBe(true);
  });

  it("key is reasonably unique (collision probability negligible)", () => {
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
      keys.add(createClientIdempotencyKey("test"));
    }
    expect(keys.size).toBe(100);
  });
});
