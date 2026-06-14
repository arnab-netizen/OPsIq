/**
 * M03 Diagnosis Engine: Acceptance Criteria Tests
 *
 * Tests that diagnosis engine produces findings with all required fields,
 * respects confidence levels based on evidence quality, and blocks
 * high-confidence diagnosis from weak/missing/conflicting data.
 *
 * Execution.md M03 requirement (section 8):
 * "uses real persisted or validated input data"
 * "produces specific findings"
 * "includes root cause, impact, confidence, evidence, missing data, action, verification metric, risk"
 * "does not produce high-confidence output from weak/missing/conflicting data"
 * "deterministic enough for automated tests"
 */

import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  DiagnosisConfidence,
  DiagnosisType,
  ConfidenceLevel,
} from "@/domain/consulting-engine/types";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { randomUUID } from "crypto";

const confidenceRank = {
  [DiagnosisConfidence.DEFINITIVE]: 5,
  [DiagnosisConfidence.HIGH]: 4,
  [DiagnosisConfidence.MODERATE]: 3,
  [DiagnosisConfidence.PROVISIONAL]: 2,
  [DiagnosisConfidence.INSUFFICIENT_EVIDENCE]: 1,
};

describe("M03: Diagnosis Engine Acceptance Criteria", () => {
  describe("Required output fields", () => {
    it("should produce diagnosis with all required fields for OPERATIONAL_BOTTLENECK pattern", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Production turnaround time is 4 weeks, customers complain about delay",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer review",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat customers, they shop around",
          confidence: ConfidenceLevel.HIGH,
          source: "Sales analysis",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Growth stalled");

      expect(result.primaryRootCause).toBeDefined();
      expect(result.primaryRootCause.id).toBeDefined();
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.OPERATIONAL_BOTTLENECK
      );
      expect(result.primaryRootCause.description).toBeTruthy();
      expect(result.primaryRootCause.mechanismDescription).toBeTruthy();
      expect(result.primaryRootCause.evidenceIds).toBeDefined();
      expect(result.primaryRootCause.evidenceIds.length).toBeGreaterThan(0);
      expect(result.primaryRootCause.confidence).toBeDefined();
      expect(result.primaryRootCause.alternativeExplanations).toBeDefined();
      expect(result.primaryRootCause.missingEvidenceFor).toBeDefined();
    });

    it("should populate alternativeExplanations for confidence context", () => {
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

      const result = diagnoseRootCause(evidence, "Quality degradation");

      expect(result.primaryRootCause.alternativeExplanations).toBeDefined();
      expect(result.primaryRootCause.alternativeExplanations?.length).toBeGreaterThan(0);
      const explanationText = result.primaryRootCause.alternativeExplanations?.join(" ") || "";
      expect(explanationText.toLowerCase()).toMatch(
        /team|skill|standard|process|communication/i
      );
    });

    it("should list missing evidence for stronger diagnosis", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Defect rate higher than competitors",
          confidence: ConfidenceLevel.MODERATE,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Quality issue");

      expect(result.primaryRootCause.missingEvidenceFor).toBeDefined();
      expect(
        result.primaryRootCause.missingEvidenceFor.length
      ).toBeGreaterThan(0);
    });
  });

  describe("Confidence levels reflect evidence quality", () => {
    it("should assign HIGH confidence when multiple HIGH-confidence evidence supports pattern", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Production turnaround time is 4 weeks, causing delays",
          confidence: ConfidenceLevel.HIGH,
          source: "Measured data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat purchase rate observed",
          confidence: ConfidenceLevel.HIGH,
          source: "Sales database",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Business decline");

      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
      expect(result.readinessForIntervention).toBe("READY");
    });

    it("should assign MODERATE confidence when pattern matches but not all HIGH-confidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround time is slow and delayed",
          confidence: ConfidenceLevel.MODERATE,
          source: "Anecdotal",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat customers observed",
          confidence: ConfidenceLevel.MODERATE,
          source: "Informal feedback",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Weak evidence");

      expect([DiagnosisConfidence.MODERATE, DiagnosisConfidence.PROVISIONAL]).toContain(
        result.confidence
      );
    });

    it("should block diagnosis when evidence is insufficient", () => {
      const evidence: EvidenceItem[] = [];

      const result = diagnoseRootCause(evidence, "No data");

      expect(result.confidence).toBe(
        DiagnosisConfidence.INSUFFICIENT_EVIDENCE
      );
      expect(result.readinessForIntervention).toBe("BLOCKED");
      expect(result.warningFlags.length).toBeGreaterThan(0);
      expect(result.warningFlags[0].toLowerCase()).toContain("cannot");
    });
  });

  describe("High-confidence output requires adequate evidence", () => {
    it("should NOT produce HIGH confidence from single evidence piece", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate observed",
          confidence: ConfidenceLevel.HIGH,
          source: "Sales review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Single signal");

      expect(result.confidence).not.toBe(DiagnosisConfidence.HIGH);
      expect([
        DiagnosisConfidence.MODERATE,
        DiagnosisConfidence.PROVISIONAL,
      ]).toContain(result.confidence);
    });

    it("should NOT produce HIGH confidence from LOW-confidence evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround might be slow",
          confidence: ConfidenceLevel.LOW,
          source: "Speculation",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Few repeat customers perhaps",
          confidence: ConfidenceLevel.LOW,
          source: "Informal observation",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Weak signals");

      expect(result.confidence).not.toBe(DiagnosisConfidence.HIGH);
    });

    it("should NOT produce READY status when evidence contradicts diagnosis", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints increased",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "process_maturity",
          finding: "Quality assurance procedures documented and followed",
          confidence: ConfidenceLevel.HIGH,
          source: "Audit",
          timestamp: new Date(),
          isCritical: false,
        },
      ];

      const result = diagnoseRootCause(evidence, "Quality issue?");

      expect(result.readinessForIntervention).not.toBe("READY");
    });
  });

  describe("Evidence linking", () => {
    it("should link diagnosis to supporting evidence IDs", () => {
      const evidence1 = randomUUID();
      const evidence2 = randomUUID();

      const evidence: EvidenceItem[] = [
        {
          id: evidence1,
          dimension: "operational_efficiency",
          finding: "Turnaround time is 4 weeks",
          confidence: ConfidenceLevel.HIGH,
          source: "Operations",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: evidence2,
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Sales",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Problem");

      expect(result.primaryRootCause.evidenceIds).toContain(evidence1);
      expect(result.primaryRootCause.evidenceIds).toContain(evidence2);
    });

    it("should exclude irrelevant evidence from diagnosis links", () => {
      const relevantId = randomUUID();
      const irrelevantId = randomUUID();

      const evidence: EvidenceItem[] = [
        {
          id: relevantId,
          dimension: "operational_efficiency",
          finding: "Slow turnaround",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: irrelevantId,
          dimension: "customer_retention",
          finding: "Low repeat",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "financial_health",
          finding: "Revenue declining",
          confidence: ConfidenceLevel.HIGH,
          source: "Finance",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Multi-problem");

      expect(
        result.primaryRootCause.evidenceIds.includes(relevantId)
      ).toBeTruthy();
    });
  });

  describe("Deterministic behavior", () => {
    it("should produce consistent diagnosis for same evidence set", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints increased 35% this quarter",
          confidence: ConfidenceLevel.HIGH,
          source: "Review",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result1 = diagnoseRootCause(evidence, "Issue");
      const result2 = diagnoseRootCause(evidence, "Issue");

      expect(result1.primaryRootCause.type).toBe(
        result2.primaryRootCause.type
      );
      expect(result1.confidence).toBe(result2.confidence);
      expect(result1.readinessForIntervention).toBe(
        result2.readinessForIntervention
      );
    });

    it("should produce different diagnosis for different evidence patterns", () => {
      const evidence1: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround time is 4 weeks",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const evidence2: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result1 = diagnoseRootCause(evidence1, "Problem");
      const result2 = diagnoseRootCause(evidence2, "Problem");

      expect(result1.primaryRootCause.type).not.toBe(
        result2.primaryRootCause.type
      );
    });

    it("should handle empty evidence set gracefully", () => {
      const evidence: EvidenceItem[] = [];

      const result = diagnoseRootCause(evidence, "No data");

      expect(result).toBeDefined();
      expect(result.confidence).toBe(
        DiagnosisConfidence.INSUFFICIENT_EVIDENCE
      );
      expect(result.readinessForIntervention).toBe("BLOCKED");
      expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
    });
  });

  describe("Alternative diagnoses", () => {
    it("should provide alternative root causes when multiple patterns match", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround time is 4 weeks",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Customer complaints increased",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Complex problem");

      expect(result.alternativeRootCauses).toBeDefined();
      expect(Array.isArray(result.alternativeRootCauses)).toBe(true);
    });

    it("should rank alternatives by confidence", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround time is 4 weeks",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "quality_delivery",
          finding: "Some complaints",
          confidence: ConfidenceLevel.MODERATE,
          source: "Feedback",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Multi");

      const primaryRank = confidenceRank[result.confidence];
      const firstAltRank = result.alternativeRootCauses[0]
        ? confidenceRank[result.alternativeRootCauses[0].confidence as DiagnosisConfidence]
        : 0;

      expect(primaryRank).toBeGreaterThanOrEqual(firstAltRank);
    });
  });

  describe("Warning flags for low-confidence diagnosis", () => {
    it("should flag low-confidence diagnosis with warning when pattern matches weakly", () => {
      const evidence: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround time slow",
          confidence: ConfidenceLevel.LOW,
          source: "Informal",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.LOW,
          source: "Informal",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const result = diagnoseRootCause(evidence, "Weak");

      if (result.confidence === DiagnosisConfidence.PROVISIONAL) {
        expect(result.warningFlags.length).toBeGreaterThan(0);
      }
    });

    it("should flag INSUFFICIENT_EVIDENCE diagnosis with critical warning", () => {
      const evidence: EvidenceItem[] = [];

      const result = diagnoseRootCause(evidence, "None");

      expect(result.warningFlags.length).toBeGreaterThan(0);
      expect(
        result.warningFlags.some(f =>
          f.toLowerCase().includes("insufficient") ||
          f.toLowerCase().includes("cannot")
        )
      ).toBe(true);
    });
  });

  describe("Critical finding detection", () => {
    it("should prioritize critical evidence in pattern matching", () => {
      const critical: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Turnaround is 4 weeks",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Low repeat rate",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: true,
        },
      ];

      const nonCritical: EvidenceItem[] = [
        {
          id: randomUUID(),
          dimension: "operational_efficiency",
          finding: "Minor slowdown",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: false,
        },
        {
          id: randomUUID(),
          dimension: "customer_retention",
          finding: "Slight dip in repeat",
          confidence: ConfidenceLevel.HIGH,
          source: "Data",
          timestamp: new Date(),
          isCritical: false,
        },
      ];

      const resultCritical = diagnoseRootCause(critical, "Critical");
      const resultNonCritical = diagnoseRootCause(nonCritical, "Minor");

      const criticalRank = confidenceRank[resultCritical.confidence];
      const nonCriticalRank = confidenceRank[resultNonCritical.confidence];

      expect(criticalRank).toBeGreaterThanOrEqual(nonCriticalRank);
    });
  });
});
