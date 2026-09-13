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
});
