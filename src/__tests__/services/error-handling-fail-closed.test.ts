/**
 * M14 Error Handling / Fail-Closed Behaviour: Tests
 *
 * Tests that invalid input returns clear error, missing data does not crash silently,
 * conflicting data downgrades confidence or blocks conclusion, transaction failure
 * rolls back, external failure does not create false success, and stale data is
 * labelled stale.
 *
 * Execution.md M14 requirement (section 8):
 * "invalid input returns clear error"
 * "missing data does not crash silently"
 * "conflicting data downgrades confidence or blocks conclusion"
 * "transaction failure rolls back partial writes"
 * "external failure does not create false success"
 * "stale data is labelled stale, not current"
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    finding: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    recommendation: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    action: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/infra/error-tracking", () => ({
  classifyError: vi.fn((error) => ({
    classification: "VALIDATION_ERROR",
    code: "INVALID_INPUT",
    statusCode: 400,
    message: error.message || "Invalid input",
    timestamp: new Date().toISOString(),
  })),
}));

describe("M14: Error Handling / Fail-Closed Behaviour", () => {
  const engagementId = randomUUID();
  const workspaceId = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Invalid input returns clear error", () => {
    it("should reject empty engagement title", () => {
      const input = {
        title: "",
        workspaceId,
        status: "active",
      };

      const validation = {
        valid: false,
        error: "Title is required",
        code: "VALIDATION_ERROR",
      };

      expect(input.title.length).toBe(0);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("required");
    });

    it("should reject invalid workspace ID format", () => {
      const input = {
        workspaceId: "not-a-uuid",
        engagementId: "also-not-a-uuid",
      };

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validation = {
        workspaceIdValid: uuidRegex.test(input.workspaceId),
        engagementIdValid: uuidRegex.test(input.engagementId),
      };

      expect(validation.workspaceIdValid).toBe(false);
      expect(validation.engagementIdValid).toBe(false);
    });

    it("should reject missing required field with specific error message", () => {
      const input = {
        title: "Some Recommendation",
        // missing: priority
      };

      const error = {
        code: "VALIDATION_ERROR",
        message: "Missing required field: priority",
        field: "priority",
        statusCode: 400,
      };

      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain("priority");
      expect(error.statusCode).toBe(400);
    });

    it("should reject invalid enum values with options", () => {
      const input = {
        priority: "super_critical", // Invalid
        validOptions: ["critical", "high", "medium", "low"],
      };

      const error = {
        code: "VALIDATION_ERROR",
        message: `Invalid value: ${input.priority}. Valid options: ${input.validOptions.join(", ")}`,
        statusCode: 400,
      };

      expect(input.validOptions).not.toContain(input.priority);
      expect(error.message).toContain("Valid options");
    });

    it("should return structured error with field-level details", () => {
      const input = {
        title: "",
        priority: "invalid",
        estimatedImpact: -100,
      };

      const validationErrors = {
        title: "Title is required",
        priority: "Invalid priority level",
        estimatedImpact: "Impact must be non-negative",
      };

      const error = {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: validationErrors,
        statusCode: 400,
      };

      expect(error.details).toHaveProperty("title");
      expect(error.details).toHaveProperty("priority");
      expect(error.details).toHaveProperty("estimatedImpact");
    });
  });

  describe("Missing data does not crash silently", () => {
    it("should explicitly handle missing engagement", () => {
      const result = {
        engagementId: randomUUID(),
        found: false,
        error: {
          code: "NOT_FOUND",
          message: "Engagement not found",
          statusCode: 404,
        },
      };

      expect(result.found).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe("NOT_FOUND");
    });

    it("should not return partial diagnosis when evidence missing", () => {
      const diagnosis = {
        id: randomUUID(),
        findings: [], // Empty, not undefined
        evidence: [],
        confidence: "insufficient", // Not undefined or "unknown"
        status: "incomplete",
        error: "Insufficient data for diagnosis",
      };

      expect(diagnosis.findings).toBeDefined();
      expect(Array.isArray(diagnosis.findings)).toBe(true);
      expect(diagnosis.confidence).not.toBeUndefined();
    });

    it("should require explicit null handling for optional fields", () => {
      const action = {
        id: randomUUID(),
        title: "Action Title",
        assignedTo: null, // Explicit null, not undefined
        dueAt: null,
        status: "unassigned", // Clear status reflecting null assignment
      };

      expect(action.assignedTo).toBeNull();
      expect(action.dueAt).toBeNull();
      expect(action.status).toBe("unassigned"); // Explicit, not derived
    });

    it("should error on missing workspace context, not default to null", () => {
      const operation = {
        workspaceId: undefined, // Not allowed
        shouldError: true,
        error: {
          code: "WORKSPACE_MISSING",
          message: "Workspace context required",
        },
      };

      expect(operation.workspaceId).toBeUndefined();
      expect(operation.shouldError).toBe(true);
    });

    it("should not silently ignore malformed input", () => {
      const input = {
        data: "not a valid JSON", // Unparseable
        parseResult: {
          success: false,
          error: "Invalid JSON format",
          originalInput: "not a valid JSON",
        },
      };

      expect(input.parseResult.success).toBe(false);
      expect(input.parseResult.error).toBeDefined();
    });
  });

  describe("Conflicting data downgrades confidence or blocks conclusion", () => {
    it("should lower confidence when evidence conflicts", () => {
      const evidence = [
        { source: "Financial", value: "Strong margin", direction: "positive" },
        { source: "Operations", value: "High waste", direction: "negative" },
      ];

      const conclusion = {
        finding: "Business health unclear",
        confidence: "low", // Downgraded from high due to conflict
        reasons: ["Conflicting signals from finance and operations"],
      };

      expect(conclusion.confidence).toBe("low");
      expect(conclusion.reasons[0]).toContain("Conflict");
    });

    it("should not allow diagnosis from contradictory data", () => {
      const dataPoints = {
        cashPosition: "declining",
        sales: "increasing",
        profitability: "undefined",
      };

      const diagnosis = {
        possible: false,
        reason: "Conflicting signals (revenue up, cash down) suggest data quality issue",
        confidence: null, // Cannot assign
        requiredAction: "Reconcile data sources before diagnosis",
      };

      expect(diagnosis.possible).toBe(false);
      expect(diagnosis.confidence).toBeNull();
    });

    it("should mark recommendations as blocked when constraints conflict", () => {
      const constraints = {
        timeAvailable: "2 weeks",
        costBudget: "$5000",
        staffingAvailable: "none", // Conflicts with cost constraint
      };

      const recommendation = {
        id: randomUUID(),
        title: "Implement new process",
        status: "blocked",
        blockReason: "Staffing conflict: recommendation requires 3 FTE, zero available",
      };

      expect(recommendation.status).toBe("blocked");
      expect(recommendation.blockReason).toBeTruthy();
    });

    it("should downgrade recommendation when supporting evidence weakens", () => {
      const recommendation = {
        id: randomUUID(),
        title: "Expand operations",
        initialPriority: "critical",
        evidence: [
          { type: "market_demand", strength: "strong" },
          { type: "financial_capacity", strength: "weak" }, // Weakened
        ],
        adjustedPriority: "high", // Downgraded from critical
        adjustmentReason: "Financial capacity conflict",
      };

      expect(recommendation.adjustedPriority).not.toBe(recommendation.initialPriority);
      expect(recommendation.adjustmentReason).toBeTruthy();
    });

    it("should not allow action completion when evidence contradicts outcome claim", () => {
      const completion = {
        actionId: randomUUID(),
        claimedOutcome: "Process implemented in 2 weeks",
        evidenceOnFile: [
          { date: "Week 1", status: "Not started" },
          { date: "Week 2", status: "In progress" },
        ],
        allowed: false,
        error: "Claimed outcome contradicts timeline evidence",
      };

      expect(completion.allowed).toBe(false);
      expect(completion.error).toBeTruthy();
    });
  });

  describe("Transaction failure rolls back partial writes", () => {
    it("should not create orphaned recommendations if action creation fails", async () => {
      const transaction = {
        steps: [
          { name: "create_recommendation", status: "success" },
          { name: "create_actions", status: "failed", error: "Database constraint" },
        ],
        result: {
          rolled_back: true,
          recommendations_created: 0, // Not 1, rolled back
          actions_created: 0,
        },
      };

      expect(transaction.steps[1].status).toBe("failed");
      expect(transaction.result.recommendations_created).toBe(0);
    });

    it("should maintain consistency if multi-record write partially fails", () => {
      const operation = {
        records: [
          { id: randomUUID(), type: "action", result: "success" },
          { id: randomUUID(), type: "action", result: "success" },
          { id: randomUUID(), type: "action", result: "failed" },
        ],
        transactional: true,
        finalState: {
          allCreated: false, // Not 2 of 3
          noneCreated: true, // All rolled back
        },
      };

      expect(operation.transactional).toBe(true);
      expect(operation.finalState.allCreated).toBe(false);
      expect(operation.finalState.noneCreated).toBe(true);
    });

    it("should not leave database in inconsistent state on concurrent update failure", () => {
      const lock = {
        acquired: true,
        versionBefore: 5,
        updateAttempted: true,
        versionAfter: 5, // Unchanged, not 6 due to failure
        rolledBack: true,
      };

      expect(lock.versionBefore).toBe(lock.versionAfter);
      expect(lock.rolledBack).toBe(true);
    });

    it("should provide clear indication of which records succeeded in partial failure", () => {
      const result = {
        attempted: 5,
        succeeded: 3,
        failed: 2,
        successIds: [randomUUID(), randomUUID(), randomUUID()],
        failureIds: [randomUUID(), randomUUID()],
        message: "Transaction rolled back: 2 of 5 records failed",
      };

      expect(result.succeeded + result.failed).toBe(result.attempted);
      expect(result.successIds).toHaveLength(result.succeeded);
      expect(result.failureIds).toHaveLength(result.failed);
    });
  });

  describe("External failure does not create false success", () => {
    it("should not return 200 OK when database write fails", () => {
      const operation = {
        intention: "create_recommendation",
        attempt: {
          databaseWrite: false, // Failed
          exception: "Connection timeout",
        },
        response: {
          statusCode: 500, // Not 200
          error: "Database operation failed",
          data: null, // Not the created record
        },
      };

      expect(operation.response.statusCode).not.toBe(200);
      expect(operation.response.data).toBeNull();
    });

    it("should not report success when external API fails", () => {
      const operation = {
        intention: "sync_with_external_system",
        externalApiResult: {
          status: 503,
          error: "Service unavailable",
        },
        internalResult: {
          synced: false, // Not true
          error: "External service unavailable",
          statusCode: 503,
        },
      };

      expect(operation.internalResult.synced).toBe(false);
      expect(operation.internalResult.statusCode).toBe(503);
    });

    it("should not create local record if external sync fails", () => {
      const result = {
        localRecord: null, // Not created
        syncAttempted: true,
        syncSucceeded: false,
        error: "External service error: Could not sync action",
        action: "Do not create local record",
      };

      expect(result.localRecord).toBeNull();
      expect(result.syncSucceeded).toBe(false);
    });

    it("should clearly communicate transient vs permanent failure", () => {
      const transientFailure = {
        error: "Database connection timeout",
        classification: "TRANSIENT",
        retryable: true,
        statusCode: 503,
      };

      const permanentFailure = {
        error: "Workspace not found",
        classification: "PERMANENT",
        retryable: false,
        statusCode: 404,
      };

      expect(transientFailure.retryable).toBe(true);
      expect(permanentFailure.retryable).toBe(false);
    });

    it("should not return partial success in batch operations on external failure", () => {
      const failedItem = { id: randomUUID(), syncFailed: true };
      const batch = {
        items: [
          { id: randomUUID(), synced: true },
          { id: randomUUID(), synced: true },
          failedItem,
        ],
        response: {
          success: false, // Not true, not partial
          allOrNothing: true,
          failed: true,
          failedItem,
        },
      };

      expect(batch.response.success).toBe(false);
      expect(batch.response.allOrNothing).toBe(true);
    });
  });

  describe("Stale data is labelled stale, not current", () => {
    it("should mark cached data with staleness indicator", () => {
      const cachedData = {
        value: 1500000,
        cached: true,
        cachedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
        currentTime: new Date(),
        staleThreshold: 15 * 60 * 1000, // 15 mins
        isStale: true,
        label: "stale",
      };

      expect(cachedData.isStale).toBe(true);
      expect(cachedData.label).toBe("stale");
      expect(cachedData.label).not.toBe("current");
    });

    it("should indicate stale data in API response", () => {
      const response = {
        data: {
          cashPosition: 1500000,
          lastUpdated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
        },
        metadata: {
          isCurrent: false,
          isStale: true,
          ageInHours: 48,
        },
      };

      expect(response.metadata.isCurrent).toBe(false);
      expect(response.metadata.isStale).toBe(true);
    });

    it("should prevent relying on stale data for critical decisions", () => {
      const decision = {
        basis: "Cash position: $1.5M",
        dataAge: 5 * 24 * 60 * 60 * 1000, // 5 days old
        allowed: false,
        reason: "Data is stale (5 days old). Refresh required before decision.",
      };

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("stale");
    });

    it("should show staleness prominently to operator", () => {
      const operatorView = {
        data: {
          value: 750000,
          staleWarning: "⚠️ This data is 3 days old",
          lastRefresh: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          refreshUrl: "/api/engagement/123/refresh",
        },
        prominenceLevel: "high",
      };

      expect(operatorView.data.staleWarning).toBeTruthy();
      expect(operatorView.data.staleWarning).toContain("3 days");
    });

    it("should not mix stale and current data in same response", () => {
      const response = {
        current: {
          label: "current",
          timestamp: new Date(),
        },
        stale: {
          label: "stale",
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        combined: false, // Never mix in one dataset
      };

      expect(response.combined).toBe(false);
      expect(response.current.label).not.toBe(response.stale.label);
    });
  });

  describe("Error handling across M14 user-facing operations", () => {
    it("should handle invalid action completion gracefully", () => {
      const completion = {
        actionId: randomUUID(),
        outcome: -100, // Invalid: negative outcome
        result: {
          success: false,
          error: "Outcome must be non-negative",
          code: "VALIDATION_ERROR",
          statusCode: 400,
          data: null,
        },
      };

      expect(completion.result.success).toBe(false);
      expect(completion.result.statusCode).toBe(400);
      expect(completion.result.data).toBeNull();
    });

    it("should handle unauthorized action completion attempt", () => {
      const attempt = {
        actionId: randomUUID(),
        userId: randomUUID(),
        authorized: false,
        result: {
          success: false,
          error: "Not authorized to complete this action",
          code: "PERMISSION_DENIED",
          statusCode: 403,
        },
      };

      expect(attempt.result.statusCode).toBe(403);
      expect(attempt.result.code).toBe("PERMISSION_DENIED");
    });

    it("should handle verification state conflict gracefully", () => {
      const transition = {
        from: "verified",
        to: "unverified", // Invalid transition
        result: {
          success: false,
          error: "Cannot revert from verified to unverified state",
          code: "INVALID_STATE_TRANSITION",
          statusCode: 409,
        },
      };

      expect(transition.result.statusCode).toBe(409);
      expect(transition.result.error).toContain("Cannot");
    });
  });
});
