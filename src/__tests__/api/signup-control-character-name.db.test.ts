/**
 * Regression: a business name containing control characters (NUL, escapes, line breaks) is invalid input and must be a
 * controlled 4xx. Root cause: signupSchema/businessCreateSchema only checked length, so U+0000 reached Postgres, which
 * rejects it, and the owner saw an unexplained 500 on the very first screen.
 *
 * Route-level half: the signup route runs its DB-backed rate limiter and settings read before validation, so this file
 * needs the database and runs in the DB Verification job. The schema half lives in signup-control-character-name.test.ts.
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

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
});
