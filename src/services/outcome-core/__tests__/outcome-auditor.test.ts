import { describe, it, expect } from "vitest";
import { OutcomeAuditor } from "../outcome-auditor";
import { FeedbackAction } from "@/domain/outcome/feedback";
import { ImpactDirection, MeasurementQuality } from "@/domain/outcome/impact";
import { v4 as uuidv4 } from "uuid";

describe("OutcomeAuditor", () => {
  const auditor = new OutcomeAuditor();
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();

  const baselineMetric = {
    name: "Revenue",
    baseline_value: 100,
    actual_value: 100,
    unit: "USD",
  };

  const actualOutcome = {
    name: "Revenue",
    baseline_value: 100,
    actual_value: 115,
    unit: "USD",
  };

  const baseInput = {
    action_id: actionId,
    decision_id: decisionId,
    workspace_id: workspaceId,
    baseline_metric: baselineMetric,
    actual_outcome: actualOutcome,
    variance: 15,
    variance_pct: 15,
    before_confidence: 60,
    after_confidence: 75,
    feedback_action: FeedbackAction.CONTINUE,
    measurement_quality: MeasurementQuality.HIGH,
  };

  describe("Idempotent Packet Creation", () => {
    it("should create packet with deterministic packet_id", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.packet_id).toBeTruthy();
      expect(packet!.packet_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("should produce same packet_id for identical inputs (idempotency)", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = auditor.createAuditPacket(baseInput);

      expect(packet1).not.toBeNull();
      expect(packet2).not.toBeNull();
      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });

    it("should produce different packet_id for different action_id", () => {
      const input1 = baseInput;
      const input2 = { ...baseInput, action_id: uuidv4() };

      const packet1 = auditor.createAuditPacket(input1);
      const packet2 = auditor.createAuditPacket(input2);

      expect(packet1!.packet_id).not.toBe(packet2!.packet_id);
    });

    it("should produce different packet_id for different variance", () => {
      const input1 = baseInput;
      const input2 = { ...baseInput, variance: 20, variance_pct: 20 };

      const packet1 = auditor.createAuditPacket(input1);
      const packet2 = auditor.createAuditPacket(input2);

      expect(packet1!.packet_id).not.toBe(packet2!.packet_id);
    });
  });

  describe("Immutable Records", () => {
    it("should mark packet as auditable", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.auditable).toBe(true);
    });

    it("should verify immutability when fields unchanged", () => {
      const packet1 = auditor.createAuditPacket(baseInput);

      expect(packet1).not.toBeNull();
      expect(auditor.verifyImmutability(packet1!, packet1!)).toBe(true);
    });

    it("should detect immutability violation on action_id change", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = { ...packet1!, action_id: uuidv4() };

      expect(packet1).not.toBeNull();
      expect(auditor.verifyImmutability(packet1!, packet2)).toBe(false);
    });

    it("should detect immutability violation on variance change", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = { ...packet1!, variance: 20, variance_pct: 20 };

      expect(auditor.verifyImmutability(packet1!, packet2)).toBe(false);
    });

    it("should detect immutability violation on auditable flag change", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = { ...packet1!, auditable: false as any };

      expect(auditor.verifyImmutability(packet1!, packet2)).toBe(false);
    });

    it("should detect immutability violation on packet_id change", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = { ...packet1!, packet_id: uuidv4().substring(0, 36) };

      expect(auditor.verifyImmutability(packet1!, packet2)).toBe(false);
    });
  });

  describe("Workspace Isolation", () => {
    it("should include workspace_id in packet", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.workspace_id).toBe(workspaceId);
    });

    it("should produce different packet_id for different workspace", () => {
      const input1 = baseInput;
      const input2 = { ...baseInput, workspace_id: uuidv4() };

      const packet1 = auditor.createAuditPacket(input1);
      const packet2 = auditor.createAuditPacket(input2);

      expect(packet1!.packet_id).not.toBe(packet2!.packet_id);
    });

    it("should scope packets to workspace in summary", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      // Workspace isolation is inherent in packet structure
      expect(packet!.workspace_id).toBeTruthy();
    });
  });

  describe("Input Validation (Fail-Closed)", () => {
    it("should reject null input", () => {
      const packet = auditor.createAuditPacket(null as any);

      expect(packet).toBeNull();
    });

    it("should reject missing action_id", () => {
      const input = { ...baseInput, action_id: "" };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing decision_id", () => {
      const input = { ...baseInput, decision_id: "" };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing workspace_id", () => {
      const input = { ...baseInput, workspace_id: "" };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing baseline_metric", () => {
      const input = { ...baseInput, baseline_metric: null as any };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing actual_outcome", () => {
      const input = { ...baseInput, actual_outcome: null as any };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing feedback_action", () => {
      const input = { ...baseInput, feedback_action: null as any };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject missing measurement_quality", () => {
      const input = { ...baseInput, measurement_quality: "" };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject invalid before_confidence (<0)", () => {
      const input = { ...baseInput, before_confidence: -5 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject invalid before_confidence (>100)", () => {
      const input = { ...baseInput, before_confidence: 105 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject invalid after_confidence (<0)", () => {
      const input = { ...baseInput, after_confidence: -5 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });

    it("should reject invalid after_confidence (>100)", () => {
      const input = { ...baseInput, after_confidence: 105 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).toBeNull();
    });
  });

  describe("Packet Properties", () => {
    it("should preserve all input fields in packet", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.action_id).toBe(baseInput.action_id);
      expect(packet!.decision_id).toBe(baseInput.decision_id);
      expect(packet!.workspace_id).toBe(baseInput.workspace_id);
      expect(packet!.baseline_metric).toEqual(baseInput.baseline_metric);
      expect(packet!.actual_outcome).toEqual(baseInput.actual_outcome);
      expect(packet!.variance).toBe(baseInput.variance);
      expect(packet!.variance_pct).toBe(baseInput.variance_pct);
      expect(packet!.confidence_before).toBe(baseInput.before_confidence);
      expect(packet!.confidence_after).toBe(baseInput.after_confidence);
      expect(packet!.feedback_action).toBe(baseInput.feedback_action);
      expect(packet!.measurement_quality).toBe(baseInput.measurement_quality);
    });

    it("should include ISO outcome_date", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.outcome_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should map confidence fields correctly", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(packet!.confidence_before).toBe(baseInput.before_confidence);
      expect(packet!.confidence_after).toBe(baseInput.after_confidence);
    });
  });

  describe("Helper Methods", () => {
    it("isAuditable should return true for audit packets", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      expect(auditor.isAuditable(packet!)).toBe(true);
    });

    it("getPacketSummary should return readable summary", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      const summary = auditor.getPacketSummary(packet!);
      expect(summary).toContain("variance");
      expect(summary).toContain("confidence");
      expect(summary).toContain("CONTINUE");
    });

    it("getPacketSummary should format positive variance", () => {
      const packet = auditor.createAuditPacket(baseInput);

      expect(packet).not.toBeNull();
      const summary = auditor.getPacketSummary(packet!);
      expect(summary).toContain("+15.0%");
    });

    it("getPacketSummary should format negative variance", () => {
      const input = { ...baseInput, variance: -10, variance_pct: -10 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      const summary = auditor.getPacketSummary(packet!);
      expect(summary).toContain("-10.0%");
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce identical packet_id for identical inputs", () => {
      const packet1 = auditor.createAuditPacket(baseInput);
      const packet2 = auditor.createAuditPacket(baseInput);

      expect(packet1).not.toBeNull();
      expect(packet2).not.toBeNull();
      expect(packet1!.packet_id).toBe(packet2!.packet_id); // Deterministic ID
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero variance", () => {
      const input = { ...baseInput, variance: 0, variance_pct: 0 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.variance).toBe(0);
    });

    it("should handle negative variance", () => {
      const input = { ...baseInput, variance: -20, variance_pct: -20 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.variance).toBe(-20);
    });

    it("should handle extreme variance", () => {
      const input = { ...baseInput, variance: 500, variance_pct: 500 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.variance).toBe(500);
    });

    it("should handle 0% confidence", () => {
      const input = { ...baseInput, before_confidence: 0, after_confidence: 0 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.confidence_before).toBe(0);
    });

    it("should handle 100% confidence", () => {
      const input = { ...baseInput, before_confidence: 100, after_confidence: 100 };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.confidence_before).toBe(100);
    });

    it("should handle REPLAN feedback action", () => {
      const input = { ...baseInput, feedback_action: FeedbackAction.REPLAN };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.feedback_action).toBe(FeedbackAction.REPLAN);
    });

    it("should handle HALT feedback action", () => {
      const input = { ...baseInput, feedback_action: FeedbackAction.HALT };
      const packet = auditor.createAuditPacket(input);

      expect(packet).not.toBeNull();
      expect(packet!.feedback_action).toBe(FeedbackAction.HALT);
    });
  });

  describe("Replay Idempotency", () => {
    it("should create same packet_id on replay", () => {
      // Initial creation
      const packet1 = auditor.createAuditPacket(baseInput);

      // Replay with same input
      const packet2 = auditor.createAuditPacket(baseInput);

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });

    it("should handle multiple replays", () => {
      const packets = Array.from({ length: 5 }, () =>
        auditor.createAuditPacket(baseInput)
      );

      // All should have same packet_id
      const firstId = packets[0]!.packet_id;
      packets.forEach((packet) => {
        expect(packet!.packet_id).toBe(firstId);
      });
    });
  });
});
