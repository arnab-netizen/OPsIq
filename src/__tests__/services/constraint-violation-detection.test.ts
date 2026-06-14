/**
 * M10 Constraint Handling: Constraint Violation Detection Tests
 *
 * Tests that constraints are properly identified and violations are detected:
 * - Constraints identified from evidence patterns
 * - Constraint violations block specific actions
 * - Release paths computed for constraint resolution
 * - Quick wins (non-blocked actions) identified
 *
 * Execution.md M10 requirement (section 8):
 * "constraints are captured, derived, or explicitly marked unavailable"
 * "recommendations check constraints"
 * "constraint violations are surfaced"
 */

import { describe, it, expect } from "vitest";
import { identifyConstraints } from "@/services/consulting-engine/constraint-engine";
import { ConfidenceLevel, ConstraintType, ConstraintSeverity } from "@/domain/consulting-engine/types";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { randomUUID } from "crypto";

describe("M10: Constraint Violation Detection", () => {
  describe("identifyConstraints", () => {
    it("should identify RESOURCE constraint from operational efficiency evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Production turnaround time is 4 weeks, need to halve it",
          confidence: ConfidenceLevel.HIGH,
          source: "Operations review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {
        industryRequiresCapital: true,
      });

      expect(result.identifiedConstraints.length).toBeGreaterThan(0);
      const resourceConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.RESOURCE
      );
      expect(resourceConstraint).toBeDefined();
      expect(resourceConstraint?.description).toContain("capacity");
    });

    it("should identify SKILL constraint from quality evidence without process", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints increased 35% this quarter",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer feedback",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      expect(result.identifiedConstraints.length).toBeGreaterThan(0);
      const skillConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.SKILL
      );
      expect(skillConstraint).toBeDefined();
      expect(skillConstraint?.description).toContain("quality");
    });

    it("should NOT identify SKILL constraint when quality process exists", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints increased 35% this quarter",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer feedback",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Quality assurance procedures documented and followed",
          confidence: ConfidenceLevel.HIGH,
          source: "Process audit",
          timestamp: new Date(),
          isCritical: false,
        },
      ];

      const result = identifyConstraints(evidence, {});

      const skillConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.SKILL
      );
      expect(skillConstraint).toBeUndefined();
    });

    it("should identify ORGANIZATIONAL constraint from low repeat customers", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Only 20% of customers make repeat purchases",
          confidence: ConfidenceLevel.HIGH,
          source: "Sales data",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      const orgConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.ORGANIZATIONAL
      );
      expect(orgConstraint).toBeDefined();
      expect(orgConstraint?.blocksActions).toContain("retention_focus");
    });

    it("should identify PROCESS constraint from manual process evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "All invoicing and order processing still done manually in spreadsheets",
          confidence: ConfidenceLevel.HIGH,
          source: "Process review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      const processConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.PROCESS
      );
      expect(processConstraint).toBeDefined();
      expect(processConstraint?.blocksActions).toContain("scale");
    });
  });

  describe("Constraint blocking and violation detection", () => {
    it("should detect action blocked by constraint via blocksActions", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "All processes manual, spreadsheet-based",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});
      const processConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.PROCESS
      );

      // "scale" action is in blockedActions
      expect(processConstraint?.blocksActions).toContain("scale");
      // "automate" action is in blockedActions
      expect(processConstraint?.blocksActions).toContain("automate");
    });

    it("should compute release path for constraints", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Production turnaround time critical",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {
        industryRequiresCapital: true,
      });

      // Should have a release path (even if just the constraints themselves)
      expect(result.releasePath).toBeDefined();
      expect(Array.isArray(result.releasePath)).toBe(true);
    });

    it("should identify quick wins (non-blocked actions)", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Manual processes throughout",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      // Quick wins should be actions that don't require constraint release
      expect(result.quickWins).toBeDefined();
      expect(Array.isArray(result.quickWins)).toBe(true);
    });
  });

  describe("Constraint severity and impact", () => {
    it("should assign HIGH severity to resource constraints", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Critical turnaround time issue",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {
        industryRequiresCapital: true,
      });

      const resourceConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.RESOURCE
      );
      expect(resourceConstraint?.severity).toBe(ConstraintSeverity.HIGH);
    });

    it("should assign MEDIUM severity to process constraints", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Manual processes in operations",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      const processConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.PROCESS
      );
      expect(processConstraint?.severity).toBe(ConstraintSeverity.MEDIUM);
    });
  });

  describe("Constraint release mechanisms", () => {
    it("should specify releasableVia paths for each constraint", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Manual spreadsheet processes",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      result.identifiedConstraints.forEach((constraint) => {
        expect(constraint.releasableVia).toBeDefined();
        expect(Array.isArray(constraint.releasableVia)).toBe(true);
        expect(constraint.releasableVia.length).toBeGreaterThan(0);
      });
    });

    it("should provide specific release mechanisms for process constraint", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "All processes manual",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      const processConstraint = result.identifiedConstraints.find(
        (c) => c.type === ConstraintType.PROCESS
      );
      expect(processConstraint?.releasableVia).toContain("process_redesign");
      expect(processConstraint?.releasableVia).toContain("system_implementation");
    });
  });

  describe("Multiple constraints scenario", () => {
    it("should identify multiple constraints from combined evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "All invoicing manual",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints high",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      // Should identify both process and skill constraints
      expect(result.identifiedConstraints.length).toBeGreaterThanOrEqual(2);
    });

    it("should compute active blocks for multiple constraints", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Manual processes everywhere",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = identifyConstraints(evidence, {});

      expect(result.activeBlocks).toBeDefined();
      // activeBlocks is a Map that tracks which constraints block which interventions
      expect(result.activeBlocks instanceof Map).toBe(true);
    });
  });
});
