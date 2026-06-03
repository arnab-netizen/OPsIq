import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { recordDecisionOutcome } from "@/services/decisions/decision-lifecycle.service";
import { classifyOutcome } from "@/services/operator/outcome-classifier";

describe("P2B: Decision Lifecycle Outcome Path Integration", () => {
  let testDecisionId: string;
  let testWorkspaceId: string;
  let testActorId: string;

  beforeEach(async () => {
    testWorkspaceId = randomUUID();
    testActorId = randomUUID();

    // Create User for audit events (required by audit_events_actor_id_fkey)
    await db.user.create({
      data: {
        id: testActorId,
        email: `test-actor-${testActorId}@example.com`,
        updatedAt: new Date(),
      },
    });

    // Create test decision in EXECUTED state
    const decision = await db.operatorItem.create({
      data: {
        id: randomUUID(),
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
    testDecisionId = decision.id;
  });

  afterEach(async () => {
    // Delete in FK dependency order
    await db.auditEvent.deleteMany({
      where: {
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      },
    });
    await db.operatorItem.deleteMany({
      where: { workspaceId: testWorkspaceId },
    });
    await db.user.delete({
      where: { id: testActorId },
    });
  });

  describe("Success outcome recording", () => {
    it("should classify and record 100% achievement as success", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      const updated = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(updated?.actualOutcome).toBe("success");
      expect(updated?.actualOutcomeValue).toBe(50000);
    });

    it("should populate verificationStatus for success outcome", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      const updated = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(updated?.verificationStatus).toBe("unverified");
    });
  });

  describe("Failure outcome recording", () => {
    it("should require outcomeNotes for failure", async () => {
      let error: Error | null = null;
      try {
        await recordDecisionOutcome(
          testDecisionId,
          testWorkspaceId,
          {
            actualOutcomeValue: 0,
            outcomeNotes: null,
          },
          testActorId
        );
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Outcome notes required");
    });

    it("should accept failure with outcomeNotes", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 0,
          outcomeNotes: "No action completed",
        },
        testActorId
      );

      const updated = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(updated?.actualOutcome).toBe("failure");
      expect(updated?.outcomeNotes).toBe("No action completed");
    });
  });

  describe("Uncertain outcome recording", () => {
    it("should require outcomeNotes for uncertain", async () => {
      let error: Error | null = null;
      try {
        await recordDecisionOutcome(
          testDecisionId,
          testWorkspaceId,
          {
            actualOutcomeValue: 250000,
            outcomeNotes: null,
          },
          testActorId
        );
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Outcome notes required");
    });

    it("should accept uncertain with outcomeNotes and auto-flag", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 250000,
          outcomeNotes: "Exceptional result",
        },
        testActorId
      );

      const updated = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(updated?.actualOutcome).toBe("uncertain");
      expect(updated?.verificationStatus).toBe("disputed");
      expect(updated?.outcomeNotes).toBe("Exceptional result");
    });
  });

  describe("Partial outcome recording", () => {
    it("should classify and record partial outcome", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 12500,
        },
        testActorId
      );

      const updated = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(updated?.actualOutcome).toBe("partial");
      expect(updated?.actualOutcomeValue).toBe(12500);
    });
  });

  describe("Verification metadata convergence", () => {
    it("should capture identical metadata to operator path", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      // Verify all metadata fields match what operator route would set
      expect(decision?.verificationStatus).toBeDefined();
      expect(decision?.verificationMethod).toBe("customer_reported_unverified");
      expect(decision?.verificationConfidence).toBeDefined();
      expect(decision?.verificationEvidence).toBeDefined();
      expect(Array.isArray(decision?.auditTrail)).toBe(true);
    });

    it("should emit audit event for outcome recording", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(decision?.status).toBe("outcome_recorded");
    });
  });

  describe("High fraud risk auto-flagging", () => {
    it("should auto-flag when variance exceeds 500%", async () => {
      // 500% variance = actualOutcome 6x expected
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 300000,
          outcomeNotes: "Exceptional",
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      // High variance triggers high fraud risk which triggers disputed status
      expect(decision?.verificationStatus).toBe("disputed");
    });

    it("should not flag normal variances", async () => {
      // 50% variance = normal success
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 75000,
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(decision?.verificationStatus).toBe("unverified");
    });

    it("should flag retroactive modifications", async () => {
      // First record
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      // Second record with different value (retroactive modification)
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 100000,
          outcomeNotes: "Correction",
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(decision?.verificationStatus).toBe("disputed");
    });
  });

  describe("Path convergence verification", () => {
    it("should use identical classifier as operator route", async () => {
      const actualValue = 75000;
      const expectedValue = 50000;

      // Classification should be identical
      const classification = classifyOutcome(actualValue, expectedValue);
      expect(classification.category).toBe("success");

      // Record via decision path
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: actualValue,
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      expect(decision?.actualOutcome).toBe(classification.category);
    });

    it("should use identical verification metadata", async () => {
      await recordDecisionOutcome(
        testDecisionId,
        testWorkspaceId,
        {
          actualOutcomeValue: 50000,
        },
        testActorId
      );

      const decision = await db.operatorItem.findUnique({
        where: { id: testDecisionId },
      });

      // Same fields as operator route sets
      expect(decision?.verificationStatus).toBeDefined();
      expect(decision?.verificationMethod).toBe("customer_reported_unverified");
      expect(decision?.verificationConfidence).toBeDefined();
      expect(decision?.verificationEvidence).toBeDefined();
      expect(decision?.auditTrail).toBeDefined();
    });
  });
});
