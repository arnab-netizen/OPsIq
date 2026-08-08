/**
 * CAT 2 atomicity fix — re-evaluation.ts
 *
 * Verifies that the emitAuditEvent call inside runReEvaluationBatch (the
 * db.$transaction callback) passes `tx` as its second argument, so an audit
 * failure rolls back all condition/mode/phase writes in the same transaction.
 *
 * Root-cause: emitAuditEvent({...}) was called without tx inside the
 * db.$transaction callback at line 735. Fixed in this session.
 *
 * This test intercepts the db.$transaction call, captures the arguments passed
 * to emitAuditEvent inside the callback, and asserts that the second argument
 * is the transaction client (tx) — not undefined.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── module-level spies ──────────────────────────────────────────────────────

const capturedAuditCalls: Array<unknown[]> = [];
const mockEmitAuditEvent = vi.fn((...args: unknown[]) => {
  capturedAuditCalls.push(args);
  return Promise.resolve("audit-event-id");
});

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: (...args: unknown[]) => mockEmitAuditEvent(...args),
}));

const TX_SENTINEL = Symbol("tx");

let capturedTxCallback: ((tx: unknown) => Promise<unknown>) | null = null;

const fakeTx = {
  __isTx: true,
  [TX_SENTINEL]: true,
  engagement: {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  businessConditionProfile: {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
  recommendation: {
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
  },
  engagementEscalation: {
    findMany: vi.fn().mockResolvedValue([]),
  },
};

const mockDbTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
  capturedTxCallback = cb;
  return cb(fakeTx);
});

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (...args: unknown[]) => mockDbTransaction(args[0] as (tx: unknown) => Promise<unknown>),
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "idm-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    businessConditionProfile: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    recommendation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    engagementEscalation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    engagement: {
      findFirst: vi.fn().mockResolvedValue({
        id: "eng-001",
        healthStatus: "unknown",
        interventionMode: "assessment",
        interventionPhase: "initial_assessment",
        nextReviewDate: null,
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: "eng-001",
        workspaceId: "ws-001",
        healthStatus: "unknown",
        interventionMode: "assessment",
        interventionPhase: "initial_assessment",
        nextReviewDate: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    engagementReviewCadence: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/services/recommendation", () => ({
  reRankRecommendationsInEngagement: vi.fn().mockResolvedValue({ updated: 0, recommendations: [] }),
}));

vi.mock("@/services/escalation", () => ({
  checkEngagementEscalations: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/engagement", () => ({
  computeNextReviewDate: vi.fn().mockReturnValue(null),
}));

vi.mock("@/services/idempotency", () => ({
  checkIdempotencyKey: vi.fn().mockResolvedValue({ isNew: true, cachedResponse: null }),
  recordIdempotencyResponse: vi.fn().mockResolvedValue(undefined),
  recordIdempotencyError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: vi.fn().mockReturnValue({ operatorMessage: "error" }),
}));

// ── tests ───────────────────────────────────────────────────────────────────

describe("re-evaluation audit atomicity (CAT 2 fix)", () => {
  beforeEach(() => {
    capturedAuditCalls.length = 0;
    capturedTxCallback = null;
    vi.clearAllMocks();
    mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      capturedTxCallback = cb;
      return cb(fakeTx);
    });
    mockEmitAuditEvent.mockImplementation((...args: unknown[]) => {
      capturedAuditCalls.push(args);
      return Promise.resolve("audit-event-id");
    });
  });

  it("passes tx as the second argument to emitAuditEvent inside the transaction callback", async () => {
    const { triggerReEvaluation } = await import("@/services/re-evaluation");

    await triggerReEvaluation({
      changeType: "new_critical_evidence",
      entityType: "finding",
      entityId: "finding-001",
      engagementId: "eng-001",
      workspaceId: "ws-001",
      severity: "critical",
      description: "Critical finding discovered",
      triggeredBy: "user-001",
      correlationId: "corr-001",
    });

    // The transaction callback must have been executed
    expect(capturedTxCallback).not.toBeNull();

    // emitAuditEvent must have been called
    expect(capturedAuditCalls.length).toBeGreaterThan(0);

    // The last call inside the transaction must pass tx (not undefined) as the second argument.
    // This is the specific CAT 2 fix: the call at line 735 now includes tx.
    const lastCall = capturedAuditCalls[capturedAuditCalls.length - 1];
    expect(lastCall).toHaveLength(2);
    expect(lastCall[1]).toBe(fakeTx);
  });

  it("rolls back the transaction if emitAuditEvent throws", async () => {
    mockEmitAuditEvent.mockRejectedValueOnce(new Error("Audit write failure"));

    // The transaction mock should propagate the error from the callback
    mockDbTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      // Simulate transaction: if callback throws, transaction is aborted
      try {
        return await cb(fakeTx);
      } catch (err) {
        // In a real Prisma transaction, this would roll back
        throw err;
      }
    });

    const { triggerReEvaluation } = await import("@/services/re-evaluation");

    // The function should not swallow the audit failure inside the transaction
    await expect(
      triggerReEvaluation({
        changeType: "new_critical_evidence",
        entityType: "finding",
        entityId: "finding-002",
        engagementId: "eng-001",
        workspaceId: "ws-001",
        severity: "critical",
        description: "Critical finding discovered",
        triggeredBy: "user-001",
        correlationId: "corr-002",
      })
    ).rejects.toThrow("Audit write failure");
  });
});
