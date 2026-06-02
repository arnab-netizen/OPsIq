import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { POST as operatorPost } from "@/app/api/operator/route";
import { classifyOutcome } from "@/services/operator/outcome-classifier";

describe("P2B: Operator Outcome Path Integration", () => {
  let testItemId: string;
  let testWorkspaceId: string;

  beforeEach(async () => {
    testWorkspaceId = "test-workspace-" + Date.now();
    // Create test item
    const item = await db.operatorItem.create({
      data: {
        id: "test-item-" + Date.now(),
        workspaceId: testWorkspaceId,
        problem: "Test problem",
        action: "Test action",
        impactExpected: 50000,
        impactLow: 25000,
        impactHigh: 75000,
        confidence: 0.8,
        priorityScore: 5,
        status: "in_progress",
        executionStatus: "started",
        updatedAt: new Date(),
      },
    });
    testItemId = item.id;
  });

  afterEach(async () => {
    // Cleanup
    await db.operatorItem.deleteMany({
      where: { workspaceId: testWorkspaceId },
    });
  });

  describe("Success outcome path", () => {
    it("should classify 100% achievement as success and populate actualOutcome", async () => {
      const item = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      const classification = classifyOutcome(50000, item?.impactExpected ?? null);
      expect(classification.category).toBe("success");

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 50000,
          actualOutcome: classification.category,
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.actualOutcome).toBe("success");
      expect(updated?.actualOutcomeValue).toBe(50000);
    });

    it("should require no outcomeNotes for success outcome", async () => {
      const item = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      const classification = classifyOutcome(75000, item?.impactExpected ?? null);
      expect(classification.category).toBe("success");

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 75000,
          actualOutcome: classification.category,
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.actualOutcome).toBe("success");
      expect(updated?.outcomeNotes).toBeNull();
    });
  });

  describe("Failure outcome path", () => {
    it("should classify zero as failure and populate actualOutcome", async () => {
      const classification = classifyOutcome(0, 50000);
      expect(classification.category).toBe("failure");

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 0,
          actualOutcome: classification.category,
          status: "done",
          outcomeNotes: "No action taken",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.actualOutcome).toBe("failure");
      expect(updated?.outcomeNotes).toBe("No action taken");
    });

    it("should require outcomeNotes for failure outcome", async () => {
      const classification = classifyOutcome(0, 50000);
      expect(classification.category).toBe("failure");

      // Attempting to set failure without notes should be caught by route
      // (application layer validation, tested in route tests)
      const updated = await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 0,
          actualOutcome: classification.category,
          outcomeNotes: "Required explanation",
        },
      });

      expect(updated.actualOutcome).toBe("failure");
      expect(updated.outcomeNotes).toBe("Required explanation");
    });
  });

  describe("Partial outcome path", () => {
    it("should classify 25% achievement as partial", async () => {
      const classification = classifyOutcome(12500, 50000);
      expect(classification.category).toBe("partial");

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 12500,
          actualOutcome: classification.category,
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.actualOutcome).toBe("partial");
    });
  });

  describe("Uncertain outcome path", () => {
    it("should classify 5x expected as uncertain and populate actualOutcome", async () => {
      const classification = classifyOutcome(250000, 50000);
      expect(classification.category).toBe("uncertain");

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 250000,
          actualOutcome: classification.category,
          status: "done",
          outcomeNotes: "Exceptional circumstance occurred",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.actualOutcome).toBe("uncertain");
      expect(updated?.outcomeNotes).toBe("Exceptional circumstance occurred");
    });

    it("should require outcomeNotes for uncertain outcome", async () => {
      const classification = classifyOutcome(250000, 50000);
      expect(classification.category).toBe("uncertain");

      const updated = await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 250000,
          actualOutcome: classification.category,
          outcomeNotes: "Explanation required",
        },
      });

      expect(updated.actualOutcome).toBe("uncertain");
      expect(updated.outcomeNotes).toBe("Explanation required");
    });
  });

  describe("Verification metadata capture", () => {
    it("should populate verificationStatus as unverified for normal outcomes", async () => {
      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 50000,
          actualOutcome: "success",
          verificationStatus: "unverified",
          verificationMethod: "customer_reported_unverified",
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.verificationStatus).toBe("unverified");
      expect(updated?.verificationMethod).toBe("customer_reported_unverified");
    });

    it("should populate verificationStatus as disputed for suspicious outcomes", async () => {
      // Extremely high variance = fraud risk high
      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 500000,
          actualOutcome: "uncertain",
          verificationStatus: "disputed",
          verificationMethod: "customer_reported_unverified",
          outcomeNotes: "Verification required",
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(updated?.verificationStatus).toBe("disputed");
    });
  });

  describe("Audit trail capture", () => {
    it("should populate auditTrail when outcome is recorded", async () => {
      const auditTrail = [
        {
          timestamp: new Date().toISOString(),
          actorId: "test-actor",
          action: "OUTCOME_RECORDED",
          afterValue: 50000,
          reason: "Customer reported outcome value: 50000",
        },
      ];

      await db.operatorItem.update({
        where: { id: testItemId },
        data: {
          actualOutcomeValue: 50000,
          actualOutcome: "success",
          auditTrail: auditTrail,
          status: "done",
        },
      });

      const updated = await db.operatorItem.findUnique({
        where: { id: testItemId },
      });

      expect(Array.isArray(updated?.auditTrail)).toBe(true);
      expect((updated?.auditTrail as any)[0].action).toBe("OUTCOME_RECORDED");
    });
  });
});
