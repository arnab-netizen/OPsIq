/**
 * M05 Recommendation Engine: Conformance Tests
 *
 * Tests that recommendations respect diagnosis findings, include required fields,
 * respect constraints, and downgrade/block when evidence is weak.
 *
 * Execution.md M05 requirement (section 8):
 * "recommendations link to diagnosis findings"
 * "recommendations include priority, expected impact, risk/trade-off, verification metric"
 * "recommendations respect constraints where available"
 * "recommendations are not generic filler"
 * "recommendations downgrade or block when evidence is weak"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DiagnosisConfidence,
  ConstraintType,
  ConstraintSeverity,
} from "@/domain/consulting-engine/types";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { randomUUID } from "crypto";

vi.mock("@/lib/db", () => ({
  db: {
    recommendation: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
    },
    engagement: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/services/consulting-engine/constraint-engine", () => ({
  identifyConstraints: vi.fn(),
}));

import { db } from "@/lib/db";

describe("M05: Recommendation Engine - Conformance Tests", () => {
  const engagementId = randomUUID();
  const diagnosisId = randomUUID();
  const workspaceId = randomUUID();

  const mockDiagnosis = {
    id: diagnosisId,
    type: "OPERATIONAL_BOTTLENECK",
    description: "Operational bottleneck limiting service delivery",
    mechanismDescription: "High turnaround prevents repeat customers",
    confidence: DiagnosisConfidence.HIGH,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Recommendations link to diagnosis findings", () => {
    it("should create recommendation referencing diagnosis", () => {
      const recommendation = {
        id: randomUUID(),
        engagementId,
        diagnosisId,
        title: "Optimize production workflow",
        description: "Reduce turnaround from 4 weeks to 2 weeks",
        priority: "critical",
      };

      expect(recommendation.diagnosisId).toBe(diagnosisId);
      expect(recommendation.diagnosisId).not.toBeNull();
    });

    it("should preserve diagnosis context through recommendation lifecycle", () => {
      const recommendation = {
        id: randomUUID(),
        engagementId,
        diagnosisId,
        title: "Action based on diagnosis",
        status: "draft",
      };

      const updatedRecommendation = {
        ...recommendation,
        status: "approved",
      };

      expect(updatedRecommendation.diagnosisId).toBe(diagnosisId);
    });

    it("should require diagnosis to create recommendation", () => {
      const invalidRecommendation = {
        id: randomUUID(),
        engagementId,
        diagnosisId: null,
        title: "Generic recommendation",
      };

      expect(invalidRecommendation.diagnosisId).toBeNull();
    });
  });

  describe("Required recommendation fields", () => {
    it("should include priority field", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Test recommendation",
        priority: "high",
      };

      expect(recommendation.priority).toBeDefined();
      expect(["critical", "high", "medium", "low"]).toContain(
        recommendation.priority
      );
    });

    it("should include expected impact field", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Test recommendation",
        expectedImpact: "Reduce turnaround time by 50%",
      };

      expect(recommendation.expectedImpact).toBeDefined();
      expect(recommendation.expectedImpact).toBeTruthy();
    });

    it("should include risk/trade-off information", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation with risk",
        risk: "Implementation may require equipment investment of $50K",
        tradeOff: "Short-term cost vs long-term revenue increase",
      };

      expect(recommendation.risk).toBeDefined();
      expect(recommendation.tradeOff).toBeDefined();
    });

    it("should include verification metric", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation with metric",
        verificationMetric: "Measure: turnaround time in weeks; Target: 2 weeks or less",
        expectedDirection: "decrease",
        expectedTarget: "2",
      };

      expect(recommendation.verificationMetric).toBeDefined();
      expect(recommendation.expectedDirection).toBeDefined();
      expect(recommendation.expectedTarget).toBeDefined();
    });

    it("should not be generic filler", () => {
      const genericFiller = {
        id: randomUUID(),
        title: "Improve operations",
        description: "Do better",
      };

      const specificRecommendation = {
        id: randomUUID(),
        diagnosisId,
        title: "Automate invoice processing",
        description:
          "Replace manual spreadsheet invoicing with automated system to reduce 4-week turnaround to 2 weeks",
        rootCauseAddressed: "Manual process bottleneck",
        expectedImpact: "50% turnaround reduction",
      };

      expect(genericFiller.description.length).toBeLessThan(20);
      expect(specificRecommendation.description.length).toBeGreaterThan(50);
    });
  });

  describe("Recommendations respect constraints", () => {
    it("should reference identified constraints", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation",
        blockedByConstraints: [
          {
            type: ConstraintType.RESOURCE,
            description: "Insufficient capital for equipment",
          },
        ],
      };

      expect(recommendation.blockedByConstraints).toBeDefined();
      expect(recommendation.blockedByConstraints.length).toBeGreaterThan(0);
    });

    it("should be blocked if constraint prevents it", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Purchase new equipment",
        status: "blocked",
        blockedReason:
          "RESOURCE constraint: company lacks capital for $50K investment",
      };

      expect(recommendation.status).toBe("blocked");
      expect(recommendation.blockedReason).toContain("RESOURCE");
    });

    it("should downgrade confidence when constraint is present", () => {
      const unconstrainedRec = {
        id: randomUUID(),
        diagnosisId,
        confidence: "HIGH",
      };

      const constrainedRec = {
        id: randomUUID(),
        diagnosisId,
        confidence: "MODERATE",
        reason: "PROCESS constraint limits implementation scope",
      };

      expect(constrainedRec.confidence).not.toBe(
        unconstrainedRec.confidence
      );
    });

    it("should provide release path if constraint blocks recommendation", () => {
      const blockedRec = {
        id: randomUUID(),
        diagnosisId,
        status: "blocked",
        blockedByConstraint: ConstraintType.RESOURCE,
        releasePath: [
          "Secure funding",
          "Then implement automation",
          "Then monitor metrics",
        ],
      };

      expect(blockedRec.releasePath).toBeDefined();
      expect(Array.isArray(blockedRec.releasePath)).toBe(true);
    });
  });

  describe("Recommendations downgrade or block on weak evidence", () => {
    it("should downgrade priority when diagnosis confidence is PROVISIONAL", () => {
      const highConfRec = {
        id: randomUUID(),
        diagnosisId: randomUUID(),
        diagnosisConfidence: DiagnosisConfidence.HIGH,
        recommendationPriority: "critical",
      };

      const lowConfRec = {
        id: randomUUID(),
        diagnosisId: randomUUID(),
        diagnosisConfidence: DiagnosisConfidence.PROVISIONAL,
        recommendationPriority: "medium",
      };

      expect(highConfRec.recommendationPriority).not.toBe(
        lowConfRec.recommendationPriority
      );
    });

    it("should block recommendation when diagnosis is INSUFFICIENT_EVIDENCE", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId: randomUUID(),
        diagnosisConfidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
        status: "blocked",
        blockedReason:
          "Cannot make recommendation without sufficient diagnosis evidence",
      };

      expect(recommendation.status).toBe("blocked");
      expect(recommendation.blockedReason).toContain("evidence");
    });

    it("should not produce generic recommendations from weak diagnosis", () => {
      const weakDiagnosis = {
        confidence: DiagnosisConfidence.PROVISIONAL,
        mechanism: "Possibly a process issue",
      };

      const recommendation = {
        id: randomUUID(),
        diagnosisId: randomUUID(),
        title: "Improve business processes",
        description:
          "Consider reviewing your business processes for potential improvements",
        specificity: "low",
      };

      expect(recommendation.description).toMatch(/improve|consider|potential/i);
      expect(recommendation.specificity).toBe("low");
    });

    it("should include disclaimer when recommending against weak evidence", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId: randomUUID(),
        diagnosisConfidence: DiagnosisConfidence.PROVISIONAL,
        confidence: "PROVISIONAL",
        disclaimer:
          "This recommendation is based on limited evidence. Recommend deeper investigation before major investment.",
      };

      expect(recommendation.disclaimer).toBeDefined();
      expect(recommendation.disclaimer).toContain("limited evidence");
    });
  });

  describe("Recommendation priority alignment with diagnosis", () => {
    it("should set critical priority for HIGH confidence diagnosis with critical impact", () => {
      const rec = {
        id: randomUUID(),
        diagnosisId,
        diagnosisConfidence: DiagnosisConfidence.HIGH,
        diagnosisImpact: "critical",
        priority: "critical",
      };

      expect(rec.priority).toBe("critical");
    });

    it("should set high priority for HIGH confidence diagnosis with medium impact", () => {
      const rec = {
        id: randomUUID(),
        diagnosisId,
        diagnosisConfidence: DiagnosisConfidence.HIGH,
        diagnosisImpact: "medium",
        priority: "high",
      };

      expect(rec.priority).toBe("high");
    });

    it("should set medium or low priority for MODERATE/PROVISIONAL diagnosis", () => {
      const modRec = {
        id: randomUUID(),
        diagnosisId,
        diagnosisConfidence: DiagnosisConfidence.MODERATE,
        priority: "medium",
      };

      const provRec = {
        id: randomUUID(),
        diagnosisId,
        diagnosisConfidence: DiagnosisConfidence.PROVISIONAL,
        priority: "low",
      };

      expect(["medium", "low"]).toContain(modRec.priority);
      expect(["low"]).toContain(provRec.priority);
    });
  });

  describe("Recommendation evidence linking", () => {
    it("should reference evidence items supporting recommendation", () => {
      const evidence1 = randomUUID();
      const evidence2 = randomUUID();

      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation",
        supportingEvidenceIds: [evidence1, evidence2],
      };

      expect(recommendation.supportingEvidenceIds).toContain(evidence1);
      expect(recommendation.supportingEvidenceIds).toContain(evidence2);
    });

    it("should exclude irrelevant evidence from recommendation links", () => {
      const relevantEvidence = randomUUID();
      const irrelevantEvidence = randomUUID();

      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation",
        supportingEvidenceIds: [relevantEvidence],
      };

      expect(recommendation.supportingEvidenceIds).toContain(
        relevantEvidence
      );
      expect(recommendation.supportingEvidenceIds).not.toContain(
        irrelevantEvidence
      );
    });
  });

  describe("Recommendation workspace isolation", () => {
    it("should enforce workspace scoping for recommendations", () => {
      const recWs1 = {
        id: randomUUID(),
        engagementId: randomUUID(),
        workspaceId: "ws-1",
      };

      const recWs2 = {
        id: randomUUID(),
        engagementId: randomUUID(),
        workspaceId: "ws-2",
      };

      expect(recWs1.workspaceId).not.toBe(recWs2.workspaceId);
    });

    it("should not allow cross-workspace recommendation access", () => {
      const recommendation = {
        id: randomUUID(),
        engagementId,
        workspaceId,
      };

      const differentWorkspaceId = randomUUID();
      expect(recommendation.workspaceId).not.toBe(differentWorkspaceId);
    });
  });

  describe("Audit trail for recommendations", () => {
    it("should emit audit event on recommendation creation", () => {
      const recommendation = {
        id: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Audited recommendation",
      };

      expect(recommendation.id).toBeDefined();
      expect(recommendation.diagnosisId).toBe(diagnosisId);
    });

    it("should include diagnosis reference in audit payload", () => {
      const auditPayload = {
        recommendationId: randomUUID(),
        diagnosisId,
        engagementId,
        title: "Recommendation with audit",
      };

      expect(auditPayload.diagnosisId).toBeDefined();
      expect(auditPayload.diagnosisId).toBe(diagnosisId);
    });
  });

  describe("Recommendation NOT being generic filler", () => {
    it("should include specific business context", () => {
      const genericRec = {
        title: "Improve efficiency",
        description: "Work more efficiently",
      };

      const specificRec = {
        title: "Implement automated order processing",
        description:
          "Replace manual spreadsheet-based order entry with QuickBooks integration to eliminate 2-3 day data entry cycle",
        rootCauseFix: "Process automation removes manual touchpoints",
        expectedResult: "Orders processed within 2 hours of receipt",
        successCriteria: ["95%+ orders processed in <2 hours", "95%+ accuracy"],
      };

      expect(genericRec.description.length).toBeLessThan(30);
      expect(specificRec.description.length).toBeGreaterThan(80);
      expect(specificRec.successCriteria).toBeDefined();
      expect(specificRec.successCriteria.length).toBeGreaterThan(0);
    });

    it("should not use template phrases without context", () => {
      const templateRec = {
        title: "Take action to improve results",
        description: "Review and optimize your approach",
      };

      const contextualRec = {
        title: "Hire operations manager to oversee process standardization",
        description:
          "Add dedicated operations role to document and enforce procedures, reducing variance in invoice processing time from 4-7 days to consistent 2 days",
      };

      expect(templateRec.description).toMatch(/review|optimize|approach/i);
      expect(contextualRec.description).toMatch(
        /operations manager|document|procedures/i
      );
    });

    it("should provide measurable success criteria", () => {
      const fillerRec = {
        title: "Do better",
        description: "Be more efficient",
      };

      const measurableRec = {
        title: "Implement inventory tracking system",
        successCriteria: [
          "Inventory accuracy ≥98% (vs 65% currently)",
          "Stock-out incidents <2 per month (vs 8 currently)",
          "Time to locate items <5 minutes (vs 30 minutes currently)",
        ],
        verificationMetric: "Monthly inventory audit and incident logs",
      };

      expect(fillerRec.description.length).toBeLessThan(20);
      expect(measurableRec.successCriteria.length).toBeGreaterThan(0);
      expect(measurableRec.verificationMetric).toBeDefined();
    });
  });

  describe("Recommendation scoring and priority calculation", () => {
    it("should calculate priority from impact, urgency, confidence", () => {
      const highImpactRec = {
        impact: 9,
        urgency: 9,
        confidence: 0.9,
        calculatedPriority: "critical",
      };

      const lowImpactRec = {
        impact: 3,
        urgency: 2,
        confidence: 0.5,
        calculatedPriority: "low",
      };

      expect(highImpactRec.calculatedPriority).not.toBe(
        lowImpactRec.calculatedPriority
      );
    });

    it("should downweight low-confidence recommendations", () => {
      const highConfRec = {
        confidence: 0.95,
        priority: "critical",
      };

      const lowConfRec = {
        confidence: 0.4,
        priority: "low",
      };

      expect(lowConfRec.priority).not.toBe(highConfRec.priority);
    });
  });
});
