import { describe, it, expect } from "vitest";
import { safeDiagnosticMessage } from "@/infra/telemetry-sanitizer";

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
});
