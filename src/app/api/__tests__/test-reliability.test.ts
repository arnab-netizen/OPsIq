import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createOperatorItem,
  createApprovedItem,
  createBlockedItem,
  createDependencyValidationBlock,
  createDecisionGateBlock,
  createGuardrailBlock,
  createBatch,
} from "./factories";

describe("PHASE 5: Test Reliability - Factory Patterns", () => {
  describe("Basic Item Creation", () => {
    it("should create a basic pending operator item", () => {
      const item = createOperatorItem();

      expect(item.id).toBeDefined();
      expect(item.status).toBe("pending");
      expect(item.workspaceId).toBeDefined();
      expect(item.confidence).toBe(0.75);
      expect(item.impactExpected).toBe(50000);
    });

    it("should allow overriding any field", () => {
      const item = createOperatorItem({
        confidence: 0.3,
        impactExpected: 100000,
        problem: "Custom problem",
      });

      expect(item.confidence).toBe(0.3);
      expect(item.impactExpected).toBe(100000);
      expect(item.problem).toBe("Custom problem");
    });

    it("should preserve workspace isolation", () => {
      const ws1 = "ws-1";
      const ws2 = "ws-2";

      const item1 = createOperatorItem({ workspaceId: ws1 });
      const item2 = createOperatorItem({ workspaceId: ws2 });

      expect(item1.workspaceId).not.toBe(item2.workspaceId);
      expect(item1.workspaceId).toBe(ws1);
      expect(item2.workspaceId).toBe(ws2);
    });
  });

  describe("Status-Specific Factories", () => {
    it("should create approved items with completed status", () => {
      const item = createApprovedItem();

      expect(item.status).toBe("done");
      expect(item.completedAt).toBeDefined();
      expect(item.startedAt).toBeDefined();
      expect(item.completedAt!.getTime()).toBeGreaterThanOrEqual(item.startedAt!.getTime());
    });

    it("should create blocked items with blocked status", () => {
      const item = createBlockedItem();

      expect(item.status).toBe("blocked");
      expect(item.blockStage).toBeNull();
      expect(item.blockReason).toBeNull();
    });

    it("should create blocked items with all fields populated", () => {
      const item = createBlockedItem({
        confidence: 0.4,
        impactExpected: 75000,
      });

      expect(item.status).toBe("blocked");
      expect(item.confidence).toBe(0.4);
      expect(item.impactExpected).toBe(75000);
    });
  });

  describe("Stage-Specific Block Factories", () => {
    it("should create dependency validation blocks", () => {
      const item = createDependencyValidationBlock();

      expect(item.status).toBe("blocked");
      expect(item.blockStage).toBe("dependency_validation");
      expect(item.blockReason).toBe("missing_required_data");
      expect(item.controlLayerViolations).toBeDefined();
    });

    it("should create decision gate blocks", () => {
      const item = createDecisionGateBlock();

      expect(item.status).toBe("blocked");
      expect(item.blockStage).toBe("decision_gate");
      expect(item.blockReason).toBe("stale_variables");
      expect(item.gateResult).toBeDefined();
    });

    it("should create guardrail blocks", () => {
      const item = createGuardrailBlock();

      expect(item.status).toBe("blocked");
      expect(item.blockStage).toBe("guardrails");
      expect(item.blockReason).toBe("high_impact_approval_required");
      expect(item.guardrailResult).toBeDefined();
      expect((item.guardrailResult as any).violations).toBeDefined();
    });

    it("should allow overriding block stage metadata", () => {
      const customReason = "custom_block_reason";
      const item = createGuardrailBlock({
        blockReason: customReason,
        guardrailResult: {
          violations: [
            {
              ruleId: "custom-rule",
              severity: "block",
              message: "Custom violation",
            },
          ],
        },
      });

      expect(item.blockReason).toBe(customReason);
      expect((item.guardrailResult as any).violations[0].ruleId).toBe("custom-rule");
    });
  });

  describe("Batch Creation", () => {
    it("should create batch of items", () => {
      const items = createBatch(5);

      expect(items).toHaveLength(5);
      expect(items.every((i) => i.id)).toBe(true);
      expect(items.every((i) => i.status === "pending")).toBe(true);
    });

    it("should create batch of approved items", () => {
      const items = createBatch(3, createApprovedItem);

      expect(items).toHaveLength(3);
      expect(items.every((i) => i.status === "done")).toBe(true);
    });

    it("should create batch with overrides", () => {
      const items = createBatch(4, createBlockedItem, {
        confidence: 0.3,
        blockStage: "guardrails",
      });

      expect(items).toHaveLength(4);
      expect(items.every((i) => i.status === "blocked")).toBe(true);
      expect(items.every((i) => i.confidence === 0.3)).toBe(true);
      expect(items.every((i) => i.blockStage === "guardrails")).toBe(true);
    });

    it("should create independent batch instances", () => {
      const items = createBatch(2);

      expect(items[0].id).not.toBe(items[1].id);
      expect(items[0].workspaceId).not.toBe(items[1].workspaceId);
    });
  });

  describe("Deterministic Testing", () => {
    it("should support deterministic comparison of created items", () => {
      const ws = "ws-deterministic";
      const item1 = createOperatorItem({
        workspaceId: ws,
        confidence: 0.5,
        impactExpected: 50000,
      });
      const item2 = createOperatorItem({
        workspaceId: ws,
        confidence: 0.5,
        impactExpected: 50000,
      });

      // Items should have same values for comparable fields
      expect(item1.workspaceId).toBe(item2.workspaceId);
      expect(item1.confidence).toBe(item2.confidence);
      expect(item1.impactExpected).toBe(item2.impactExpected);
      // But different IDs
      expect(item1.id).not.toBe(item2.id);
    });

    it("should support testing blocking conditions deterministically", () => {
      const lowConfidence = createBlockedItem({ confidence: 0.3 });
      const highConfidence = createApprovedItem({ confidence: 0.9 });

      expect(lowConfidence.confidence).toBeLessThan(0.5);
      expect(highConfidence.confidence).toBeGreaterThanOrEqual(0.5);
      expect(lowConfidence.status).toBe("blocked");
      expect(highConfidence.status).toBe("done");
    });
  });

  describe("Real-World Scenarios", () => {
    it("should model a complete decision lifecycle", () => {
      const workspaceId = "ws-lifecycle";

      // Decision starts pending
      const pending = createOperatorItem({
        workspaceId,
        confidence: 0.8,
        impactExpected: 50000,
      });
      expect(pending.status).toBe("pending");

      // Gets approved and completed
      const approved = createApprovedItem({
        workspaceId,
        confidence: 0.8,
        impactExpected: 50000,
        actualOutcomeValue: 52000,
      });
      expect(approved.status).toBe("done");
      expect(approved.completedAt).toBeDefined();
    });

    it("should model a decision blocked by multiple stages", () => {
      const workspaceId = "ws-multistage";

      // First block attempt
      const depBlock = createDependencyValidationBlock({ workspaceId });
      expect(depBlock.blockStage).toBe("dependency_validation");

      // After fixing dependencies, blocked by gate
      const gateBlock = createDecisionGateBlock({ workspaceId });
      expect(gateBlock.blockStage).toBe("decision_gate");

      // After refreshing, blocked by guardrail
      const guardrailBlock = createGuardrailBlock({ workspaceId });
      expect(guardrailBlock.blockStage).toBe("guardrails");
    });

    it("should support mixed decision outcomes in metrics calculation", () => {
      const workspaceId = "ws-metrics";
      const decisions = [
        ...createBatch(5, createApprovedItem, { workspaceId }),
        ...createBatch(2, createGuardrailBlock, { workspaceId }),
        ...createBatch(1, createDependencyValidationBlock, { workspaceId }),
      ];

      const approved = decisions.filter((d) => d.status === "done");
      const blocked = decisions.filter((d) => d.status === "blocked");

      expect(approved).toHaveLength(5);
      expect(blocked).toHaveLength(3);
      expect(decisions).toHaveLength(8);

      const blockRate = (blocked.length / decisions.length) * 100;
      expect(blockRate).toBeCloseTo(37.5, 1);
    });
  });
});
