/**
 * POST /api/privacy-requests — route-contract tests.
 *
 * DB-free: db, rate limiting, and audit emission are mocked; the real zod
 * schema + parseRequestBody are exercised as-is so validation and
 * enumeration-resistance are tested for real. This route is public (no
 * withCanonicalEnforcement) so it's invoked exactly as Next.js would call it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  requirePgRateLimit: vi.fn(),
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.findUnique },
    privacyRequest: { create: mocks.create },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/rate-limit")>();
  return {
    ...actual,
    requirePgRateLimit: mocks.requirePgRateLimit,
  };
});

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mocks.emitAuditEvent,
}));

import { POST } from "@/app/api/privacy-requests/route";
import { RateLimitError } from "@/infra/rate-limit";

function makeReq(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/privacy-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePgRateLimit.mockResolvedValue(undefined);
  mocks.findUnique.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "privacy-request-1" });
  mocks.emitAuditEvent.mockResolvedValue("audit-1");
});

const GENERIC_MESSAGE_FRAGMENT = "recorded";

describe("POST /api/privacy-requests", () => {
  it("persists a row and returns the generic success response when no account matches", async () => {
    const res = await POST(makeReq({ requestType: "ACCESS", email: "nobody@example.com" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain(GENERIC_MESSAGE_FRAGMENT);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      requestType: "ACCESS",
      email: "nobody@example.com",
      userId: null,
      detail: null,
    });
    expect(typeof data.id).toBe("string");
  });

  it("attaches the matching userId privately when an account exists, without changing the response", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "user-42" });

    const res = await POST(makeReq({ requestType: "DELETION", email: "real@example.com" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    // Enumeration resistance: response is byte-identical regardless of match.
    expect(body.success).toBe(true);
    expect(body.message).toContain(GENERIC_MESSAGE_FRAGMENT);

    const data = mocks.create.mock.calls[0][0].data;
    expect(data.userId).toBe("user-42");

    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "privacy_request.created",
        actorId: "user-42",
        entityType: "privacy_request",
      })
    );
  });

  it("returns the exact same generic response shape for a match and a non-match", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "user-1" });
    const matchRes = await POST(makeReq({ requestType: "CORRECTION", email: "a@example.com" }) as never);
    const matchBody = await matchRes.json();

    mocks.findUnique.mockResolvedValueOnce(null);
    const noMatchRes = await POST(makeReq({ requestType: "CORRECTION", email: "b@example.com" }) as never);
    const noMatchBody = await noMatchRes.json();

    expect(matchRes.status).toBe(noMatchRes.status);
    expect(matchBody).toEqual(noMatchBody);
  });

  it("normalizes and trims/lowercases email via identityEmailSchema", async () => {
    await POST(makeReq({ requestType: "ACCESS", email: "  Test@Example.com  " }) as never);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { email: "test@example.com" },
      select: { id: true },
    });
  });

  it("stores optional detail when supplied", async () => {
    await POST(
      makeReq({ requestType: "CORRECTION", email: "a@example.com", detail: "My business name is misspelled." }) as never
    );
    expect(mocks.create.mock.calls[0][0].data.detail).toBe("My business name is misspelled.");
  });

  it("rejects an invalid requestType with a 400 and does not create a row", async () => {
    const res = await POST(makeReq({ requestType: "NOT_A_TYPE", email: "a@example.com" }) as never);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with a 400 and does not create a row", async () => {
    const res = await POST(makeReq({ requestType: "ACCESS", email: "not-an-email" }) as never);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a missing email with a 400", async () => {
    const res = await POST(makeReq({ requestType: "ACCESS" }) as never);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["cookie", "authorization", "password", "token"])(
    "rejects an unknown '%s' field instead of silently storing it",
    async (field) => {
      const res = await POST(
        makeReq({ requestType: "ACCESS", email: "a@example.com", [field]: "sensitive-value" }) as never
      );
      expect(res.status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );

  it("returns 429 and never creates a row when the IP rate limit is hit", async () => {
    mocks.requirePgRateLimit.mockRejectedValueOnce(new RateLimitError(3600));
    const res = await POST(makeReq({ requestType: "ACCESS", email: "a@example.com" }) as never);
    expect(res.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rate-limits per IP and per email", async () => {
    await POST(makeReq({ requestType: "ACCESS", email: "a@example.com" }, "198.51.100.5") as never);
    expect(mocks.requirePgRateLimit).toHaveBeenCalledWith("privacy-request:198.51.100.5", expect.any(Object));
    expect(mocks.requirePgRateLimit).toHaveBeenCalledWith("privacy-request:a@example.com", expect.any(Object));
  });

  it("never mentions instant or automatic fulfillment in the response copy", async () => {
    const res = await POST(makeReq({ requestType: "DELETION", email: "a@example.com" }) as never);
    const body = await res.json();
    expect(body.message.toLowerCase()).not.toMatch(/instant|immediately|automatic/);
  });
});
