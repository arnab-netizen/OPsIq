/**
 * Phase 3 — task lifecycle unit tests.
 * Tests the 4 new applyProcessExecutionAction branches (ACKNOWLEDGE, RECORD_PROGRESS,
 * RECORD_OUTCOME, VERIFY_OUTCOME) with a mocked DB layer. No real DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mocks ─────────────────────────────────────────────────────────────

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

vi.mock("@/services/owner-mode/owner-action-outcome.service", () => ({
  recordOwnerActionOutcome: vi.fn(async (_ws: string, _actor: string, input: { outcomeStatus: string }) => ({
    id: "outcome-cuid-1",
    workspaceId: "ws-1",
    businessId: "biz-1",
    outcomeStatus: input.outcomeStatus,
    taskKey: "task_cash",
    taskType: "process_execution",
    verificationClassification: null,
    createdAt: new Date("2026-07-18T00:00:00Z"),
    updatedAt: new Date("2026-07-18T00:00:00Z"),
  })),
}));

vi.mock("@/services/owner-mode/owner-outcome-verification.service", () => ({
  verifyOwnerActionOutcome: vi.fn(async () => ({
    ok: true,
    verificationClassification: "SUCCESS",
    verificationStatus: "verified",
  })),
  triggerPostVerificationSideEffects: vi.fn(async () => ({
    reassessmentId: "re-1",
    learningCandidateId: "lc-1",
  })),
  OutcomeNotFoundError: class OutcomeNotFoundError extends Error {},
  OutcomeAlreadyVerifiedError: class OutcomeAlreadyVerifiedError extends Error {},
  SeparationOfDutyViolationError: class SeparationOfDutyViolationError extends Error {},
  InsufficientEvidenceError: class InsufficientEvidenceError extends Error {
    readonly code = "INSUFFICIENT_EVIDENCE";
    readonly statusCode = 409;
  },
}));

// ── Minimal ProcessBridgeDb mock ─────────────────────────────────────────────

function makeDb(overrides: Record<string, unknown> = {}) {
  const findFirstTask = vi.fn();
  const updateManyTask = vi.fn(async () => ({ count: 1 }));
  const createProgress = vi.fn(async () => ({ id: "prog-1" }));
  const createAudit = vi.fn(async () => ({ id: "audit-db-1" }));

  return {
    processExecutionTask: { findFirst: findFirstTask, updateMany: updateManyTask },
    processExecutionTaskProgress: { create: createProgress },
    auditEvent: { create: createAudit },
    ownerBusiness: {
      findFirst: vi.fn(async () => ({ id: "biz-1" })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { findFirst: findFirstTask, updateMany: updateManyTask },
        processExecutionTaskProgress: { create: createProgress },
        auditEvent: { create: createAudit },
      })
    ),
    ...overrides,
  };
}

function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: "task-uuid-1",
    workspaceId: "ws-1",
    taskKey: "task_cash",
    status: "PROPOSED",
    severity: "HIGH",
    ownerVisibleSummary: "Improve cash flow",
    assignedRole: "owner",
    requiredEvidence: [],
    evidenceRefs: [],
    completionCriteria: "done",
    reassessmentTrigger: "none",
    approvalLevel: "OWNER_APPROVAL_REQUIRED",
    executionRoute: "CREATE_CORRECTION_TASK",
    riskIfIgnored: "Cash crisis",
    notActionableReason: null,
    blockerReason: null,
    dueAt: null,
    delegatedToRole: null,
    outcomeId: null,
    outcomeRecordedAt: null,
    acknowledgedAt: null,
    workStartedAt: null,
    completedByUserId: "user-recorder",
    ...over,
  };
}

import { applyProcessExecutionAction } from "@/services/owner-mode/process-execution-bridge.service";
import * as VerifService from "@/services/owner-mode/owner-outcome-verification.service";

// ── ACKNOWLEDGE ──────────────────────────────────────────────────────────────

describe("ACKNOWLEDGE action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transitions PROPOSED → ACKNOWLEDGED", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(baseTask({ status: "PROPOSED" }));
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const innerDb = {
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      };
      return fn(innerDb);
    });

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date("2026-07-18T12:00:00Z") }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("is idempotent on already-ACKNOWLEDGED task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(baseTask({ status: "ACKNOWLEDGED" }));

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("returns error for terminal task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(baseTask({ status: "REJECTED" }));

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
  });

  it("returns TASK_NOT_FOUND when task does not exist", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "nonexistent", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });
});

// ── RECORD_PROGRESS ──────────────────────────────────────────────────────────

describe("RECORD_PROGRESS action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a progress row without changing task status", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(baseTask({ status: "IN_PROGRESS" }));

    const progressCreate = vi.fn(async () => ({ id: "prog-new-1" }));
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
        processExecutionTaskProgress: { create: progressCreate },
        auditEvent: { create: vi.fn(async () => ({})) },
      });
    });

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_PROGRESS",
        businessId: null, evidenceRefs: undefined, reason: "Halfway done", delegateToRole: null, outcomeNotes: null,
        progressPct: 50, stage: "Phase 1", outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(true);
    expect((result as { progressRecordId?: string }).progressRecordId).toBeDefined();
  });

  it("returns error for terminal task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(baseTask({ status: "OUTCOME_VERIFIED" }));

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_PROGRESS",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: 75, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
  });
});

// ── RECORD_OUTCOME ────────────────────────────────────────────────────────────

describe("RECORD_OUTCOME action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates OwnerActionOutcome and links outcomeId on COMPLETED task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "COMPLETED", outcomeId: null })
    );
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      });
    });

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: "biz-1", evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: "It worked",
        progressPct: null, stage: null, outcomeStatus: "worked" },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(true);
    expect((result as { outcomeId?: string }).outcomeId).toBeDefined();
    expect(result.status).toBe("OUTCOME_RECORDED");
  });

  it("returns error for non-COMPLETED task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "IN_PROGRESS", outcomeId: null })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: "biz-1", evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: "worked" },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("INVALID_TRANSITION");
  });

  it("returns error when businessId is missing", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "COMPLETED", outcomeId: null })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: "worked" },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("MISSING_INPUT");
  });
});

// ── VERIFY_OUTCOME ────────────────────────────────────────────────────────────

describe("VERIFY_OUTCOME action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets verificationClassification on OUTCOME_RECORDED task", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "OUTCOME_RECORDED", outcomeId: "outcome-cuid-1" })
    );
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      });
    });

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: "Looks correct", delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(true);
    expect((result as { verificationClassification?: string }).verificationClassification).toBeDefined();
  });

  it("returns error when outcomeId is not set", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "OUTCOME_RECORDED", outcomeId: null })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
  });

  it("returns error for task with wrong status", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "IN_PROGRESS", outcomeId: "outcome-cuid-1" })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("INVALID_TRANSITION");
  });

  it("returns INVALID_TRANSITION when verifyOwnerActionOutcome throws InsufficientEvidenceError", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "OUTCOME_RECORDED", outcomeId: "outcome-cuid-1" })
    );
    vi.mocked(VerifService.verifyOwnerActionOutcome).mockRejectedValueOnce(
      Object.assign(new Error("Cannot verify outcome: insufficient evidence or owner-reported result"), {
        statusCode: 409, code: "INSUFFICIENT_EVIDENCE",
      })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("INVALID_TRANSITION");
  });
});

// ── Fix E regression: RECORD_OUTCOME requires explicit outcomeStatus ──────────

describe("RECORD_OUTCOME missing outcomeStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns MISSING_INPUT when outcomeStatus is not provided", async () => {
    const db = makeDb();
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      baseTask({ status: "COMPLETED", outcomeId: null })
    );

    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "user-1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: "biz-1", evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );

    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("MISSING_INPUT");
  });
});
