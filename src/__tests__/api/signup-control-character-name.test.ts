/**
 * Regression: a business name containing control characters (NUL, escapes, line breaks) is invalid input and must be a
 * controlled 4xx. Root cause: signupSchema/businessCreateSchema only checked length, so U+0000 reached Postgres, which
 * rejects it, and the owner saw an unexplained 500 on the very first screen.
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/signup/route";
import { businessCreateSchema, businessUpdateSchema, NO_CONTROL_CHARACTERS } from "@/domain/founder-recovery/validation";

const req = (workspaceName: string, ip: string) =>
  new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email: "ctrl-char@example.com", workspaceName }),
  });

describe("control characters in business names", () => {
  it.each(["A\u0000B", "line\nbreak", "tab\there", "esc\u001b[31m", "del\u007f"])("signup refuses %j with a 4xx and no technical text", async (name) => {
    const res = await POST(req(name, "192.0.2.91") as never);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await res.text()).not.toMatch(/prisma|postgres|invalid byte|stack|0x00/i);
  });

  it("business create/update schemas apply the same rule; ordinary and unicode names pass", () => {
    const base = { businessType: "generic_local_service", currency: "INR" };
    expect(businessCreateSchema.safeParse({ ...base, name: "Harbour Laundry" }).success).toBe(true);
    expect(businessCreateSchema.safeParse({ ...base, name: "Café Ñandú — 東京 😀" }).success).toBe(true);
    expect(businessCreateSchema.safeParse({ ...base, name: "A\u0000B" }).success).toBe(false);
    expect(businessUpdateSchema.safeParse({ name: "A\u0000B" }).success).toBe(false);
    expect(NO_CONTROL_CHARACTERS.test("fine")).toBe(true);
  });
});
