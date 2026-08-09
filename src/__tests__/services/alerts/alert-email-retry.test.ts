/**
 * Alert email retry service — unit tests (Section 4 idempotency proof).
 *
 * Coverage:
 *  1  FAILED alert below max attempts → provider.send called, idempotency key passed
 *  2  SENT alert → ALREADY_TERMINAL returned, no send
 *  3  SKIPPED alert → ALREADY_TERMINAL returned, no send
 *  4  FAILED at max attempts → ConflictError thrown, no send
 *  5  CLAIMED with live lease → ALREADY_TERMINAL returned, no send
 *  6  CLAIMED with expired lease → reclaimed, provider.send called (crash recovery)
 *  7  provider.send success → SENT state, resendMessageId persisted, emailSentAt set
 *  8  provider.send failure (retryable) → FAILED state, emailSentAt=null
 *  9  user not found in workspace → SKIPPED, no send
 * 10  idempotency key includes incremented attempt count (not pre-increment)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    $executeRaw: vi.fn(),
    alert: { findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
  },

  getDbInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/workspace-validation", () => ({ enforceWorkspaceId: vi.fn() }));
vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn().mockImplementation((err: unknown) => ({
    operatorMessage: err instanceof Error ? err.message : String(err),
  })),
}));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    ALERT_EMAIL_RETRY: "alert.email_retry",
    ALERT_EMAIL_DELIVERED: "alert.email_delivered",
    ALERT_EMAIL_FAILED: "alert.email_failed",
    ALERT_EMAIL_PERMANENTLY_FAILED: "alert.email_permanently_failed",
  },
}));

let _fakeProvider: { send: ReturnType<typeof vi.fn> } | null = null;
vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(() => _fakeProvider),
}));

import { db } from "@/lib/db";
import { retryEmailAlert } from "@/services/alerts/alert-email-retry.service";

const mockDb = db as {
  $executeRaw: ReturnType<typeof vi.fn>;
  alert: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const WS = "ws-retry-test";
const ALERT_ID = randomUUID();
const ACTOR = "actor-retry-test";

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    workspaceId: WS,
    userId: "user-retry-test",
    type: "threshold_breach",
    channel: "email",
    message: "Alert: threshold exceeded",
    severity: "high",
    emailDeliveryStatus: "FAILED",
    emailAttemptCount: 1,
    emailClaimedAt: null,
    emailClaimExpiresAt: null,
    emailSentAt: null,
    emailError: "previous error",
    resendMessageId: null,
    ...overrides,
  };
}

function makeFakeProvider(msgId = "resend-retry-001") {
  return { send: vi.fn().mockResolvedValue({ id: msgId, accepted: true }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _fakeProvider = null;
  mockDb.alert.findFirst.mockResolvedValue(makeAlert());
  mockDb.alert.update.mockResolvedValue({ emailAttemptCount: 2 });
  mockDb.user.findFirst.mockResolvedValue({ email: "owner@example.com" });
  mockDb.$executeRaw.mockResolvedValue(1);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("retryEmailAlert — unit tests", () => {
  it("1: FAILED alert below max attempts → provider.send called, status SENT returned", async () => {
    _fakeProvider = makeFakeProvider();

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(_fakeProvider.send).toHaveBeenCalledOnce();
    expect(result.status).toBe("SENT");
    expect(result.alertId).toBe(ALERT_ID);
  });

  it("2: SENT alert → ALREADY_TERMINAL, no send", async () => {
    mockDb.alert.findFirst.mockResolvedValue(makeAlert({ emailDeliveryStatus: "SENT", emailAttemptCount: 1 }));
    _fakeProvider = makeFakeProvider();

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(result.status).toBe("ALREADY_TERMINAL");
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("3: SKIPPED alert → ALREADY_TERMINAL, no send", async () => {
    mockDb.alert.findFirst.mockResolvedValue(makeAlert({ emailDeliveryStatus: "SKIPPED", emailAttemptCount: 1 }));
    _fakeProvider = makeFakeProvider();

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(result.status).toBe("ALREADY_TERMINAL");
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("4: FAILED at max attempts (3) → ConflictError thrown, no send", async () => {
    mockDb.alert.findFirst.mockResolvedValue(makeAlert({ emailDeliveryStatus: "FAILED", emailAttemptCount: 3 }));
    _fakeProvider = makeFakeProvider();

    await expect(retryEmailAlert(ALERT_ID, WS, ACTOR)).rejects.toThrow(/maximum delivery attempts/i);
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("5: CLAIMED with live lease → ALREADY_TERMINAL, no reclaim, no send", async () => {
    const futureExpiry = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
    mockDb.alert.findFirst.mockResolvedValue(makeAlert({
      emailDeliveryStatus: "CLAIMED",
      emailAttemptCount: 1,
      emailClaimExpiresAt: futureExpiry,
    }));
    _fakeProvider = makeFakeProvider();

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(result.status).toBe("ALREADY_TERMINAL");
    expect(result.message).toMatch(/lease not expired/i);
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("6: CLAIMED with expired lease → reclaims atomically, provider.send called (crash recovery)", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000); // 1 minute ago
    mockDb.alert.findFirst.mockResolvedValue(makeAlert({
      emailDeliveryStatus: "CLAIMED",
      emailAttemptCount: 1,
      emailClaimExpiresAt: pastExpiry,
    }));
    _fakeProvider = makeFakeProvider("resend-crash-recovery-001");

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();
    expect(_fakeProvider.send).toHaveBeenCalledOnce();
    expect(result.status).toBe("SENT");
  });

  it("7: provider.send success → db.alert.update sets SENT, resendMessageId, emailSentAt set", async () => {
    _fakeProvider = makeFakeProvider("resend-success-007");

    await retryEmailAlert(ALERT_ID, WS, ACTOR);

    const updateCall = mockDb.alert.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data?: { emailDeliveryStatus?: string } })?.data?.emailDeliveryStatus === "SENT"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.emailSentAt).toBeInstanceOf(Date);
    expect(data.resendMessageId).toBe("resend-success-007");
    expect(data.emailError).toBeNull();
  });

  it("8: provider.send failure (retryable 503) → FAILED state, emailSentAt=null in update", async () => {
    _fakeProvider = { send: vi.fn().mockRejectedValue(new Error("Resend API error 503: service unavailable")) };

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(result.status).toBe("FAILED");
    const updateCall = mockDb.alert.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { data?: { emailDeliveryStatus?: string } })?.data?.emailDeliveryStatus === "FAILED"
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![0] as { data: Record<string, unknown> }).data.emailSentAt).toBeNull();
  });

  it("9: user not found in workspace → SKIPPED, db.alert.update sets SKIPPED, no send", async () => {
    mockDb.user.findFirst.mockResolvedValue(null);
    _fakeProvider = makeFakeProvider();

    const result = await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(result.status).toBe("SKIPPED");
    expect(_fakeProvider.send).not.toHaveBeenCalled();
    const updateCall = mockDb.alert.update.mock.calls[0]?.[0] as { data?: { emailDeliveryStatus?: string } } | undefined;
    expect(updateCall?.data?.emailDeliveryStatus).toBe("SKIPPED");
  });

  it("10: idempotency key passed to provider uses incremented attempt count (emailAttemptCount+1)", async () => {
    const alertWithCount2 = makeAlert({ emailDeliveryStatus: "FAILED", emailAttemptCount: 2 });
    mockDb.alert.findFirst.mockResolvedValue(alertWithCount2);
    _fakeProvider = makeFakeProvider();

    await retryEmailAlert(ALERT_ID, WS, ACTOR);

    expect(_fakeProvider.send).toHaveBeenCalledOnce();
    const sendArg = _fakeProvider.send.mock.calls[0][0];
    // emailAttemptCount was 2, claim increments to 3, so key suffix = 3
    expect(sendArg.idempotencyKey).toBe(`alert:${WS}:${ALERT_ID}:3`);
  });
});
