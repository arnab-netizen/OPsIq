import { describe, it, expect } from "vitest";
import { identityEmailSchema } from "@/lib/validation";

/**
 * `identityEmailSchema` is the single normalization choke point every route
 * that creates, updates, or looks up a `User` by email must use (signup,
 * login, forgot-password, and the admin user-management routes). It exists
 * because `User.email` carries only a plain, case-sensitive `@unique`
 * constraint (no `lower(email)` functional index) — Postgres alone does not
 * prevent "Test@Example.com" and "test@example.com" from being two rows.
 * These tests pin the normalization contract directly, independent of any
 * one route.
 */
describe("identityEmailSchema", () => {
  it("lowercases a mixed-case address", () => {
    const r = identityEmailSchema.safeParse("Test@Example.com");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("test@example.com");
  });

  it("trims and lowercases a whitespace-padded address, rather than rejecting it", () => {
    const r = identityEmailSchema.safeParse(" Test@Example.com ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("test@example.com");
  });

  it("trims interior-safe leading/trailing whitespace combined with mixed case", () => {
    const r = identityEmailSchema.safeParse("\tTEST@EXAMPLE.COM\n");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("test@example.com");
  });

  it("normalizes three superficially different inputs to the identical canonical value", () => {
    const variants = ["Test@Example.com", "test@example.com", " test@example.com "];
    const canonical = variants.map((v) => {
      const r = identityEmailSchema.safeParse(v);
      expect(r.success).toBe(true);
      return r.success ? r.data : null;
    });
    expect(new Set(canonical).size).toBe(1);
    expect(canonical[0]).toBe("test@example.com");
  });

  it("still rejects a genuinely invalid address after normalization", () => {
    const r = identityEmailSchema.safeParse("not-an-email");
    expect(r.success).toBe(false);
  });

  it("still rejects an empty/whitespace-only string", () => {
    const r = identityEmailSchema.safeParse("   ");
    expect(r.success).toBe(false);
  });

  it("is unaffected by internal whitespace it cannot and must not silently strip", () => {
    // "foo bar@example.com" is not a valid email either before or after
    // trimming — trim only strips leading/trailing whitespace, so this must
    // still fail, not be silently repaired into something else.
    const r = identityEmailSchema.safeParse("foo bar@example.com");
    expect(r.success).toBe(false);
  });
});
