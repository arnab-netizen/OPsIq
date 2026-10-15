/**
 * Regression: malformed login input is the caller's mistake and must be a controlled 400 with fixed wording.
 *
 * Root cause: POST /api/auth/login parses the body first (stage "parse_body"); parseRequestBody throws a
 * ValidationError for bad JSON / missing or empty password / invalid email / unknown fields, but the route's catch
 * had no ValidationError branch, so the request fell through to the generic 500 and echoed the internal pipeline
 * "stage". Rejection happens before any DB access, so this test needs no database.
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/login/route";

function req(body: string, ip: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  });
}

describe("login route malformed input", () => {
  const cases: Array<[string, string]> = [
    ["invalid JSON", "{not json"],
    ["missing password", JSON.stringify({ email: "a@example.com" })],
    ["empty password", JSON.stringify({ email: "a@example.com", password: "" })],
    ["invalid email", JSON.stringify({ email: "not-an-email", password: "x" })],
    ["unknown field", JSON.stringify({ email: "a@example.com", password: "x", admin: true })],
  ];
  it.each(cases)("%s -> 400 with fixed wording and no internal stage", async (_label, body) => {
    const res = await POST(req(body, "192.0.2.77") as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Enter your email address and password.");
    expect(json).not.toHaveProperty("stage");
    expect(JSON.stringify(json)).not.toMatch(/zod|prisma|stack|parse_body/i);
  });
});
