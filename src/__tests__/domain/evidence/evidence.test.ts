import { describe, it, expect, beforeEach } from "vitest";
import {
  EvidenceType,
  EvidenceSource,
  EvidenceFreshness,
  EvidenceConfidence,
  EvidenceRecord,
  validateEvidenceQuality,
  detectContradictions,
  calculateEvidenceReliability,
  assessEvidenceSufficiency,
} from "@/domain/evidence/evidence";

describe("Evidence Domain", () => {
  const workspaceId = "ws-123";
  const engagementId = "eng-456";
  const userId = "user-789";

  // Test evidence records
  const currentHighQualityEvidence: EvidenceRecord = {
    id: "ev-001",
    workspaceId,
    engagementId,
    type: EvidenceType.FINANCIAL_REVENUE,
    source: EvidenceSource.FINANCIAL_RECORDS,
    description: "Monthly recurring revenue from accounting records",
    value: 50000,
    unit: "USD",
    observedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    submittedByUserId: userId,
    freshness: EvidenceFreshness.CURRENT,
    confidence: EvidenceConfidence.HIGH,
    quality: 95,
    contradictionsWith: [],
    verificationStatus: "verified",
  };

  const recentMediumQualityEvidence: EvidenceRecord = {
    id: "ev-002",
    workspaceId,
    engagementId,
    type: EvidenceType.CUSTOMER_RETENTION,
    source: EvidenceSource.ANALYTICS_PLATFORM,
    description: "Customer retention rate from analytics",
    value: 92,
    unit: "%",
    observedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    submittedByUserId: userId,
    freshness: EvidenceFreshness.RECENT,
    confidence: EvidenceConfidence.MEDIUM,
    quality: 75,
    contradictionsWith: [],
    verificationStatus: "verified",
  };

  const staleLowQualityEvidence: EvidenceRecord = {
    id: "ev-003",
    workspaceId,
    engagementId,
    type: EvidenceType.CUSTOMER_CHURN,
    source: EvidenceSource.CRM_SYSTEM,
    description: "Churn rate estimation (old data)",
    value: 8,
    unit: "%",
    observedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days ago
    submittedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
    submittedByUserId: userId,
    freshness: EvidenceFreshness.STALE,
    confidence: EvidenceConfidence.LOW,
    quality: 30,
    contradictionsWith: [],
    verificationStatus: "unverified",
  };

  describe("Evidence Quality Validation", () => {
    it("should accept high-quality current evidence", () => {
      const result = validateEvidenceQuality(currentHighQualityEvidence);
      expect(result.valid).toBe(true);
    });

    it("should accept medium-quality recent evidence", () => {
      const result = validateEvidenceQuality(recentMediumQualityEvidence);
      expect(result.valid).toBe(true);
    });

    it("should reject low-quality evidence without high confidence", () => {
      const lowQuality = {
        ...currentHighQualityEvidence,
        quality: 30,
        confidence: EvidenceConfidence.MEDIUM,
      };
      const result = validateEvidenceQuality(lowQuality);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Low quality evidence");
    });

    it("should accept low-quality evidence with high confidence", () => {
      const lowQualityHighConfidence = {
        ...currentHighQualityEvidence,
        quality: 30,
        confidence: EvidenceConfidence.HIGH,
      };
      const result = validateEvidenceQuality(lowQualityHighConfidence);
      expect(result.valid).toBe(true);
    });

    it("should reject stale evidence without high confidence", () => {
      const staleWithMediumConfidence = {
        ...currentHighQualityEvidence,
        freshness: EvidenceFreshness.STALE,
        confidence: EvidenceConfidence.MEDIUM,
      };
      const result = validateEvidenceQuality(staleWithMediumConfidence);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Stale evidence");
    });

    it("should accept stale evidence with high confidence", () => {
      const staleWithHighConfidence = {
        ...currentHighQualityEvidence,
        freshness: EvidenceFreshness.STALE,
        confidence: EvidenceConfidence.HIGH,
      };
      const result = validateEvidenceQuality(staleWithHighConfidence);
      expect(result.valid).toBe(true);
    });
  });

  describe("Contradiction Detection", () => {
    it("should detect no contradictions for identical evidence", () => {
      const records = [currentHighQualityEvidence];
      const contradictions = detectContradictions(records);
      expect(contradictions.size).toBe(0);
    });

    it("should detect no contradictions for different evidence types", () => {
      const records = [currentHighQualityEvidence, recentMediumQualityEvidence];
      const contradictions = detectContradictions(records);
      expect(contradictions.size).toBe(0);
    });

    it("should detect contradictions for same type with >20% variance", () => {
      const record1: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-100",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 100000,
      };
      const record2: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-101",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 80000, // 20% less - should trigger contradiction
      };
      const contradictions = detectContradictions([record1, record2]);
      expect(contradictions.size).toBeGreaterThan(0);
    });

    it("should not mark small variance as contradiction", () => {
      const record1: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-102",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 100000,
      };
      const record2: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-103",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 101000, // 1% more - no contradiction
      };
      const contradictions = detectContradictions([record1, record2]);
      expect(contradictions.size).toBe(0);
    });
  });

  describe("Evidence Reliability Scoring", () => {
    it("should return 0 for empty evidence list", () => {
      const score = calculateEvidenceReliability([]);
      expect(score).toBe(0);
    });

    it("should calculate high reliability for current high-quality high-confidence evidence", () => {
      const score = calculateEvidenceReliability([currentHighQualityEvidence]);
      expect(score).toBeGreaterThan(90);
    });

    it("should reduce reliability for recent vs current data", () => {
      const currentScore = calculateEvidenceReliability([currentHighQualityEvidence]);
      const recentScore = calculateEvidenceReliability([recentMediumQualityEvidence]);
      expect(currentScore).toBeGreaterThan(recentScore);
    });

    it("should significantly reduce reliability for stale data", () => {
      const staleRecord: EvidenceRecord = {
        ...currentHighQualityEvidence,
        freshness: EvidenceFreshness.STALE,
        quality: 95,
      };
      const staleScore = calculateEvidenceReliability([staleRecord]);
      const currentScore = calculateEvidenceReliability([currentHighQualityEvidence]);
      expect(currentScore).toBeGreaterThan(staleScore + 20);
    });

    it("should apply penalty for contradictions", () => {
      const noContradiction: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-104",
        contradictionsWith: [],
      };
      const withContradiction: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-105",
        contradictionsWith: ["ev-other"],
      };
      const score1 = calculateEvidenceReliability([noContradiction]);
      const score2 = calculateEvidenceReliability([withContradiction]);
      expect(score1).toBeGreaterThan(score2);
    });

    it("should calculate average reliability for multiple records", () => {
      const records = [currentHighQualityEvidence, recentMediumQualityEvidence];
      const score = calculateEvidenceReliability(records);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });
  });

  describe("Evidence Sufficiency Assessment", () => {
    it("should mark insufficient when missing categories", () => {
      const records = [currentHighQualityEvidence]; // Only financial
      const summary = assessEvidenceSufficiency(records);
      expect(summary.isSufficientForRecommendation).toBe(false);
      expect(summary.allRequiredCategoriesPresent).toBe(false);
    });

    it("should require all four categories", () => {
      const financialEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-f-1",
        type: EvidenceType.FINANCIAL_REVENUE,
      };
      const customerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-c-1",
        type: EvidenceType.CUSTOMER_RETENTION,
      };
      const operationalEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-o-1",
        type: EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
      };
      const ownerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-w-1",
        type: EvidenceType.OWNER_ASSESSMENT,
      };

      const summary = assessEvidenceSufficiency([
        financialEvidence,
        customerEvidence,
        operationalEvidence,
        ownerEvidence,
      ]);
      expect(summary.allRequiredCategoriesPresent).toBe(true);
    });

    it("should mark insufficient if data is too stale", () => {
      const financialEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-f-1",
        type: EvidenceType.FINANCIAL_REVENUE,
        observedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        freshness: EvidenceFreshness.STALE,
      };
      const customerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-c-1",
        type: EvidenceType.CUSTOMER_RETENTION,
        observedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        freshness: EvidenceFreshness.STALE,
      };
      const operationalEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-o-1",
        type: EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
        observedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        freshness: EvidenceFreshness.STALE,
      };
      const ownerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-w-1",
        type: EvidenceType.OWNER_ASSESSMENT,
        observedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        freshness: EvidenceFreshness.STALE,
      };

      const summary = assessEvidenceSufficiency([
        financialEvidence,
        customerEvidence,
        operationalEvidence,
        ownerEvidence,
      ]);
      expect(summary.currentDataPresent).toBe(false);
      expect(summary.isSufficientForRecommendation).toBe(false);
    });

    it("should require diverse sources", () => {
      const financialEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-f-1",
        type: EvidenceType.FINANCIAL_REVENUE,
        source: EvidenceSource.FINANCIAL_RECORDS,
      };
      const customerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-c-1",
        type: EvidenceType.CUSTOMER_RETENTION,
        source: EvidenceSource.FINANCIAL_RECORDS, // Same source
      };
      const operationalEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-o-1",
        type: EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
        source: EvidenceSource.FINANCIAL_RECORDS, // Same source
      };
      const ownerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-w-1",
        type: EvidenceType.OWNER_ASSESSMENT,
        source: EvidenceSource.FINANCIAL_RECORDS, // Same source
      };

      const summary = assessEvidenceSufficiency([
        financialEvidence,
        customerEvidence,
        operationalEvidence,
        ownerEvidence,
      ]);
      expect(summary.diverseSourcesPresent).toBe(false);
      expect(summary.isSufficientForRecommendation).toBe(false);
    });

    it("should mark sufficient with all requirements met", () => {
      const financialEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-f-1",
        type: EvidenceType.FINANCIAL_REVENUE,
        source: EvidenceSource.FINANCIAL_RECORDS,
        quality: 90,
        confidence: EvidenceConfidence.HIGH,
      };
      const customerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-c-1",
        type: EvidenceType.CUSTOMER_RETENTION,
        source: EvidenceSource.ANALYTICS_PLATFORM,
        quality: 85,
        confidence: EvidenceConfidence.HIGH,
      };
      const operationalEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-o-1",
        type: EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
        source: EvidenceSource.OWNER_INTERVIEW,
        quality: 80,
        confidence: EvidenceConfidence.HIGH,
      };
      const ownerEvidence: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-w-1",
        type: EvidenceType.OWNER_ASSESSMENT,
        source: EvidenceSource.CRM_SYSTEM,
        quality: 75,
        confidence: EvidenceConfidence.HIGH,
      };

      const summary = assessEvidenceSufficiency([
        financialEvidence,
        customerEvidence,
        operationalEvidence,
        ownerEvidence,
      ]);
      expect(summary.allRequiredCategoriesPresent).toBe(true);
      expect(summary.currentDataPresent).toBe(true);
      expect(summary.diverseSourcesPresent).toBe(true);
      expect(summary.reliabilityScore).toBeGreaterThanOrEqual(60);
      expect(summary.isSufficientForRecommendation).toBe(true);
    });

    it("should count evidence by category", () => {
      const records = [
        currentHighQualityEvidence,
        recentMediumQualityEvidence,
        staleLowQualityEvidence,
      ];
      const summary = assessEvidenceSufficiency(records);
      expect(summary.financialEvidenceCount).toBe(1);
      expect(summary.customerEvidenceCount).toBe(2);
      expect(summary.totalEvidenceCount).toBe(3);
    });

    it("should calculate average quality across evidence", () => {
      const records = [
        { ...currentHighQualityEvidence, id: "ev-1", quality: 100 },
        { ...recentMediumQualityEvidence, id: "ev-2", quality: 50 },
      ];
      const summary = assessEvidenceSufficiency(records);
      expect(summary.averageQuality).toBe(75);
    });

    it("should detect contradictions in summary", () => {
      const record1: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-1",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 100000,
      };
      const record2: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-2",
        type: EvidenceType.FINANCIAL_REVENUE,
        value: 75000, // 25% less - contradiction
      };
      const record3: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-3",
        type: EvidenceType.CUSTOMER_RETENTION,
      };
      const record4: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-4",
        type: EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
      };
      const record5: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-5",
        type: EvidenceType.OWNER_ASSESSMENT,
      };

      const summary = assessEvidenceSufficiency([record1, record2, record3, record4, record5]);
      expect(summary.contradictionCount).toBeGreaterThan(0);
    });

    it("should count stale evidence warnings", () => {
      const freshRecord: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-1",
        freshness: EvidenceFreshness.CURRENT,
      };
      const staleRecord: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-2",
        freshness: EvidenceFreshness.STALE,
      };
      const summary = assessEvidenceSufficiency([freshRecord, staleRecord]);
      expect(summary.stalewarnCount).toBe(1);
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle early-stage startup with minimal evidence", () => {
      const ownerAssessment: EvidenceRecord = {
        ...currentHighQualityEvidence,
        id: "ev-1",
        type: EvidenceType.OWNER_ASSESSMENT,
        quality: 50,
        confidence: EvidenceConfidence.MEDIUM,
      };
      const summary = assessEvidenceSufficiency([ownerAssessment]);
      expect(summary.totalEvidenceCount).toBe(1);
      expect(summary.isSufficientForRecommendation).toBe(false);
    });

    it("should handle mature business with rich evidence", () => {
      const records: EvidenceRecord[] = [];
      const types = [
        EvidenceType.FINANCIAL_REVENUE,
        EvidenceType.FINANCIAL_EXPENSES,
        EvidenceType.CUSTOMER_RETENTION,
        EvidenceType.CUSTOMER_CHURN,
        EvidenceType.OPERATIONAL_TEAM_CAPABILITY,
        EvidenceType.OWNER_ASSESSMENT,
      ];
      const sources = [
        EvidenceSource.FINANCIAL_RECORDS,
        EvidenceSource.ANALYTICS_PLATFORM,
        EvidenceSource.CRM_SYSTEM,
      ];

      types.forEach((type, idx) => {
        records.push({
          id: `ev-${idx}`,
          workspaceId,
          engagementId,
          type,
          source: sources[idx % sources.length],
          description: `Evidence ${idx}`,
          value: 100 + idx * 10,
          observedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          submittedByUserId: userId,
          freshness: EvidenceFreshness.CURRENT,
          confidence: EvidenceConfidence.HIGH,
          quality: 90,
          contradictionsWith: [],
          verificationStatus: "verified",
        });
      });

      const summary = assessEvidenceSufficiency(records);
      expect(summary.totalEvidenceCount).toBeGreaterThan(3);
      expect(summary.reliabilityScore).toBeGreaterThan(80);
    });
  });
});
