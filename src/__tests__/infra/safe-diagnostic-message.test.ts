import { describe, it, expect } from "vitest";
import { safeDiagnosticMessage, sanitizedErrorForLog } from "@/infra/telemetry-sanitizer";

describe("safeDiagnosticMessage", () => {
  it("returns an ordinary Error message unchanged", () => {
    expect(safeDiagnosticMessage(new Error("Engagement not found"))).toBe("Engagement not found");
  });

  it("accepts strings and non-Error values", () => {
    expect(safeDiagnosticMessage("plain")).toBe("plain");
    expect(safeDiagnosticMessage(42)).toBe("42");
    expect(safeDiagnosticMessage(undefined)).toBe("undefined");
  });

  it("redacts a connection string embedded in the message", () => {
    const out = safeDiagnosticMessage(new Error("connect failed postgresql://user:hunter2@db.example.com:5432/app"));
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("db.example.com");
    expect(out).toContain("postgresql://***");
  });

  it("redacts a bearer token embedded in the message", () => {
    const out = safeDiagnosticMessage(new Error("upstream said Bearer abcdefghijklmnopqrstuvwxyz0123456789"));
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("caps very long messages", () => {
    const out = safeDiagnosticMessage(new Error("x".repeat(5000)));
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.endsWith("…")).toBe(true);
  });

  it.each([
    ["token assignment", "failed with token=abc123def456", "abc123def456"],
    ["client secret", "client_secret: s3cr3tvalue", "s3cr3tvalue"],
    ["stripe live key", "bad key sk_live_51Habcdefghijklmnop", "sk_live_51Habcdefghijklmnop"],
    ["basic auth header", "Authorization: Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA=="],
    ["scheme-less credentials", "connect u:hunter2@db.internal:5432 refused", "hunter2"],
    ["prisma unique key value", "Unique constraint failed. Key (email)=(alice@corp.com) already exists", "alice@corp.com"],
  ])("redacts %s", (_label, input, secret) => {
    expect(safeDiagnosticMessage(new Error(input))).not.toContain(secret);
  });

  it("never throws for a value whose String() throws", () => {
    const hostile = { toString() { throw new Error("nope"); } };
    expect(safeDiagnosticMessage(hostile)).toBe("[unprintable error]");
  });

  it("sanitizedErrorForLog keeps the error name and scrubs message and stack", () => {
    const original = new TypeError("db at postgresql://u:pw@h.example/db failed");
    const safe = sanitizedErrorForLog(original);
    expect(safe.name).toBe("TypeError");
    expect(safe.message).not.toContain("pw@");
    expect(safe.stack ?? "").not.toContain("u:pw@h.example");
  });
});
