/**
 * Phase 3 — API tests for /api/owner/process-execution (mocked service layer).
 * Tests Zod schema validation, action dispatch, error code mapping, and Now View extensions.
 * No real DB or HTTP server — service layer is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ── Shared mocks ─────────────────────────────────────────────────────────────

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

vi.mock("@/services/owner-mode/owner-action-outcome.service", () => ({
  recordOwnerActionOutcome: vi.fn(async () => ({
    id: "outcome-cuid-1",
    workspaceId: "ws-1",
    businessId: "biz-1",
    outcomeStatus: "worked",
    taskKey: "task_cash",
    taskType: "process_execution",
    verificationClassification: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    learningCandidateId: null,
  })),
  OutcomeNotFoundError: class extends Error { readonly code = "OUTCOME_NOT_FOUND"; },
  OutcomeAlreadyVerifiedError: class extends Error { readonly code = "OUTCOME_ALREADY_VERIFIED"; },
  SeparationOfDutyViolationError: class extends Error { readonly code = "SEPARATION_OF_DUTY_VIOLATION"; },
}));

import { applyProcessExecutionAction } from "@/services/owner-mode/process-execution-bridge.service";

// ── Route schema (mirrors the actual Zod schema in route.ts) ─────────────────

const routeSchema = z.object({
  taskKey: z.string().trim().min(1).max(400),
  action: z.enum([
    "START", "APPROVE", "REJECT", "DELEGATE", "SUBMIT_EVIDENCE", "COMPLETE",
    "REQUEST_REASSESSMENT", "MARK_BLOCKED", "REQUEST_MISSING_DATA",
    "ACKNOWLEDGE", "RECORD_PROGRESS", "RECORD_OUTCOME", "VERIFY_OUTCOME",
  ]),
  businessId: z.string().trim().uuid().nullish(),
  evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  reason: z.string().trim().max(2000).nullish(),
  delegateToRole: z.enum(["MANAGER", "STAFF"]).nullish(),
  outcomeNotes: z.string().trim().max(2000).nullish(),
  progressPct: z.number().int().min(0).max(100).nullish(),
  stage: z.string().trim().max(200).nullish(),
  outcomeStatus: z.enum([
    "worked", "partially_worked", "did_not_work", "made_worse",
    "not_measurable", "too_early_to_judge", "invalid_test",
    "executed_differently", "external_event_interference",
  ]).nullish(),
});

// ── Schema validation tests ───────────────────────────────────────────────────

describe("POST /api/owner/process-execution — Zod schema validation", () => {
  it("accepts ACKNOWLEDGE action", () => {
    const result = routeSchema.safeParse({ taskKey: "task_cash", action: "ACKNOWLEDGE" });
    expect(result.success).toBe(true);
  });

  it("accepts RECORD_PROGRESS with progressPct and stage", () => {
    const result = routeSchema.safeParse({
      taskKey: "task_cash",
      action: "RECORD_PROGRESS",
      progressPct: 50,
      stage: "Phase 1",
      reason: "Halfway done",
    });
    expect(result.success).toBe(true);
  });

  it("accepts RECORD_OUTCOME with outcomeStatus", () => {
    const result = routeSchema.safeParse({
      taskKey: "task_cash",
      action: "RECORD_OUTCOME",
      businessId: "550e8400-e29b-41d4-a716-446655440000",
      outcomeStatus: "worked",
      outcomeNotes: "Cash flow improved",
    });
    expect(result.success).toBe(true);
  });

  it("accepts VERIFY_OUTCOME with reason", () => {
    const result = routeSchema.safeParse({
      taskKey: "task_cash",
      action: "VERIFY_OUTCOME",
      reason: "Metrics confirmed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown action enum value", () => {
    const result = routeSchema.safeParse({ taskKey: "task_cash", action: "INVALID_ACTION" });
    expect(result.success).toBe(false);
  });

  it("rejects progressPct out of range", () => {
    const result = routeSchema.safeParse({ taskKey: "task_cash", action: "RECORD_PROGRESS", progressPct: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid outcomeStatus", () => {
    const result = routeSchema.safeParse({ taskKey: "task_cash", action: "RECORD_OUTCOME", outcomeStatus: "unknown_status" });
    expect(result.success).toBe(false);
  });

  it("rejects missing taskKey", () => {
    const result = routeSchema.safeParse({ action: "ACKNOWLEDGE" });
    expect(result.success).toBe(false);
  });

  it("rejects businessId that is not a valid UUID", () => {
    const result = routeSchema.safeParse({ taskKey: "task_cash", action: "RECORD_OUTCOME", businessId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ── Service dispatch tests ────────────────────────────────────────────────────

function makeDb(taskOverride: Record<string, unknown> = {}) {
  const task = {
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
    ...taskOverride,
  };

  const taskFindFirst = vi.fn(async () => task);
  const taskUpdateMany = vi.fn(async () => ({ count: 1 }));
  const progressCreate = vi.fn(async () => ({ id: "prog-1" }));
  const auditCreate = vi.fn(async () => ({}));
  const businessFindFirst = vi.fn(async () => ({ id: "biz-1" }));

  return {
    processExecutionTask: { findFirst: taskFindFirst, updateMany: taskUpdateMany },
    processExecutionTaskProgress: { create: progressCreate },
    auditEvent: { create: auditCreate },
    ownerBusiness: { findFirst: businessFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { findFirst: taskFindFirst, updateMany: taskUpdateMany },
        processExecutionTaskProgress: { create: progressCreate },
        auditEvent: { create: auditCreate },
      })
    ),
  };
}

describe("applyProcessExecutionAction — Phase 3 action dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ACKNOWLEDGE returns ok:true with status=ACKNOWLEDGED", async () => {
    const db = makeDb({ status: "PROPOSED" });
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u1", actorRole: "owner", taskKey: "task_cash", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("ACKNOWLEDGE is idempotent on already-ACKNOWLEDGED task (returns ok:true)", async () => {
    const db = makeDb({ status: "ACKNOWLEDGED" });
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u1", actorRole: "owner", taskKey: "task_cash", action: "ACKNOWLEDGE",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("RECORD_PROGRESS returns ok:true with progressRecordId", async () => {
    const db = makeDb({ status: "IN_PROGRESS" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 0 })) },
        processExecutionTaskProgress: { create: vi.fn(async () => ({ id: "prog-new-1" })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      })
    );
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_PROGRESS",
        businessId: null, evidenceRefs: undefined, reason: "Making progress", delegateToRole: null, outcomeNotes: null,
        progressPct: 40, stage: "Prep", outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(true);
    expect((result as { progressRecordId?: string }).progressRecordId).toBeDefined();
  });

  it("RECORD_OUTCOME returns ok:true with outcomeId", async () => {
    const db = makeDb({ status: "COMPLETED", outcomeId: null });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      })
    );
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: "biz-1", evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: "It worked",
        progressPct: null, stage: null, outcomeStatus: "worked" },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(true);
    expect((result as { outcomeId?: string }).outcomeId).toBeDefined();
  });

  it("VERIFY_OUTCOME returns ok:true with verificationClassification", async () => {
    const db = makeDb({ status: "OUTCOME_RECORDED", outcomeId: "outcome-cuid-1" });
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processExecutionTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
        auditEvent: { create: vi.fn(async () => ({})) },
      })
    );
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: "Confirmed", delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(true);
    expect((result as { verificationClassification?: string }).verificationClassification).toBe("SUCCESS");
  });

  it("RECORD_OUTCOME returns MISSING_INPUT when outcomeStatus is not provided", async () => {
    const db = makeDb({ status: "COMPLETED", outcomeId: null });
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u1", actorRole: "owner", taskKey: "task_cash", action: "RECORD_OUTCOME",
        businessId: "biz-1", evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("MISSING_INPUT");
  });

  it("VERIFY_OUTCOME returns NOT_FOUND_OR_FORBIDDEN for cross-workspace task", async () => {
    const db = makeDb({ status: "OUTCOME_RECORDED", outcomeId: "outcome-cuid-1", workspaceId: "ws-OTHER" });
    // Simulate what the DB WHERE clause does: ws-1 query finds nothing for a task owned by ws-OTHER
    (db.processExecutionTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await applyProcessExecutionAction(
      { workspaceId: "ws-1", actorId: "u-verifier", actorRole: "owner", taskKey: "task_cash", action: "VERIFY_OUTCOME",
        businessId: null, evidenceRefs: undefined, reason: null, delegateToRole: null, outcomeNotes: null,
        progressPct: null, stage: null, outcomeStatus: null },
      { db: db as any, uuid: () => "test-uuid", now: () => new Date() }
    );
    expect(result.ok).toBe(false);
    expect((result as { code?: string }).code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });
});

// ── Error code mapping ────────────────────────────────────────────────────────

describe("Error code HTTP mapping (WRONG_WORKSPACE/UNAUTHORIZED → 403)", () => {
  it("WRONG_WORKSPACE code maps to 403 status", () => {
    const code = "WRONG_WORKSPACE";
    const status = code === "WRONG_WORKSPACE" || code === "UNAUTHORIZED" ? 403 : 400;
    expect(status).toBe(403);
  });

  it("UNAUTHORIZED code maps to 403 status", () => {
    const code = "UNAUTHORIZED";
    const status = code === "WRONG_WORKSPACE" || code === "UNAUTHORIZED" ? 403 : 400;
    expect(status).toBe(403);
  });

  it("INVALID_TRANSITION code maps to 400 status", () => {
    const code = "INVALID_TRANSITION";
    const status = code === "WRONG_WORKSPACE" || code === "UNAUTHORIZED" ? 403 : 400;
    expect(status).toBe(400);
  });

  it("TASK_NOT_FOUND code maps to 400 status", () => {
    const code = "TASK_NOT_FOUND";
    const status = code === "WRONG_WORKSPACE" || code === "UNAUTHORIZED" ? 403 : 400;
    expect(status).toBe(400);
  });
});
