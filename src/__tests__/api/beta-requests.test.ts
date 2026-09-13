/**
 * POST /api/beta-requests — route-contract tests.
 *
 * DB-free: db, rate limiting, audit emission, and the email provider are
 * mocked; the real zod schema + parseRequestBody are exercised as-is so
 * validation and duplicate-safety are tested for real. Mirrors
 * src/__tests__/api/privacy-requests.test.ts's mocking pattern exactly,
 * since this route follows the identical anonymous/enumeration-resistant
 * shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  requirePgRateLimit: vi.fn(),
  emitAuditEvent: vi.fn(),
  getEmailProvider: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    betaRequest: { create: mocks.create },
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

vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: mocks.getEmailProvider,
}));

import { POST } from "@/app/api/beta-requests/route";
import { RateLimitError } from "@/infra/rate-limit";

function makeReq(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/beta-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** Same driver-adapter-shaped P2002 error the signup route's own test suite exercises. */
function emailUniqueViolation(): Error & { code: string; meta: unknown } {
  const err = new Error("Unique constraint failed") as Error & { code: string; meta: unknown };
  err.code = "P2002";
  err.meta = { driverAdapterError: { cause: { constraint: { fields: ["email"] } } } };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePgRateLimit.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ id: "beta-request-1" });
  mocks.emitAuditEvent.mockResolvedValue("audit-1");
  mocks.getEmailProvider.mockReturnValue({ send: mocks.send });
  mocks.send.mockResolvedValue({ success: true });
});

const GENERIC_MESSAGE_FRAGMENT = "beta request has been received";

describe("POST /api/beta-requests", () => {
  it("persists a row and returns the generic success response for a new email", async () => {
    const res = await POST(makeReq({ email: "nobody@example.com" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message.toLowerCase()).toContain(GENERIC_MESSAGE_FRAGMENT);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "nobody@example.com", firstName: null });
    expect(typeof data.id).toBe("string");
  });

  it("normalizes and trims/lowercases email via identityEmailSchema", async () => {
    await POST(makeReq({ email: "  Test@Example.com  " }) as never);
    expect(mocks.create.mock.calls[0][0].data.email).toBe("test@example.com");
  });

  it("stores optional first name when supplied", async () => {
    await POST(makeReq({ email: "a@example.com", firstName: "Ada" }) as never);
    expect(mocks.create.mock.calls[0][0].data.firstName).toBe("Ada");
  });

  it("captures UTM values when present", async () => {
    await POST(
      makeReq({
        email: "a@example.com",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "beta-launch",
        utmContent: "hero-cta",
      }) as never
    );
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "beta-launch",
      utmContent: "hero-cta",
    });
  });

  it("stores null for UTM fields that are absent", async () => {
    await POST(makeReq({ email: "a@example.com" }) as never);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
    });
  });

  it("returns the exact same generic response for a duplicate submission, without creating a second row", async () => {
    mocks.create.mockRejectedValueOnce(emailUniqueViolation());

    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message.toLowerCase()).toContain(GENERIC_MESSAGE_FRAGMENT);
    // Only ever attempted once — a duplicate is never retried as an update.
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("returns an identical response shape for a first-time and a duplicate submission (no enumeration)", async () => {
    const freshRes = await POST(makeReq({ email: "fresh@example.com" }) as never);
    const freshBody = await freshRes.json();

    mocks.create.mockRejectedValueOnce(emailUniqueViolation());
    const dupRes = await POST(makeReq({ email: "dup@example.com" }) as never);
    const dupBody = await dupRes.json();

    expect(freshRes.status).toBe(dupRes.status);
    expect(freshBody).toEqual(dupBody);
  });

  it("does not send a confirmation email on a duplicate submission", async () => {
    mocks.create.mockRejectedValueOnce(emailUniqueViolation());
    await POST(makeReq({ email: "a@example.com" }) as never);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends a best-effort confirmation email on a genuine new request", async () => {
    await POST(makeReq({ email: "a@example.com" }) as never);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].to).toBe("a@example.com");
  });

  it("never fails the request when the email provider throws", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider down"));
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(200);
  });

  it("never fails the request when no email provider is configured", async () => {
    mocks.getEmailProvider.mockReturnValue(null);
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with a 400 and does not create a row", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }) as never);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a missing email with a 400", async () => {
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["password", "token", "role", "isAdmin"])(
    "rejects an unknown '%s' field instead of silently storing it",
    async (field) => {
      const res = await POST(makeReq({ email: "a@example.com", [field]: "sensitive-value" }) as never);
      expect(res.status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );

  it("returns 429 and never creates a row when the IP rate limit is hit", async () => {
    mocks.requirePgRateLimit.mockRejectedValueOnce(new RateLimitError(3600));
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rate-limits per IP and per email", async () => {
    await POST(makeReq({ email: "a@example.com" }, "198.51.100.5") as never);
    expect(mocks.requirePgRateLimit).toHaveBeenCalledWith("beta-request:198.51.100.5", expect.any(Object));
    expect(mocks.requirePgRateLimit).toHaveBeenCalledWith("beta-request:a@example.com", expect.any(Object));
  });

  it("never promises guaranteed or immediate access in the response copy", async () => {
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    const body = await res.json();
    const text = body.message.toLowerCase();
    // The response must say access is NOT guaranteed/immediate -- never the reverse.
    expect(text).toMatch(/isn.t guaranteed/);
    expect(text).not.toMatch(/guaranteed access|instant access|immediately available|access is guaranteed/);
  });
});

describe("POST /api/beta-requests — owner notification on new request", () => {
  const originalRecipient = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;

  beforeEach(() => {
    process.env.BETA_REQUEST_NOTIFICATION_EMAIL = "owner@opsiq.example";
  });

  afterEach(() => {
    if (originalRecipient === undefined) delete process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    else process.env.BETA_REQUEST_NOTIFICATION_EMAIL = originalRecipient;
  });

  it("sends a best-effort owner notification on a genuine new request", async () => {
    await POST(makeReq({ email: "a@example.com", firstName: "Ada" }) as never);
    // One call for the applicant confirmation, one for the owner notification.
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const ownerCall = mocks.send.mock.calls.find((c) => c[0].to === "owner@opsiq.example");
    expect(ownerCall).toBeDefined();
    expect(ownerCall![0].text).toContain("a@example.com");
    expect(ownerCall![0].text).toContain("Ada");
  });

  it("does not notify the owner a second time for a duplicate submission", async () => {
    mocks.create.mockRejectedValueOnce(emailUniqueViolation());
    await POST(makeReq({ email: "a@example.com" }) as never);
    const ownerCalls = mocks.send.mock.calls.filter((c) => c[0].to === "owner@opsiq.example");
    expect(ownerCalls).toHaveLength(0);
  });

  it("still succeeds when no notification recipient is configured", async () => {
    delete process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(200);
    // Only the applicant confirmation is sent.
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when the email provider is absent", async () => {
    mocks.getEmailProvider.mockReturnValue(null);
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(200);
  });

  it("still succeeds when the owner-notification send throws", async () => {
    mocks.send.mockImplementation(async (msg: { to: string }) => {
      if (msg.to === "owner@opsiq.example") throw new Error("provider down");
      return { success: true };
    });
    const res = await POST(makeReq({ email: "a@example.com" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
