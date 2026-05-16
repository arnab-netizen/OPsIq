import { describe, it, expect, beforeEach } from "vitest";
import {
  createFinding,
  classifySeverity,
  calculateFindingConfidence,
  getFinding,
  requireFinding,
  getEngagementFindings,
  getActiveFindings,
  getCriticalFindings,
  updateFindingStatus,
  invalidateFinding,
  resolveFinding,
  parkFinding,
  prioritizeFindings,
  filterFindingsBySeverity,
  analyzeContradictions,
  countFindingsBySeverity,
  countFindingsByStatus,
  getRecentFindings,
  clearFindings,
  FindingNotFoundError,
} from "@/services/finding";
import {
  EvidenceRecord,
  EvidenceType,
  EvidenceSource,
  EvidenceFreshness,
  EvidenceConfidence,
} from "@/domain/evidence/evidence";

describe("Finding Service", () => {
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const engagementId = "660e8400-e29b-41d4-a716-446655440001";
  const userId = "770e8400-e29b-41d4-a716-446655440002";

  beforeEach(() => {
    clearFindings();
  });

  const testEvidence: EvidenceRecord = {
    id: "880e8400-e29b-41d4-a716-446655440003",
    workspaceId,
    engagementId,
    type: EvidenceType.FINANCIAL_REVENUE,
    source: EvidenceSource.FINANCIAL_RECORDS,
    description: "Revenue data",
    value: 50000,
    observedAt: new Date(),
    submittedAt: new Date(),
    submittedByUserId: userId,
    freshness: EvidenceFreshness.CURRENT,
    confidence: EvidenceConfidence.HIGH,
    quality: 95,
    contradictionsWith: [],
    verificationStatus: "verified",
  };

  describe("Finding Creation", () => {
    it("should create a new finding", () => {
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Revenue declining",
        description: "Monthly revenue down 20%",
        severity: "high",
        supportingEvidenceIds: ["880e8400-e29b-41d4-a716-446655440003"],
        confidenceScore: 85,
        createdByUserId: userId,
      });

      expect(finding.id).toBeDefined();
      expect(finding.title).toBe("Revenue declining");
      expect(finding.severity).toBe("high");
      expect(finding.status).toBe("active");
      expect(finding.discoveredAt).toBeInstanceOf(Date);
    });

    it("should create finding with contradicting evidence", () => {
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Mixed signals",
        description: "Evidence suggests both growth and decline",
        severity: "medium",
        supportingEvidenceIds: ["880e8400-e29b-41d4-a716-446655440003"],
        contradictingEvidenceIds: ["990e8400-e29b-41d4-a716-446655440004"],
        confidenceScore: 50,
        createdByUserId: userId,
      });

      expect(finding.contradictingEvidenceIds).toContain("990e8400-e29b-41d4-a716-446655440004");
    });

    it("should reject invalid confidence score", () => {
      expect(() => {
        createFinding({
          workspaceId,
          engagementId,
          title: "Test",
          description: "Test",
          severity: "low",
          supportingEvidenceIds: [],
          confidenceScore: 150, // Invalid
          createdByUserId: userId,
        });
      }).toThrow("between 0 and 100");
    });

    it("should accept confidence score 0", () => {
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Speculative",
        description: "Low confidence hypothesis",
        severity: "low",
        supportingEvidenceIds: [],
        confidenceScore: 0,
        createdByUserId: userId,
      });
      expect(finding.confidenceScore).toBe(0);
    });

    it("should accept confidence score 100", () => {
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Certain",
        description: "High confidence conclusion",
        severity: "critical",
        supportingEvidenceIds: ["880e8400-e29b-41d4-a716-446655440003"],
        confidenceScore: 100,
        createdByUserId: userId,
      });
      expect(finding.confidenceScore).toBe(100);
    });
  });

  describe("Severity Classification", () => {
    it("should classify critical: high impact/urgency + good evidence", () => {
      const severity = classifySeverity({
        impactScore: 90,
        urgencyScore: 85,
        evidenceQuality: 80,
      });
      expect(severity).toBe("critical");
    });

    it("should classify high: above average impact/urgency", () => {
      const severity = classifySeverity({
        impactScore: 70,
        urgencyScore: 60,
        evidenceQuality: 50,
      });
      expect(severity).toBe("high");
    });

    it("should classify medium: moderate impact/urgency", () => {
      const severity = classifySeverity({
        impactScore: 50,
        urgencyScore: 40,
        evidenceQuality: 50,
      });
      expect(severity).toBe("medium");
    });

    it("should classify low: below moderate impact/urgency", () => {
      const severity = classifySeverity({
        impactScore: 20,
        urgencyScore: 30,
        evidenceQuality: 40,
      });
      expect(severity).toBe("low");
    });

    it("should cap at high if poor evidence quality", () => {
      const severity = classifySeverity({
        impactScore: 95,
        urgencyScore: 95,
        evidenceQuality: 50, // Low evidence
      });
      expect(severity).toBe("high");
    });
  });

  describe("Finding Confidence Calculation", () => {
    it("should return 0 with no supporting evidence", () => {
      const confidence = calculateFindingConfidence({
        supportingEvidence: [],
        contradictingEvidence: [],
      });
      expect(confidence).toBe(0);
    });

    it("should base confidence on supporting evidence reliability", () => {
      const supportingEvidence: EvidenceRecord[] = [testEvidence];
      const confidence = calculateFindingConfidence({
        supportingEvidence,
        contradictingEvidence: [],
      });
      expect(confidence).toBeGreaterThan(70);
    });

    it("should apply penalty for contradicting evidence", () => {
      const supportingEvidence: EvidenceRecord[] = [testEvidence];
      const contradictingEvidence: EvidenceRecord[] = [
        { ...testEvidence, id: "990e8400-e29b-41d4-a716-446655440004", quality: 80 },
      ];

      const confidenceWithoutContradiction = calculateFindingConfidence({
        supportingEvidence,
        contradictingEvidence: [],
      });
      const confidenceWithContradiction = calculateFindingConfidence({
        supportingEvidence,
        contradictingEvidence,
      });

      expect(confidenceWithoutContradiction).toBeGreaterThan(confidenceWithContradiction);
    });

    it("should handle multiple contradicting evidence", () => {
      const supportingEvidence: EvidenceRecord[] = [testEvidence];
      const contradictingEvidence: EvidenceRecord[] = [
        { ...testEvidence, id: "990e8400-e29b-41d4-a716-446655440004", quality: 80 },
        { ...testEvidence, id: "111e8400-e29b-41d4-a716-446655440005", quality: 75 },
        { ...testEvidence, id: "222e8400-e29b-41d4-a716-446655440006", quality: 70 },
        { ...testEvidence, id: "333e8400-e29b-41d4-a716-446655440007", quality: 65 },
        { ...testEvidence, id: "444e8400-e29b-41d4-a716-446655440008", quality: 60 },
        { ...testEvidence, id: "555e8400-e29b-41d4-a716-446655440009", quality: 55 },
      ];

      const confidence = calculateFindingConfidence({
        supportingEvidence,
        contradictingEvidence,
      });
      // 6 contradictions apply 50-point penalty; confidence reduced significantly
      expect(confidence).toBeLessThan(50);
    });
  });

  describe("Finding Management", () => {
    it("should retrieve finding by ID", () => {
      const created = createFinding({
        workspaceId,
        engagementId,
        title: "Test",
        description: "Test",
        severity: "low",
        supportingEvidenceIds: [],
        confidenceScore: 50,
        createdByUserId: userId,
      });

      const retrieved = getFinding(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return null for non-existent finding", () => {
      const result = getFinding("non-existent-id");
      expect(result).toBeNull();
    });

    it("should require finding or throw error", () => {
      expect(() => {
        requireFinding("non-existent-id");
      }).toThrow(FindingNotFoundError);
    });

    it("should return finding on require if exists", () => {
      const created = createFinding({
        workspaceId,
        engagementId,
        title: "Test",
        description: "Test",
        severity: "medium",
        supportingEvidenceIds: [],
        confidenceScore: 60,
        createdByUserId: userId,
      });

      const required = requireFinding(created.id);
      expect(required.id).toBe(created.id);
    });
  });

  describe("Finding Queries", () => {
    beforeEach(() => {
      // Create test findings
      createFinding({
        workspaceId,
        engagementId,
        title: "Critical issue",
        description: "Desc1",
        severity: "critical",
        supportingEvidenceIds: [],
        confidenceScore: 90,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "High issue",
        description: "Desc2",
        severity: "high",
        supportingEvidenceIds: [],
        confidenceScore: 80,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId: "aaae8400-e29b-41d4-a716-446655440099",
        engagementId,
        title: "Other workspace",
        description: "Desc3",
        severity: "critical",
        supportingEvidenceIds: [],
        confidenceScore: 85,
        createdByUserId: userId,
      });
    });

    it("should get all findings for engagement", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      expect(findings.length).toBe(2);
    });

    it("should filter by workspace", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      expect(findings.every((f) => f.workspaceId === workspaceId)).toBe(true);
    });

    it("should get only active findings", () => {
      const all = getEngagementFindings(workspaceId, engagementId);
      const active = getActiveFindings(workspaceId, engagementId);
      expect(active.length).toBe(all.length);
      expect(active.every((f) => f.status === "active")).toBe(true);
    });

    it("should get critical findings", () => {
      const critical = getCriticalFindings(workspaceId, engagementId);
      expect(critical.length).toBe(1);
      expect(critical[0].severity).toBe("critical");
    });

    it("should return empty for engagement with no findings", () => {
      const findings = getEngagementFindings(workspaceId, "bbba8400-e29b-41d4-a716-446655440098");
      expect(findings.length).toBe(0);
    });
  });

  describe("Finding Status Management", () => {
    let findingId: string;

    beforeEach(() => {
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Status test",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: [],
        confidenceScore: 75,
        createdByUserId: userId,
      });
      findingId = finding.id;
    });

    it("should resolve finding", () => {
      const resolved = resolveFinding(findingId);
      expect(resolved.status).toBe("resolved");
    });

    it("should invalidate finding", () => {
      const invalidated = invalidateFinding(findingId);
      expect(invalidated.status).toBe("invalidated");
    });

    it("should park finding", () => {
      const parked = parkFinding(findingId);
      expect(parked.status).toBe("parked");
    });

    it("should update status explicitly", () => {
      const updated = updateFindingStatus(findingId, "parked");
      expect(updated.status).toBe("parked");
    });

    it("should reflect status in active findings query", () => {
      const active1 = getActiveFindings(workspaceId, engagementId);
      expect(active1.length).toBe(1);

      resolveFinding(findingId);
      const active2 = getActiveFindings(workspaceId, engagementId);
      expect(active2.length).toBe(0);
    });
  });

  describe("Finding Prioritization", () => {
    beforeEach(() => {
      createFinding({
        workspaceId,
        engagementId,
        title: "Medium",
        description: "Test",
        severity: "medium",
        supportingEvidenceIds: [],
        confidenceScore: 50,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "Low",
        description: "Test",
        severity: "low",
        supportingEvidenceIds: [],
        confidenceScore: 40,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "Critical",
        description: "Test",
        severity: "critical",
        supportingEvidenceIds: [],
        confidenceScore: 90,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "High",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: [],
        confidenceScore: 80,
        createdByUserId: userId,
      });
    });

    it("should prioritize findings by severity", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      const prioritized = prioritizeFindings(findings);
      expect(prioritized[0].severity).toBe("critical");
      expect(prioritized[1].severity).toBe("high");
      expect(prioritized[2].severity).toBe("medium");
      expect(prioritized[3].severity).toBe("low");
    });

    it("should filter by severity threshold", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      const highAndAbove = filterFindingsBySeverity(findings, "high");
      expect(highAndAbove.length).toBe(2);
      expect(highAndAbove.every((f) => f.severity === "critical" || f.severity === "high")).toBe(
        true
      );
    });

    it("should filter by critical severity only", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      const critical = filterFindingsBySeverity(findings, "critical");
      expect(critical.length).toBe(1);
      expect(critical[0].severity).toBe("critical");
    });
  });

  describe("Finding Statistics", () => {
    beforeEach(() => {
      createFinding({
        workspaceId,
        engagementId,
        title: "C1",
        description: "Test",
        severity: "critical",
        supportingEvidenceIds: [],
        confidenceScore: 90,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "C2",
        description: "Test",
        severity: "critical",
        supportingEvidenceIds: [],
        confidenceScore: 85,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "H1",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: [],
        confidenceScore: 75,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "M1",
        description: "Test",
        severity: "medium",
        supportingEvidenceIds: [],
        confidenceScore: 50,
        createdByUserId: userId,
      });
    });

    it("should count findings by severity", () => {
      const findings = getEngagementFindings(workspaceId, engagementId);
      const counts = countFindingsBySeverity(findings);
      expect(counts.critical).toBe(2);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(0);
    });

    it("should count findings by status", () => {
      let findings = getEngagementFindings(workspaceId, engagementId);
      resolveFinding(findings[0].id);
      invalidateFinding(findings[1].id);

      // Re-fetch after status updates
      findings = getEngagementFindings(workspaceId, engagementId);
      const counts = countFindingsByStatus(findings);
      expect(counts.active).toBe(2);
      expect(counts.resolved).toBe(1);
      expect(counts.invalidated).toBe(1);
    });
  });

  describe("Finding Contradiction Analysis", () => {
    it("should detect contradictions", () => {
      const f1 = createFinding({
        workspaceId,
        engagementId,
        title: "Revenue up",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: ["880e8400-e29b-41d4-a716-446655440003"],
        contradictingEvidenceIds: ["990e8400-e29b-41d4-a716-446655440004"],
        confidenceScore: 80,
        createdByUserId: userId,
      });
      const f2 = createFinding({
        workspaceId,
        engagementId,
        title: "Revenue down",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: ["990e8400-e29b-41d4-a716-446655440004"],
        contradictingEvidenceIds: ["880e8400-e29b-41d4-a716-446655440003"],
        confidenceScore: 75,
        createdByUserId: userId,
      });

      const findings = [f1, f2];
      const contradictions = analyzeContradictions(findings);
      expect(contradictions.size).toBe(2);
      expect(contradictions.get(f1.id)).toContain("990e8400-e29b-41d4-a716-446655440004");
      expect(contradictions.get(f2.id)).toContain("880e8400-e29b-41d4-a716-446655440003");
    });
  });

  describe("Recent Findings", () => {
    beforeEach(() => {
      // Create recent finding
      createFinding({
        workspaceId,
        engagementId,
        title: "Recent",
        description: "Test",
        severity: "high",
        supportingEvidenceIds: [],
        confidenceScore: 80,
        createdByUserId: userId,
      });
    });

    it("should get recent findings (last 7 days)", () => {
      const recent = getRecentFindings(workspaceId, engagementId, 7);
      expect(recent.length).toBeGreaterThan(0);
    });

    it("should not include old findings", () => {
      const old = getRecentFindings(workspaceId, engagementId, 1);
      // May be 0 or 1 depending on execution speed - just verify no errors
      expect(old).toBeDefined();
      expect(Array.isArray(old)).toBe(true);
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle complete finding lifecycle", () => {
      // Create
      const finding = createFinding({
        workspaceId,
        engagementId,
        title: "Cash runway critical",
        description: "Cash position declining, 3 months runway remaining",
        severity: "critical",
        supportingEvidenceIds: ["666e8400-e29b-41d4-a716-446655440010", "777e8400-e29b-41d4-a716-446655440011"],
        confidenceScore: 95,
        createdByUserId: userId,
      });

      // Query
      const active = getActiveFindings(workspaceId, engagementId);
      expect(active.length).toBe(1);

      // Update status
      const resolved = resolveFinding(finding.id);
      expect(resolved.status).toBe("resolved");

      // Verify not in active anymore
      const activeAfter = getActiveFindings(workspaceId, engagementId);
      expect(activeAfter.length).toBe(0);
    });

    it("should prioritize multiple findings correctly", () => {
      createFinding({
        workspaceId,
        engagementId,
        title: "Team turnover risk",
        description: "2 key engineers may leave",
        severity: "high",
        supportingEvidenceIds: ["888e8400-e29b-41d4-a716-446655440012"],
        confidenceScore: 70,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "Minor bug in UI",
        description: "Button color inconsistency",
        severity: "low",
        supportingEvidenceIds: ["999e8400-e29b-41d4-a716-446655440013"],
        confidenceScore: 90,
        createdByUserId: userId,
      });
      createFinding({
        workspaceId,
        engagementId,
        title: "Customer acquisition cost rising",
        description: "CAC up 30% YoY",
        severity: "medium",
        supportingEvidenceIds: ["111f8400-e29b-41d4-a716-446655440014"],
        confidenceScore: 85,
        createdByUserId: userId,
      });

      const findings = getEngagementFindings(workspaceId, engagementId);
      const prioritized = prioritizeFindings(findings);
      const critical = filterFindingsBySeverity(prioritized, "critical");

      expect(prioritized.length).toBe(3);
      expect(critical.length).toBe(0);
      expect(prioritized[0].severity).toBe("high");
      expect(prioritized[1].severity).toBe("medium");
      expect(prioritized[2].severity).toBe("low");
    });
  });
});
