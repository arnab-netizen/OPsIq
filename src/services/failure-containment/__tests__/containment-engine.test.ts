import { ContainmentEngine } from "../containment-engine";
import { ExecutionFailureType, FailureSeverity } from "@/domain/execution/failure";
import { v4 as uuidv4 } from "uuid";

describe("ContainmentEngine", () => {
  const engine = new ContainmentEngine();
  const executionId = uuidv4();

  describe("detectAndContainFailure", () => {
    it("should detect and contain action failure", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.ACTION_FAILED,
        "Action execution failed",
        { actionId: "action-1" },
        ["action-1"]
      );

      expect(result.success).toBe(true);
      expect(result.failure.severity).toBe(FailureSeverity.MEDIUM);
      expect(result.containment.strategy).toBe("ISOLATE");
      expect(result.containment.cascadePrevented).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should escalate on critical state violation", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.STATE_VIOLATION,
        "State consistency violated",
        { expectedState: "pending", actualState: "failed" },
        ["action-1", "action-2"]
      );

      expect(result.failure.severity).toBe(FailureSeverity.CRITICAL);
      expect(result.containment.strategy).toBe("ESCALATE");
      expect(result.containment.cascadePrevented).toBe(false);
    });

    it("should handle timeout failure with high severity", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.TIMEOUT,
        "Action timed out after 30s",
        { timeout: 30000 },
        ["action-1"]
      );

      expect(result.failure.severity).toBe(FailureSeverity.HIGH);
      expect(result.containment.strategy).toBe("ISOLATE");
    });

    it("should handle resource exhausted failure", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.RESOURCE_EXHAUSTED,
        "Insufficient memory",
        { availableMemory: 512 },
        []
      );

      expect(result.failure.severity).toBe(FailureSeverity.HIGH);
      expect(result.recommendations.some((r) => r.includes("resources"))).toBe(
        true
      );
    });

    it("should handle dependency failure with medium severity", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.DEPENDENCY_FAILURE,
        "External service unavailable",
        { service: "payment-api" },
        ["action-2"]
      );

      expect(result.failure.severity).toBe(FailureSeverity.MEDIUM);
      expect(result.recommendations.some((r) => r.includes("service"))).toBe(
        true
      );
    });

    it("should prevent cascade for single action failure", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.ACTION_FAILED,
        "Single action failed",
        {},
        ["action-1"]
      );

      expect(result.containment.cascadePrevented).toBe(true);
      expect(result.containment.isolatedScope).toBe("ACTION_LEVEL");
    });

    it("should isolate full execution for no affected actions", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.UNKNOWN,
        "Unknown failure",
        {},
        []
      );

      expect(result.containment.isolatedScope).toBe("FULL_EXECUTION");
    });

    it("should set cascade prevention to false for escalation", async () => {
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.STATE_VIOLATION,
        "Critical state violation",
        {},
        ["action-1", "action-2"]
      );

      expect(result.containment.strategy).toBe("ESCALATE");
      expect(result.containment.cascadePrevented).toBe(false);
    });

    it("should include timestamp in failure", async () => {
      const beforeFailure = new Date();
      const result = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.ACTION_FAILED,
        "Test failure",
        {},
        []
      );
      const afterFailure = new Date();

      expect(result.failure.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeFailure.getTime()
      );
      expect(result.failure.timestamp.getTime()).toBeLessThanOrEqual(
        afterFailure.getTime()
      );
    });

    it("should generate unique failure IDs", async () => {
      const result1 = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.ACTION_FAILED,
        "Failure 1",
        {},
        []
      );

      const result2 = await engine.detectAndContainFailure(
        executionId,
        ExecutionFailureType.ACTION_FAILED,
        "Failure 2",
        {},
        []
      );

      expect(result1.failure.id).not.toBe(result2.failure.id);
    });
  });

  describe("rollbackDecision", () => {
    it("should rollback from running to pending state", async () => {
      const decisionId = uuidv4();
      const result = await engine.rollbackDecision(
        decisionId,
        "running",
        "User cancelled execution"
      );

      expect(result.success).toBe(true);
      expect(result.previousState).toBe("running");
      expect(result.newState).toBe("pending");
      expect(result.reason).toBe("User cancelled execution");
    });

    it("should rollback from paused to running state", async () => {
      const decisionId = uuidv4();
      const result = await engine.rollbackDecision(decisionId, "paused", "Resume cancelled");

      expect(result.success).toBe(true);
      expect(result.newState).toBe("running");
    });

    it("should fail rollback for unknown state", async () => {
      const decisionId = uuidv4();
      const result = await engine.rollbackDecision(
        decisionId,
        "unknown_state",
        "Test rollback"
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain("No previous state");
    });

    it("should estimate affected actions", async () => {
      const decisionId = uuidv4();
      const result = await engine.rollbackDecision(
        decisionId,
        "completed",
        "Rollback after completion"
      );

      expect(result.affectedActions).toBeGreaterThanOrEqual(0);
    });

    it("should include timestamp in rollback result", async () => {
      const beforeRollback = new Date();
      const result = await engine.rollbackDecision(
        uuidv4(),
        "running",
        "Test rollback"
      );
      const afterRollback = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeRollback.getTime()
      );
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(
        afterRollback.getTime()
      );
    });

    it("should preserve decision ID in rollback", async () => {
      const decisionId = uuidv4();
      const result = await engine.rollbackDecision(decisionId, "running", "Test");

      expect(result.decisionId).toBe(decisionId);
    });
  });
});
