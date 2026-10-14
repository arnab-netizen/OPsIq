/**
 * markBetaRequestInvited — approval email on the actual REQUESTED -> INVITED
 * transition (admin-operability.service.ts).
 *
 * DB-free: db, audit emission, the email provider, and app config are all
 * mocked. db.$transaction is mocked to simply invoke its callback with a tx
 * object whose betaRequest.updateMany is the same `mocks.updateMany` spy, so
 * existing per-test updateMany expectations are unaffected by the atomicity
 * fix (the mutation now runs inside db.$transaction — see
 * beta-request-invite-atomicity.db.test.ts for the real, DB-backed proof of
 * the transactional rollback/retry/replay behavior this wrapping provides).
 * These tests are scoped to the email-on-transition behavior only: fires
 * once on a real transition, never on a replay, never blocks the invite on
 * a delivery failure, and never hardcodes a host.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  emitAuditEvent: vi.fn(),
  getEmailProvider: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    betaRequest: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ betaRequest: { updateMany: mocks.updateMany } })
    ),
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: mocks.emitAuditEvent,
}));

vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: mocks.getEmailProvider,
}));

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ NEXT_PUBLIC_APP_URL: "https://app.opsiq.example" }),
}));

import { markBetaRequestInvited } from "@/services/admin/admin-operability.service";

const ACTOR_ID = "actor-1";
const REQUEST_ID = "beta-request-1";

function finalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REQUEST_ID,
    status: "INVITED",
    invitedAt: new Date("2026-01-01T00:00:00.000Z"),
    invitedBy: ACTOR_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emitAuditEvent.mockResolvedValue("audit-1");
  mocks.getEmailProvider.mockReturnValue({ send: mocks.send });
  mocks.send.mockResolvedValue({ accepted: true });
});

describe("markBetaRequestInvited — approval email", () => {
  it("sends the approval email once on the actual REQUESTED -> INVITED transition", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" }) // existing lookup
      .mockResolvedValueOnce(finalRow()); // final row re-fetch
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].to).toBe("invitee@example.com");
  });

  it("resolves the signup link from the canonical NEXT_PUBLIC_APP_URL config, never a hardcoded host", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    const sent = mocks.send.mock.calls[0][0];
    expect(sent.html).toContain("https://app.opsiq.example/signup");
    expect(sent.text).toContain("https://app.opsiq.example/signup");
    expect(sent.html).not.toMatch(/vercel\.app/);
  });

  it("does not send an email on an idempotent replay of an already-INVITED request", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    // No REQUESTED row matched -> no transition.
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.emitAuditEvent).not.toHaveBeenCalled();
  });

  it("still returns the invite result when no email provider is configured", async () => {
    mocks.getEmailProvider.mockReturnValue(null);
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(result.status).toBe("INVITED");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("still returns the invite result when the email provider throws", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider down"));
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(result.status).toBe("INVITED");
    expect(result.id).toBe(REQUEST_ID);
  });

  it("provider failure: invite stays successful, outcome FAILED with a safe reason, sanitized structured log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Resend API error 403: domain invitee@example.com is not verified"), { status: 403 });
    mocks.send.mockRejectedValueOnce(err);
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(result.status).toBe("INVITED");
    expect(result.emailDelivery).toBe("FAILED");
    expect(result.emailDeliveryReason).toMatch(/HTTP 403/);
    expect(result.emailDeliveryReason).not.toContain("invitee@example.com");
    const names = mocks.emitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(names).toContain("beta_request.invite_email_attempted");
    expect(names).toContain("beta_request.invite_email_failed");
    expect(names).not.toContain("beta_request.invite_email_accepted_by_provider");
    const line = JSON.parse(String(errorSpy.mock.calls.find((c) => String(c[0]).includes("BETA_INVITE_EMAIL_PROVIDER_RESULT"))![0]));
    expect(line).toMatchObject({ outcome: "FAILED", action: "INVITE", provider: "resend", providerHttpStatus: 403, providerMessageIdPresent: false });
    expect(JSON.stringify(line).toLowerCase()).not.toContain("invitee@example.com");
    errorSpy.mockRestore();
  });

  it("success: provider acceptance is recorded as accepted-by-provider (never delivered) and the message id is kept internally", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.send.mockResolvedValueOnce({ accepted: true, id: "msg_123", httpStatus: 200 });
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(result.emailDelivery).toBe("SENT");
    const accepted = mocks.emitAuditEvent.mock.calls.map((c) => c[0]).find((e) => e.eventName === "beta_request.invite_email_accepted_by_provider");
    expect(accepted.payload.providerMessageId).toBe("msg_123");
    expect(JSON.stringify(mocks.emitAuditEvent.mock.calls)).not.toMatch(/delivered/i);
    const line = JSON.parse(String(infoSpy.mock.calls.find((c) => String(c[0]).includes("BETA_INVITE_EMAIL_PROVIDER_RESULT"))![0]));
    expect(line).toMatchObject({ outcome: "SENT", providerMessageIdPresent: true, providerHttpStatus: 200 });
    expect(JSON.stringify(line)).not.toContain("msg_123");
    infoSpy.mockRestore();
  });

  it("NO_PROVIDER is explicit and audited; a replay is NOT_ATTEMPTED with a reason and emits no email audit events", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmailProvider.mockReturnValue(null);
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const none = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });
    expect(none.emailDelivery).toBe("NO_PROVIDER");
    expect(mocks.emitAuditEvent.mock.calls.map((c) => c[0].eventName)).toContain("beta_request.invite_email_no_provider");

    mocks.emitAuditEvent.mockClear();
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    const replay = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });
    expect(replay.emailDelivery).toBe("NOT_ATTEMPTED");
    expect(replay.emailDeliveryReason).toMatch(/already active/i);
    expect(mocks.emitAuditEvent).not.toHaveBeenCalled();
  });

  it("sanitizes the logged provider detail: recipient removed case-insensitively, control characters removed, capped at 300", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = `Resend API error 403: INVITEE@EXAMPLE.COM and invitee@example.com\nforged line\r\u0000\u001b[31m ${"x".repeat(400)}`;
    mocks.send.mockRejectedValueOnce(Object.assign(new Error(raw), { status: 403 }));
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "Invitee@Example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    const line = JSON.parse(String(errorSpy.mock.calls.find((c) => String(c[0]).includes("BETA_INVITE_EMAIL_PROVIDER_RESULT"))![0]));
    const detail = String(line.detail);
    expect(detail.toLowerCase()).not.toContain("invitee@example.com");
    expect(detail).toContain("[recipient]");
    expect(detail).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(detail.length).toBeLessThanOrEqual(300);
    errorSpy.mockRestore();
  });

  it("a provider 2xx stays SENT even if the follow-up audit write fails (no false FAILED, no duplicate-inviting message)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockResolvedValueOnce({ accepted: true, id: "msg_9", httpStatus: 200 });
    mocks.emitAuditEvent.mockImplementation(async (event: { eventName: string }) => {
      if (event.eventName === "beta_request.invite_email_accepted_by_provider") throw new Error("audit db down");
      return "audit-1";
    });
    mocks.findUnique
      .mockResolvedValueOnce({ id: REQUEST_ID, email: "invitee@example.com" })
      .mockResolvedValueOnce(finalRow());
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await markBetaRequestInvited({ betaRequestId: REQUEST_ID, actorId: ACTOR_ID });

    expect(result.emailDelivery).toBe("SENT");
    expect(mocks.emitAuditEvent.mock.calls.map((c) => c[0].eventName)).not.toContain("beta_request.invite_email_failed");
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("BETA_INVITE_EMAIL_AUDIT_WRITE_FAILED"))).toBe(true);
    errorSpy.mockRestore();
  });
});
