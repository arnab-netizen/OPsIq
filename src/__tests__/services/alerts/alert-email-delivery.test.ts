/**
 * Alert email delivery — Stage 3G FSM corrective closure tests.
 *
 * Covers the full email delivery FSM:
 *  1  provider configured → atomic CLAIMED claim, email sent, SENT state set, emailSentAt set by db.update
 *  2  provider absent → SKIPPED state written via $executeRaw, no db.alert.update
 *  3  provider failure → FAILED state, emailSentAt=null, failure audit event emitted
 *  4  duplicate idempotency key → createAlert returns existing; no second email sent
 *  5  compliance deadline trigger → uses channel:"email" and enters real delivery path
 *  6  critical state trigger �� uses channel:"email" and enters real delivery path
 *  7  user has no email address → SKIPPED via $executeRaw, no subsequent claim
 *  8  denied request (enforceWorkspaceId throws) → no DB create, no email side-effect
 *  9  delivery already claimed ($executeRaw returns 0) → no send, no update; idempotency guard fires
 * 10  provider 500 error → alert NOT deleted, FAILED state, emailSentAt=null, audit event emitted
 * 11  user not in workspace → SKIPPED via $executeRaw, no send
 * 12  concurrent delivery simulation → exactly one CLAIMED wins; exactly one email sent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";

// ── Mocks ───────────────��──────────────────────���───────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    $executeRaw: vi.fn(),
    alert: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/workspace-validation", () => ({
  enforceWorkspaceId: vi.fn(),
}));
vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn().mockImplementation((err: unknown) => ({
    operatorMessage: err instanceof Error ? err.message : String(err),
  })),
}));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    ALERT_CREATED: "alert.created",
    ALERT_UPDATED: "alert.updated",
    ALERT_EMAIL_DELIVERED: "alert.email_delivered",
    ALERT_EMAIL_FAILED: "alert.email_failed",
    ALERT_EMAIL_RETRY: "alert.email_retry",
    ALERT_EMAIL_PERMANENTLY_FAILED: "alert.email_permanently_failed",
  },
}));

// Controlled fake email provider — injectable per-test
let _fakeProvider: { send: ReturnType<typeof vi.fn> } | null = null;
vi.mock("@/lib/integrations/email-provider", () => ({
  getEmailProvider: vi.fn(() => _fakeProvider),
  resetEmailProvider: vi.fn(),
}));

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import {
  createAlert,
  triggerComplianceDeadlineAlert,
  triggerCriticalStateAlert,
} from "@/services/alerts/alert-service";

// ── Helpers ───────────────���────────────────────────────────��───────────────

const mockDb = db as {
  $executeRaw: ReturnType<typeof vi.fn>;
  alert: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const mockAudit = emitAuditEvent as ReturnType<typeof vi.fn>;
const mockEnforce = enforceWorkspaceId as ReturnType<typeof vi.fn>;

function makeStoredAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    workspaceId: "ws-abc",
    userId: "user-xyz",
    type: "threshold_breach",
    channel: "email",
    message: "CRITICAL CASH STATE: negative runway.",
    entityType: null,
    entityId: null,
    severity: "critical",
    idempotencyKey: null,
    isRead: false,
    readAt: null,
    resolvedAt: null,
    emailSentAt: null,
    emailError: null,
    resendMessageId: null,
    emailDeliveryStatus: "PENDING",
    emailClaimedAt: null,
    emailClaimExpiresAt: null,
    emailLastAttemptAt: null,
    emailAttemptCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFakeProvider(result?: { id?: string }) {
  return { send: vi.fn().mockResolvedValue({ id: result?.id ?? "resend-msg-001", accepted: true }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  _fakeProvider = null;
  // Default: atomic delivery claim succeeds (1 row updated = CLAIMED)
  mockDb.$executeRaw.mockResolvedValue(1);
  // Default: user found with valid email and active workspace membership
  mockDb.user.findFirst.mockResolvedValue({ email: "owner@example.com" });
  // Default: no existing alert (idempotency check finds nothing → proceeds to create)
  // The failure-path attempt-count lookup uses `.catch(() => null)` and defaults to 1 when null.
  mockDb.alert.findFirst.mockResolvedValue(null);
  mockDb.alert.update.mockResolvedValue({ emailAttemptCount: 1 });
});

afterEach(() => {
  _fakeProvider = null;
});

// ���─ Tests ──────────────────────────────────────────────────────���───────────

describe("alert email delivery FSM", () => {
  it("1: provider configured → CLAIMED via $executeRaw, email sent, db.update sets SENT + emailSentAt", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider({ id: "resend-msg-001" });

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    // Atomic claim (PENDING→CLAIMED) must fire before send
    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe(stored.id);
    // emailSentAt is set ONLY here — after provider confirmation (SENT state)
    expect(updateCall.data.emailDeliveryStatus).toBe("SENT");
    expect(updateCall.data.emailSentAt).toBeInstanceOf(Date);
    expect(updateCall.data.resendMessageId).toBe("resend-msg-001");
    expect(updateCall.data.emailError).toBeNull();

    expect(_fakeProvider!.send).toHaveBeenCalledOnce();
    const sendArg = _fakeProvider!.send.mock.calls[0][0];
    expect(sendArg.to).toBe("owner@example.com");
    expect(sendArg.subject).toContain("CRITICAL");
    expect(sendArg.html).toContain(stored.message as string);
  });

  it("2: provider absent → SKIPPED state via $executeRaw, db.alert.update NOT called", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = null; // no provider

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.$executeRaw).toHaveBeenCalled());

    // SKIPPED written via $executeRaw (atomically, same pattern as claim)
    expect(mockDb.$executeRaw).toHaveBeenCalledOnce();
    // db.alert.update is NOT called — no separate update step
    expect(mockDb.alert.update).not.toHaveBeenCalled();
    // Alert row persisted
    expect(mockDb.alert.create).toHaveBeenCalledOnce();
  });

  it("3: provider failure → FAILED state, emailSentAt=null, failure audit emitted", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = { send: vi.fn().mockRejectedValue(new Error("Resend API error 429: rate limit exceeded")) };

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailDeliveryStatus).toBe("FAILED");
    // FAILED: emailSentAt must remain null (SENT ≠ FAILED invariant)
    expect(updateCall.data.emailSentAt).toBeNull();
    expect(updateCall.data.emailError).toContain("429");

    // Alert NOT deleted
    expect(mockDb.alert.create).toHaveBeenCalledOnce();

    // Failure audit event emitted (could be email_failed or email_permanently_failed)
    const failedAuditCall = mockAudit.mock.calls.find(
      (c) => ["alert.email_failed", "alert.email_permanently_failed"].includes(c[0]?.eventName)
    );
    expect(failedAuditCall).toBeDefined();
    expect(failedAuditCall![0].payload.errorClass).toBe("Error");
  });

  it("4: duplicate idempotency key → existing alert returned, no second email sent", async () => {
    const existing = makeStoredAlert({ emailDeliveryStatus: "SENT", emailSentAt: new Date(), resendMessageId: "already-sent" });
    mockDb.alert.findFirst.mockResolvedValue(existing);
    _fakeProvider = makeFakeProvider();

    const result = await createAlert({
      workspaceId: existing.workspaceId as string,
      userId: existing.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: existing.message as string,
      idempotencyKey: "compliance-deadline:item-1:days3",
    });

    expect(result.id).toBe(existing.id);
    expect(mockDb.alert.create).not.toHaveBeenCalled();
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("5: compliance deadline trigger → channel=email entered, delivery path invoked", async () => {
    const stored = makeStoredAlert({ channel: "email", severity: "critical" });
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider();

    await triggerComplianceDeadlineAlert("ws-abc", "user-xyz", "Tax filing Q3", 2, "item-42");

    expect(mockDb.alert.create).toHaveBeenCalledOnce();
    const createArg = mockDb.alert.create.mock.calls[0][0].data;
    expect(createArg.channel).toBe("email");
    expect(createArg.severity).toBe("critical");
    expect(createArg.idempotencyKey).toContain("compliance-deadline:item-42:days2");

    await vi.waitFor(() => expect(_fakeProvider!.send).toHaveBeenCalledOnce());
  });

  it("6: critical state trigger → channel=email, severity=critical, delivery path invoked", async () => {
    const stored = makeStoredAlert({ channel: "email", severity: "critical" });
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider();

    await triggerCriticalStateAlert("ws-abc", "user-xyz", "cash", "Negative runway detected");

    expect(mockDb.alert.create).toHaveBeenCalledOnce();
    const createArg = mockDb.alert.create.mock.calls[0][0].data;
    expect(createArg.channel).toBe("email");
    expect(createArg.severity).toBe("critical");
    expect(createArg.message).toContain("CRITICAL CASH STATE");

    await vi.waitFor(() => expect(_fakeProvider!.send).toHaveBeenCalledOnce());
  });

  it("7: user has no email address → SKIPPED via $executeRaw, no subsequent claim", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    mockDb.user.findFirst.mockResolvedValue({ email: null });
    _fakeProvider = makeFakeProvider();

    // Reset claim mock so we can differentiate skip vs claim $executeRaw calls
    mockDb.$executeRaw.mockResolvedValue(1);

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.$executeRaw).toHaveBeenCalled());

    // Only one $executeRaw call: for SKIPPED (no subsequent CLAIMED attempt)
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    expect(_fakeProvider.send).not.toHaveBeenCalled();
    expect(mockDb.alert.create).toHaveBeenCalledOnce();
  });

  it("8: enforceWorkspaceId throws �� no DB create, no email side-effect", async () => {
    mockEnforce.mockImplementationOnce(() => {
      throw new Error("Empty workspaceId");
    });
    _fakeProvider = makeFakeProvider();

    await expect(
      createAlert({
        workspaceId: "",
        userId: "user-xyz",
        type: "threshold_breach",
        channel: "email",
        severity: "critical",
        message: "test",
      })
    ).rejects.toThrow("Empty workspaceId");

    expect(mockDb.alert.create).not.toHaveBeenCalled();
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("9: delivery already claimed ($executeRaw returns 0) → no send, no db.update", async () => {
    // Second row in $executeRaw sequence returns 0 (claim slot already taken)
    // First call may be the SKIPPED check or CLAIMED check
    mockDb.$executeRaw.mockResolvedValueOnce(0);
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider();

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(_fakeProvider.send).not.toHaveBeenCalled();
    expect(mockDb.alert.update).not.toHaveBeenCalled();
  });

  it("10: provider 500 error → FAILED state, emailSentAt=null, audit emitted", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = {
      send: vi.fn().mockRejectedValue(new Error("Resend API error 500: internal server error")),
    };

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    expect(mockDb.alert.create).toHaveBeenCalledOnce();

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailDeliveryStatus).toBe("FAILED");
    expect(updateCall.data.emailSentAt).toBeNull();
    expect(updateCall.data.emailError).toContain("500");

    const failedAudit = mockAudit.mock.calls.find(
      (c) => ["alert.email_failed", "alert.email_permanently_failed"].includes(c[0]?.eventName)
    );
    expect(failedAudit).toBeDefined();
  });

  it("11: user not in workspace → SKIPPED via $executeRaw, no send, no subsequent claim", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    mockDb.user.findFirst.mockResolvedValue(null);
    _fakeProvider = makeFakeProvider();

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId as string,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message as string,
    });

    await vi.waitFor(() => expect(mockDb.$executeRaw).toHaveBeenCalled());

    // Only SKIPPED $executeRaw (no CLAIMED attempt)
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    expect(_fakeProvider.send).not.toHaveBeenCalled();
    expect(mockDb.alert.create).toHaveBeenCalledOnce();
  });

  it("12: concurrent delivery simulation → exactly one CLAIMED wins; exactly one email sent", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider({ id: "resend-concurrent-001" });

    // First CLAIMED call wins; second finds slot already taken
    mockDb.$executeRaw
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    await Promise.all([
      createAlert({
        workspaceId: stored.workspaceId,
        userId: stored.userId as string,
        type: "threshold_breach",
        channel: "email",
        severity: "critical",
        message: stored.message as string,
      }),
      createAlert({
        workspaceId: stored.workspaceId,
        userId: stored.userId as string,
        type: "threshold_breach",
        channel: "email",
        severity: "critical",
        message: stored.message as string,
      }),
    ]);

    await vi.waitFor(() => expect(mockDb.$executeRaw).toHaveBeenCalledTimes(2));

    // Exactly one email sent despite two concurrent delivery attempts
    expect(_fakeProvider.send).toHaveBeenCalledTimes(1);
  });
});
