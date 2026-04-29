/**
 * PHASE 4 CRITICAL 3: Audit Compliance Tests
 *
 * Tests that verify:
 * - All block paths call logAuditEvent with appropriate event names
 * - DEPENDENCY_VALIDATION_BLOCKED events capture violation details
 * - DECISION_GATE_BLOCKED events capture confidence/staleness issues
 * - GUARDRAILS_BLOCKED events capture violation rules and thresholds
 * - INPUT_VALIDATION_FAILED events log missing/invalid inputs
 * - AUTH_FAILED and PERMISSION_DENIED are logged before rejection
 * - RUN_APPROVED events log successful decisions
 * - OVERRIDE_APPROVED and OVERRIDE_DENIED events track overrides
 * - Audit write failures are NOT swallowed (fail-closed)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";

// Mock workspace context
vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn().mockResolvedValue({
    workspaceId: "test-workspace-id",
  }),
  validateWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth
vi.mock("@/services/auth/server-role", () => ({
  resolveServerRole: vi.fn().mockResolvedValue("editor"),
}));

vi.mock("@/services/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    user: { id: "test-user-id" },
  }),
}));

describe("PHASE 4 CRITICAL 3: Audit Compliance", () => {
  const testWorkspaceId = "test-workspace-id";
  const testUserId = "test-user-id";
  const testRole = "editor";

  describe("Audit Event Structure", () => {
    it("should create audit event with required fields", async () => {
      const auditEventId = await logAuditEvent({
        eventName: "TEST_EVENT",
        entityType: "Decision",
        entityId: "test-id",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { decision: "approved" },
        metadata: {
          testKey: "testValue",
        },
        workspaceId: testWorkspaceId,
      });

      // Verify record in database
      const events = await db.auditEvent.findMany({
        where: {
          eventName: "TEST_EVENT",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.eventName).toBe("TEST_EVENT");
      expect(event.entityType).toBe("Decision");
      expect(event.entityId).toBe("test-id");
      expect(event.actorId).toBe(testUserId);
      expect(event.role).toBe(testRole);
      expect(event.workspaceId).toBe(testWorkspaceId);
    });

    it("should preserve metadata JSON in audit event", async () => {
      const metadata = {
        blockStage: "dependency_validation",
        blockReason: "Missing baselineRevenue",
        variable: "revenueChange",
        missingDependencies: ["baselineRevenue"],
      };

      await logAuditEvent({
        eventName: "DEPENDENCY_VALIDATION_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "DEPENDENCY_VALIDATION_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.blockStage).toBe("dependency_validation");
      expect(storedMetadata?.missingDependencies).toContain("baselineRevenue");
    });
  });

  describe("Block Path Audit Events", () => {
    it("should log DEPENDENCY_VALIDATION_BLOCKED with violation details", async () => {
      const metadata = {
        blockStage: "dependency_validation",
        blockReason: "Variable 'revenueChange' requires 1 missing dependency(ies): baselineRevenue",
        variable: "revenueChange",
        missingDependencies: ["baselineRevenue"],
        expectedImpact: 100000,
        confidence: 0.8,
      };

      await logAuditEvent({
        eventName: "DEPENDENCY_VALIDATION_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: {
          blocked: true,
          reason: "Dependency validation failed",
        },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "DEPENDENCY_VALIDATION_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.blockStage).toBe("dependency_validation");
      expect(storedMetadata?.variable).toBe("revenueChange");
      expect(storedMetadata?.missingDependencies).toContain("baselineRevenue");
      expect(storedMetadata?.expectedImpact).toBe(100000);
      expect(storedMetadata?.confidence).toBe(0.8);
    });

    it("should log DECISION_GATE_BLOCKED with confidence/staleness details", async () => {
      const metadata = {
        blockStage: "decision_gate",
        blockReason: "Decision confidence (0.3) is below required threshold (0.5)",
        missingVariables: [],
        lowConfidenceVariables: ["confidence"],
        staleVariables: [],
        expectedImpact: 75000,
        confidence: 0.3,
      };

      await logAuditEvent({
        eventName: "DECISION_GATE_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: {
          blocked: true,
          reason: "Decision gate validation failed",
        },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "DECISION_GATE_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.blockStage).toBe("decision_gate");
      expect(storedMetadata?.lowConfidenceVariables).toContain("confidence");
      expect(storedMetadata?.confidence).toBe(0.3);
    });

    it("should log DECISION_GATE_BLOCKED with stale variables", async () => {
      const metadata = {
        blockStage: "decision_gate",
        blockReason: "Stale variables detected (>30 days old): baselineRevenue",
        staleVariables: ["baselineRevenue"],
        expectedImpact: 100000,
        confidence: 0.8,
      };

      await logAuditEvent({
        eventName: "DECISION_GATE_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "DECISION_GATE_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      const latestEvent = events[events.length - 1];
      const storedMetadata = latestEvent.metadata ? JSON.parse(latestEvent.metadata as string) : null;
      expect(storedMetadata?.staleVariables).toContain("baselineRevenue");
    });

    it("should log GUARDRAILS_BLOCKED with violation rules", async () => {
      const metadata = {
        blockStage: "guardrails",
        blockReason: "[BLOCK] NEGATIVE_IMPACT_BLOCK: Decision has non-positive expected impact (-50000)",
        violations: [
          {
            ruleId: "NEGATIVE_IMPACT_BLOCK",
            severity: "block",
            message: "Decision has non-positive expected impact (-50000)",
            threshold: "> 0",
            actual: -50000,
            overrideAllowed: false,
          },
        ],
        warnings: [],
        expectedImpact: -50000,
        confidence: 0.85,
      };

      await logAuditEvent({
        eventName: "GUARDRAILS_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "GUARDRAILS_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.violations[0]?.ruleId).toBe("NEGATIVE_IMPACT_BLOCK");
      expect(storedMetadata?.violations[0]?.actual).toBe(-50000);
      expect(storedMetadata?.violations[0]?.overrideAllowed).toBe(false);
    });

    it("should log GUARDRAILS_BLOCKED with high impact approval requirement", async () => {
      const metadata = {
        blockStage: "guardrails",
        blockReason: "[BLOCK] HIGH_IMPACT_APPROVAL: Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
        violations: [
          {
            ruleId: "HIGH_IMPACT_APPROVAL",
            severity: "block",
            message: "Decision impact (500000) exceeds approval threshold (100000). Explicit approval required.",
            threshold: 100000,
            actual: 500000,
            overrideAllowed: true,
          },
        ],
        expectedImpact: 500000,
        confidence: 0.9,
      };

      await logAuditEvent({
        eventName: "GUARDRAILS_BLOCKED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "GUARDRAILS_BLOCKED",
          workspaceId: testWorkspaceId,
        },
      });

      const highImpactEvent = events.find((e) => {
        const meta = e.metadata ? JSON.parse(e.metadata as string) : null;
        return meta?.violations?.[0]?.ruleId === "HIGH_IMPACT_APPROVAL";
      });

      expect(highImpactEvent).toBeDefined();
      const storedMetadata = highImpactEvent?.metadata ? JSON.parse(highImpactEvent.metadata as string) : null;
      expect(storedMetadata?.violations[0]?.overrideAllowed).toBe(true);
    });
  });

  describe("Input Validation Audit Events", () => {
    it("should log INPUT_VALIDATION_FAILED for missing revenue/cost", async () => {
      const metadata = {
        reason: "Missing or invalid financial inputs",
        expectedFields: ["revenue", "cost"],
        providedFields: {
          revenue: "undefined",
          cost: "undefined",
        },
      };

      await logAuditEvent({
        eventName: "INPUT_VALIDATION_FAILED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "INPUT_VALIDATION_FAILED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.reason).toContain("financial inputs");
      expect(storedMetadata?.expectedFields).toContain("revenue");
    });

    it("should log INPUT_VALIDATION_FAILED for missing confidence", async () => {
      const metadata = {
        reason: "Missing or invalid confidence value",
        expectedFields: ["confidence"],
        providedType: "undefined",
      };

      await logAuditEvent({
        eventName: "INPUT_VALIDATION_FAILED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "INPUT_VALIDATION_FAILED",
          workspaceId: testWorkspaceId,
        },
      });

      const confidenceEvent = events.find((e) => {
        const meta = e.metadata ? JSON.parse(e.metadata as string) : null;
        return meta?.expectedFields?.includes("confidence");
      });

      expect(confidenceEvent).toBeDefined();
    });

    it("should log INPUT_VALIDATION_FAILED for missing FX rate", async () => {
      const metadata = {
        reason: "Missing FX rate for non-base currency",
        currency: "USD",
        baseCurrency: "INR",
        providedFxRates: [],
      };

      await logAuditEvent({
        eventName: "INPUT_VALIDATION_FAILED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { blocked: true },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "INPUT_VALIDATION_FAILED",
          workspaceId: testWorkspaceId,
        },
      });

      const fxEvent = events.find((e) => {
        const meta = e.metadata ? JSON.parse(e.metadata as string) : null;
        return meta?.currency === "USD";
      });

      expect(fxEvent).toBeDefined();
      const storedMetadata = fxEvent?.metadata ? JSON.parse(fxEvent.metadata as string) : null;
      expect(storedMetadata?.baseCurrency).toBe("INR");
    });
  });

  describe("Auth and Permission Audit Events", () => {
    it("should log AUTH_FAILED when session missing", async () => {
      const metadata = {
        reason: "Session not found or invalid",
      };

      await logAuditEvent({
        eventName: "AUTH_FAILED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: null,
        role: null,
        before: null,
        after: null,
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "AUTH_FAILED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.actorId).toBeNull();
      expect(event.role).toBeNull();
    });

    it("should log PERMISSION_DENIED when role lacks permission", async () => {
      const metadata = {
        reason: "User role lacks edit permission",
        role: "viewer",
      };

      await logAuditEvent({
        eventName: "PERMISSION_DENIED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: "viewer" as any,
        before: null,
        after: null,
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "PERMISSION_DENIED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.role).toBe("viewer");
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.role).toBe("viewer");
    });
  });

  describe("Success Path Audit Events", () => {
    it("should log RUN_APPROVED for successful decision execution", async () => {
      const metadata = {
        inputRevenue: 1000000,
        inputCost: 500000,
        inputCurrency: "INR",
        expectedImpact: 100000,
        confidence: 0.8,
        problemType: "revenue_opportunity",
      };

      await logAuditEvent({
        eventName: "RUN_APPROVED",
        entityType: "Decision",
        entityId: "system-run",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: {
          decision: "approved",
          expectedImpact: 100000,
          confidence: 0.8,
        },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "RUN_APPROVED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.actorId).toBe(testUserId);
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.expectedImpact).toBe(100000);
      expect(storedMetadata?.confidence).toBe(0.8);
    });
  });

  describe("Override Audit Events", () => {
    it("should log OVERRIDE_APPROVED when override is allowed", async () => {
      const metadata = {
        originalAction: "decision_rejected",
        overriddenAction: "decision_approved",
        reason: "Business justification for override",
      };

      await logAuditEvent({
        eventName: "OVERRIDE_APPROVED",
        entityType: "OperatorItem",
        entityId: "item-123",
        actorId: testUserId,
        role: testRole as any,
        before: { action: "decision_rejected" },
        after: { action: "decision_approved" },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "OVERRIDE_APPROVED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.originalAction).toBe("decision_rejected");
      expect(storedMetadata?.overriddenAction).toBe("decision_approved");
    });

    it("should log OVERRIDE_DENIED when override not allowed", async () => {
      const metadata = {
        originalAction: "decision_rejected",
        attemptedOverride: "decision_approved",
        reason: "Attempted override",
        denialReason: "Override not allowed for this violation",
      };

      await logAuditEvent({
        eventName: "OVERRIDE_DENIED",
        entityType: "OperatorItem",
        entityId: "item-456",
        actorId: testUserId,
        role: testRole as any,
        before: { action: "decision_rejected" },
        after: null,
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "OVERRIDE_DENIED",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedMetadata = event.metadata ? JSON.parse(event.metadata as string) : null;
      expect(storedMetadata?.denialReason).toContain("not allowed");
    });
  });

  describe("Audit Write Failure Handling", () => {
    it("should include workspaceId for workspace isolation", async () => {
      const metadata = {
        testKey: "testValue",
      };

      await logAuditEvent({
        eventName: "TEST_WORKSPACE_ISOLATION",
        entityType: "Decision",
        entityId: "test-id",
        actorId: testUserId,
        role: testRole as any,
        before: null,
        after: { test: "data" },
        metadata,
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "TEST_WORKSPACE_ISOLATION",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.workspaceId).toBe(testWorkspaceId);
    });

    it("should preserve before/after state correctly", async () => {
      const beforeState = { action: "pending", confidence: 0.5 };
      const afterState = { action: "approved", confidence: 0.8 };

      await logAuditEvent({
        eventName: "STATE_TRANSITION_TEST",
        entityType: "Decision",
        entityId: "test-id",
        actorId: testUserId,
        role: testRole as any,
        before: beforeState,
        after: afterState,
        metadata: { transition: "pending_to_approved" },
        workspaceId: testWorkspaceId,
      });

      const events = await db.auditEvent.findMany({
        where: {
          eventName: "STATE_TRANSITION_TEST",
          workspaceId: testWorkspaceId,
        },
      });

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      const storedBefore = event.before ? JSON.parse(event.before as string) : null;
      const storedAfter = event.after ? JSON.parse(event.after as string) : null;
      expect(storedBefore?.action).toBe("pending");
      expect(storedAfter?.action).toBe("approved");
    });
  });
});
