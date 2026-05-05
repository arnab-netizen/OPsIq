import { describe, it, expect } from "vitest";
import { AuditOutputGenerator } from "../audit-output-generator";
import { v4 as uuidv4 } from "uuid";

describe("AuditOutputGenerator", () => {
  const generator = new AuditOutputGenerator();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("generateAuditOutput", () => {
    it("should generate complete audit output", () => {
      const inputs = {
        paths: ["path-1", "path-2"],
        diagnosticConfidence: 0.75,
      };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        2,
        0.75,
        3,
        50,
        100000,
        50000,
        120,
        3,
        ["data_sufficient", "contradiction_free", "capacity_available"],
        ["cash_runway_safe"],
        inputs
      );

      expect(audit).toBeDefined();
      expect(audit.decision_id).toBeDefined();
      expect(audit.inputs_snapshot_hash).toBeDefined();
      expect(audit.engine_version).toBe("7.2.0");
    });

    it("should set correct metrics in audit output", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        3,
        0.8,
        5,
        75,
        250000,
        100000,
        90,
        4,
        ["data_sufficient"],
        [],
        inputs
      );

      expect(audit.metrics.priority_score).toBe(75);
      expect(audit.metrics.expected_value).toBe(250000);
      expect(audit.metrics.downside_exposure).toBe(100000);
      expect(audit.metrics.payback_days).toBe(90);
      expect(audit.metrics.dimensions_won).toBe(4);
    });

    it("should set gates_passed and gates_failed correctly", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        2,
        0.7,
        3,
        50,
        100000,
        50000,
        120,
        2,
        ["data_sufficient", "contradiction_free"],
        ["capacity_available", "cash_runway_safe"],
        inputs
      );

      expect(audit.gates_passed).toHaveLength(2);
      expect(audit.gates_failed).toHaveLength(2);
    });

    it("should include assumptions", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      expect(audit.assumptions).toBeDefined();
      expect(audit.assumptions.length).toBeGreaterThan(0);
    });

    it("should generate idempotent decision_id for same inputs", () => {
      const inputs = { test: "idempotent" };

      const audit1 = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      const audit2 = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      expect(audit1.decision_id).toBe(audit2.decision_id);
    });

    it("should generate different decision_id for different inputs", () => {
      const inputs1 = { test: "input1" };
      const inputs2 = { test: "input2" };

      const audit1 = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs1
      );

      const audit2 = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs2
      );

      expect(audit1.decision_id).not.toBe(audit2.decision_id);
    });

    it("should set decision_made_at timestamp", () => {
      const inputs = { test: true };
      const beforeTime = new Date();

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      const afterTime = new Date();
      const auditTime = new Date(audit.decision_made_at);

      expect(auditTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(auditTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe("validateAuditOutput", () => {
    it("should validate correct audit output", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        ["data_sufficient"],
        [],
        inputs
      );

      expect(generator.validateAuditOutput(audit)).toBe(true);
    });

    it("should reject invalid decision_id format", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      audit.decision_id = "invalid-id";

      expect(generator.validateAuditOutput(audit)).toBe(false);
    });

    it("should reject invalid inputs_snapshot_hash", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      audit.inputs_snapshot_hash = "invalid-hash";

      expect(generator.validateAuditOutput(audit)).toBe(false);
    });

    it("should reject non-finite priority_score", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      audit.metrics.priority_score = NaN;

      expect(generator.validateAuditOutput(audit)).toBe(false);
    });

    it("should reject invalid dimensions_won", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      audit.metrics.dimensions_won = 5;

      expect(generator.validateAuditOutput(audit)).toBe(false);
    });

    it("should reject invalid timestamp", () => {
      const inputs = { test: true };

      const audit = generator.generateAuditOutput(
        engagementId,
        workspaceId,
        1,
        0.5,
        1,
        25,
        50000,
        25000,
        180,
        1,
        [],
        [],
        inputs
      );

      audit.decision_made_at = "invalid-timestamp";

      expect(generator.validateAuditOutput(audit)).toBe(false);
    });
  });
});
