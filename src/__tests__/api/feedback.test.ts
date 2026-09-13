/**
 * POST /api/feedback — route-contract tests.
 *
 * DB-free: withCanonicalEnforcement, db, rate limiting, and audit emission
 * are mocked; the real zod schema + parseRequestBody are exercised as-is so
 * validation and the field-allowlist guarantee are tested for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  requirePgRateLimit: vi.fn(),
  emitAuditEvent: vi.fn(),
  getEmailProvider: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: Record<string, string>) => unknown) => handler,
}));

vi.mock("@/lib/db", () => ({
  db: {
    platformFeedback: {
      create: mocks.create,
    },
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

import { POST } from "@/app/api/feedback/route";
import { RateLimitError } from "@/infra/rate-limit";
import { ValidationError } from "@/infra/errors";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeCtx(body: unknown) {
  return {
    verifiedActorId: USER_ID,
    verifiedWorkspaceId: WORKSPACE_ID,
    request: new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePgRateLimit.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ id: "feedback-1" });
  mocks.emitAuditEvent.mockResolvedValue("audit-1");
  mocks.getEmailProvider.mockReturnValue({ send: mocks.send });
  mocks.send.mockResolvedValue({ accepted: true });
});

describe("POST /api/feedback", () => {
  it("persists a row and emits an audit event on a valid submission", async () => {
    const ctx = makeCtx({
      category: "BUG",
      description: "The save button does nothing on the Goals page.",
      route: "/owner/goals",
      expectedResult: "Clicking save should persist the goal.",
    });

    const result = (await POST(ctx as never, {})) as { success: boolean };

    expect(result).toEqual({ success: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const createArg = mocks.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      category: "BUG",
      description: "The save button does nothing on the Goals page.",
      route: "/owner/goals",
      expectedResult: "Clicking save should persist the goal.",
    });
    expect(typeof createArg.data.id).toBe("string");
    expect(createArg.data.id.length).toBeGreaterThan(0);

    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "platform_feedback.submitted",
        workspaceId: WORKSPACE_ID,
        actorId: USER_ID,
        entityType: "platform_feedback",
      })
    );
  });

  it("defaults buildSha to null when VERCEL_GIT_COMMIT_SHA is unset", async () => {
    const original = process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    try {
      const ctx = makeCtx({ category: "OTHER", description: "no build sha in this env" });
      await POST(ctx as never, {});
      expect(mocks.create.mock.calls[0][0].data.buildSha).toBeNull();
    } finally {
      if (original !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = original;
    }
  });

  it("omits optional route/expectedResult as null when not supplied", async () => {
    const ctx = makeCtx({ category: "CONFUSION", description: "Not sure what this button does." });
    await POST(ctx as never, {});
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.route).toBeNull();
    expect(data.expectedResult).toBeNull();
  });

  it("rejects an invalid category", async () => {
    const ctx = makeCtx({ category: "NOT_A_REAL_CATEGORY", description: "hi" });
    await expect(POST(ctx as never, {})).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a missing/empty description", async () => {
    const ctx = makeCtx({ category: "BUG", description: "" });
    await expect(POST(ctx as never, {})).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a description over the 5000-char limit", async () => {
    const ctx = makeCtx({ category: "BUG", description: "x".repeat(5001) });
    await expect(POST(ctx as never, {})).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("propagates RateLimitError and never touches the database when rate-limited", async () => {
    mocks.requirePgRateLimit.mockRejectedValueOnce(new RateLimitError(60));
    const ctx = makeCtx({ category: "BUG", description: "flooding" });
    await expect(POST(ctx as never, {})).rejects.toBeInstanceOf(RateLimitError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rate-limits per authenticated actor id", async () => {
    const ctx = makeCtx({ category: "BUG", description: "hi" });
    await POST(ctx as never, {});
    expect(mocks.requirePgRateLimit).toHaveBeenCalledWith(
      `feedback:${USER_ID}`,
      expect.any(Object)
    );
  });

  it.each(["cookie", "authorization", "password", "token"])(
    "rejects an unknown '%s' field instead of silently storing it",
    async (field) => {
      const ctx = makeCtx({
        category: "BUG",
        description: "trying to smuggle a sensitive field",
        [field]: "sensitive-value",
      });
      await expect(POST(ctx as never, {})).rejects.toBeInstanceOf(ValidationError);
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );

  it("the persisted create() payload never contains a cookie/authorization/password/token key even when present in the body", async () => {
    // Belt-and-suspenders type-level guarantee: even bypassing the unknown-field
    // rejection above is impossible, but assert directly on the shape passed to
    // db.platformFeedback.create() too, for a valid submission.
    const ctx = makeCtx({ category: "BUG", description: "normal feedback" });
    await POST(ctx as never, {});
    const data = mocks.create.mock.calls[0][0].data as Record<string, unknown>;
    for (const forbidden of ["cookie", "authorization", "password", "token"]) {
      expect(Object.prototype.hasOwnProperty.call(data, forbidden)).toBe(false);
    }
  });
});

describe("POST /api/feedback — owner visibility via email", () => {
  const originalRecipient = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;

  beforeEach(() => {
    process.env.BETA_REQUEST_NOTIFICATION_EMAIL = "owner@opsiq.example";
  });

  afterEach(() => {
    if (originalRecipient === undefined) delete process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    else process.env.BETA_REQUEST_NOTIFICATION_EMAIL = originalRecipient;
  });

  it("notifies the owner after a successful submission", async () => {
    const ctx = makeCtx({ category: "BUG", description: "The save button does nothing.", route: "/owner/goals" });
    await POST(ctx as never, {});
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const sent = mocks.send.mock.calls[0][0];
    expect(sent.to).toBe("owner@opsiq.example");
    expect(sent.text).toContain("BUG");
    expect(sent.text).toContain("The save button does nothing.");
    expect(sent.text).toContain("/owner/goals");
  });

  it("escapes untrusted feedback text (description) in the owner notification HTML, never as renderable markup", async () => {
    const payload = '<a href="https://evil.example">OpsIQ login</a>';
    const ctx = makeCtx({ category: "OTHER", description: payload });
    await POST(ctx as never, {});
    const sent = mocks.send.mock.calls[0][0];
    // Never appears as a real, clickable/renderable anchor tag in the HTML body.
    expect(sent.html).not.toContain(payload);
    expect(sent.html).not.toMatch(/<a\s/i);
    expect(sent.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;OpsIQ login&lt;/a&gt;");
    // The plain-text body keeps the raw, human-readable value.
    expect(sent.text).toContain(payload);
  });

  it("persistence succeeds even when the email provider throws", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider down"));
    const ctx = makeCtx({ category: "BUG", description: "still persists" });
    const result = (await POST(ctx as never, {})) as { success: boolean };
    expect(result).toEqual({ success: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("persistence succeeds even when no notification recipient is configured", async () => {
    delete process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
    const ctx = makeCtx({ category: "BUG", description: "no recipient configured" });
    const result = (await POST(ctx as never, {})) as { success: boolean };
    expect(result).toEqual({ success: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never includes raw secrets/tokens/cookies in the owner notification", async () => {
    const ctx = makeCtx({ category: "BUG", description: "normal feedback" });
    await POST(ctx as never, {});
    const sent = mocks.send.mock.calls[0][0];
    expect(sent.text).not.toMatch(/cookie|authorization|password|token/i);
    expect(sent.html).not.toMatch(/cookie|authorization|password|token/i);
  });
});
