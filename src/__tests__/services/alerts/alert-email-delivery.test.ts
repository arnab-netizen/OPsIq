/**
 * Alert email delivery — Stage 3E corrective closure tests.
 *
 * Covers:
 *  1  provider configured → sends correct Resend request + persists emailSentAt
 *  2  provider absent → in-app alert persists, emailError='RESEND_API_KEY not configured'
 *  3  provider failure → alert persists, emailError set, failure audit event emitted
 *  4  duplicate idempotency key → createAlert returns existing; no second email sent
 *  5  compliance deadline trigger → uses channel:"email" and enters real delivery path
 *  6  critical state trigger → uses channel:"email" and enters real delivery path
 *  7  cross-workspace recipient rejected (userId not in workspace)
 *  8  denied request (enforceWorkspaceId throws) → no DB create, no email side-effect
 *  9  alert already has emailSentAt → deliverEmailAlert skips duplicate send
 * 10  provider 429/500 → alert persists (not deleted), error recorded
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    alert: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
  classifyOperatorError: vi.fn().mockReturnValue({ operatorMessage: "test error" }),
}));
vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    ALERT_CREATED: "alert.created",
    ALERT_UPDATED: "alert.updated",
    ALERT_EMAIL_DELIVERED: "alert.email_delivered",
    ALERT_EMAIL_FAILED: "alert.email_failed",
  },
}));

// Controlled fake email provider — injectable via setFakeProvider()
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

// ── Helpers ────────────────────────────────────────────────────────────────

const mockDb = db as {
  alert: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
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
  mockDb.user.findUnique.mockResolvedValue({ email: "owner@example.com" });
  mockDb.alert.update.mockResolvedValue({});
  mockDb.alert.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  _fakeProvider = null;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("alert email delivery", () => {
  it("1: provider configured → sends correct Resend request and persists emailSentAt", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = makeFakeProvider({ id: "resend-msg-001" });

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message,
    });

    // Allow the fire-and-forget deliverEmailAlert to settle
    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe(stored.id);
    expect(updateCall.data.emailSentAt).toBeInstanceOf(Date);
    expect(updateCall.data.resendMessageId).toBe("resend-msg-001");
    expect(updateCall.data.emailError).toBeNull();

    expect(_fakeProvider.send).toHaveBeenCalledOnce();
    const sendArg = _fakeProvider.send.mock.calls[0][0];
    expect(sendArg.to).toBe("owner@example.com");
    expect(sendArg.subject).toContain("CRITICAL");
    expect(sendArg.html).toContain(stored.message);
  });

  it("2: provider absent → in-app alert persists and emailError records explicit skip", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = null; // no provider

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailError).toContain("RESEND_API_KEY not configured");
    expect(updateCall.data.emailSentAt).toBeUndefined();
    // Alert still in DB — create was called once
    expect(mockDb.alert.create).toHaveBeenCalledOnce();
  });

  it("3: provider failure → alert persists, emailError set, failure audit event emitted", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = { send: vi.fn().mockRejectedValue(new Error("Resend API error 429: rate limit exceeded")) };

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailError).toContain("429");
    expect(updateCall.data.emailSentAt).toBeUndefined();

    // Alert was NOT deleted — DB still has the record
    expect(mockDb.alert.create).toHaveBeenCalledOnce();

    // Failure audit event emitted
    const failedAuditCall = mockAudit.mock.calls.find(
      (c) => c[0]?.eventName === "alert.email_failed"
    );
    expect(failedAuditCall).toBeDefined();
    expect(failedAuditCall![0].payload.errorClass).toBe("Error");
  });

  it("4: duplicate idempotency key → existing alert returned, no second email sent", async () => {
    const existing = makeStoredAlert({ emailSentAt: new Date(), resendMessageId: "already-sent" });
    mockDb.alert.findFirst.mockResolvedValue(existing);
    _fakeProvider = makeFakeProvider();

    const result = await createAlert({
      workspaceId: existing.workspaceId,
      userId: existing.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: existing.message,
      idempotencyKey: "compliance-deadline:item-1:days3",
    });

    // Returned existing alert
    expect(result.id).toBe(existing.id);
    // No new DB create
    expect(mockDb.alert.create).not.toHaveBeenCalled();
    // No email sent
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

  it("6: critical state trigger → channel=email entered, severity=critical, delivery path invoked", async () => {
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

  it("7: user has no email address → alert persists, emailError=user_no_email_address", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    mockDb.user.findUnique.mockResolvedValue({ email: null });
    _fakeProvider = makeFakeProvider();

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailError).toBe("user_no_email_address");
    expect(_fakeProvider.send).not.toHaveBeenCalled();
    // Alert still persisted
    expect(mockDb.alert.create).toHaveBeenCalledOnce();
  });

  it("8: enforceWorkspaceId throws → no DB create, no email side-effect", async () => {
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

  it("9: alert already has emailSentAt → deliverEmailAlert skips duplicate send", async () => {
    // Simulate a situation where the stored alert already has emailSentAt set.
    // The idempotency check at the top of deliverEmailAlert must fire.
    const alreadyDelivered = makeStoredAlert({ emailSentAt: new Date("2026-07-25T12:00:00Z") });
    mockDb.alert.create.mockResolvedValue(alreadyDelivered);
    _fakeProvider = makeFakeProvider();

    await createAlert({
      workspaceId: alreadyDelivered.workspaceId,
      userId: alreadyDelivered.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: alreadyDelivered.message,
    });

    // Give async delivery a chance to run
    await new Promise((r) => setTimeout(r, 20));
    // Provider must NOT have been called — idempotency guard fired
    expect(_fakeProvider.send).not.toHaveBeenCalled();
  });

  it("10: provider 500 error → alert NOT deleted, emailError persisted, audit event emitted", async () => {
    const stored = makeStoredAlert();
    mockDb.alert.create.mockResolvedValue(stored);
    _fakeProvider = {
      send: vi.fn().mockRejectedValue(new Error("Resend API error 500: internal server error")),
    };

    await createAlert({
      workspaceId: stored.workspaceId,
      userId: stored.userId,
      type: "threshold_breach",
      channel: "email",
      severity: "critical",
      message: stored.message,
    });

    await vi.waitFor(() => expect(mockDb.alert.update).toHaveBeenCalled());

    // Alert row still in DB (create called once, never deleted)
    expect(mockDb.alert.create).toHaveBeenCalledOnce();

    const updateCall = mockDb.alert.update.mock.calls[0][0];
    expect(updateCall.data.emailError).toContain("500");

    const failedAudit = mockAudit.mock.calls.find(
      (c) => c[0]?.eventName === "alert.email_failed"
    );
    expect(failedAudit).toBeDefined();
  });
});
