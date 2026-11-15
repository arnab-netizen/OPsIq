/**
 * Regression: a business name containing control characters (NUL, escapes, line breaks) is invalid input and must be a
 * controlled 4xx. Root cause: signupSchema/businessCreateSchema only checked length, so U+0000 reached Postgres, which
 * rejects it, and the owner saw an unexplained 500 on the very first screen.
 */
import { describe, it, expect } from "vitest";
import { businessCreateSchema, businessUpdateSchema, NO_CONTROL_CHARACTERS } from "@/domain/founder-recovery/validation";

describe("control characters in business names (schemas)", () => {
  it("business create/update schemas apply the same rule; ordinary and unicode names pass", () => {
    const base = { businessType: "generic_local_service", currency: "INR" };
    expect(businessCreateSchema.safeParse({ ...base, name: "Harbour Laundry" }).success).toBe(true);
    expect(businessCreateSchema.safeParse({ ...base, name: "Café Ñandú — 東京 😀" }).success).toBe(true);
    expect(businessCreateSchema.safeParse({ ...base, name: "A\u0000B" }).success).toBe(false);
    expect(businessUpdateSchema.safeParse({ name: "A\u0000B" }).success).toBe(false);
    expect(NO_CONTROL_CHARACTERS.test("fine")).toBe(true);
  });
});
