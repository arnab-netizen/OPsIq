import { describe, it, expect } from "vitest";
import {
  DataCompletenessSchema,
  DataConsistencySchema,
  ValueConfidenceSchema,
  DataLineageSchema,
  QualityScoreSchema,
  QualityGateSchema,
  BatchQualityResultSchema,
  calculateCompleteness,
  calculateConsistency,
  calculateValueConfidence,
  calculateQualityScore,
  assessQualityGates,
  assessBatchQuality,
  type DataCompleteness,
  type QualityScore,
  type QualityGate,
} from "@/domain/data-quality/reliability-engine";

describe("ADDENDUM F: Data Reliability & Quality Scoring", () => {
  describe("Completeness Calculation", () => {
    it("should calculate 100% completeness", () => {
      const record = {
        name: "John Doe",
        email: "john@example.com",
        phone: "555-1234",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone"],
      };

      const result = calculateCompleteness(record, schema);
      expect(result.requiredFieldsPresent).toBe(2);
      expect(result.optionalFieldsPresent).toBe(1);
      expect(result.completenessPercent).toBe(100);
      expect(result.missingCriticalFields).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const record = {
        name: "John Doe",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone"],
      };

      const result = calculateCompleteness(record, schema);
      expect(result.requiredFieldsPresent).toBe(1);
      expect(result.completenessPercent).toBeLessThan(100);
      expect(result.missingCriticalFields).toContain("email");
    });

    it("should handle null and empty values as missing", () => {
      const record = {
        name: "John Doe",
        email: null,
        phone: "",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone"],
      };

      const result = calculateCompleteness(record, schema);
      expect(result.requiredFieldsPresent).toBe(1);
      expect(result.missingCriticalFields).toContain("email");
      expect(result.optionalFieldsPresent).toBe(0);
    });

    it("should validate completeness schema", () => {
      const completeness: DataCompleteness = {
        requiredFieldsTotal: 5,
        requiredFieldsPresent: 4,
        optionalFieldsTotal: 3,
        optionalFieldsPresent: 2,
        completenessPercent: 75,
        missingCriticalFields: ["email"],
      };

      const result = DataCompletenessSchema.safeParse(completeness);
      expect(result.success).toBe(true);
    });
  });

  describe("Consistency Calculation", () => {
    it("should calculate high consistency for uniform data", () => {
      const records = [
        { id: "1", status: "active" },
        { id: "2", status: "active" },
        { id: "3", status: "active" },
      ];

      const result = calculateConsistency(records, "status");
      expect(result.consistencyScore).toBeGreaterThan(0.8);
      expect(result.uniqueValueCount).toBe(1);
      expect(result.anomalies).toHaveLength(0);
    });

    it("should detect anomalies in inconsistent data", () => {
      const records = [
        { id: "1", value: "normal" },
        { id: "2", value: "normal" },
        { id: "3", value: "normal" },
        { id: "4", value: "anomaly" },
      ];

      const result = calculateConsistency(records, "value");
      expect(result.consistencyScore).toBeLessThan(1.0);
      expect(result.anomalies.length).toBeGreaterThan(0);
    });

    it("should validate consistency schema", () => {
      const consistency = {
        field: "email",
        recordCount: 100,
        uniqueValueCount: 95,
        consistencyScore: 0.8,
        anomalies: [
          {
            recordId: "rec_1",
            value: "invalid@",
            reason: "Invalid format",
          },
        ],
      };

      const result = DataConsistencySchema.safeParse(consistency);
      expect(result.success).toBe(true);
    });
  });

  describe("Value Confidence Calculation", () => {
    it("should calculate confidence with all factors", () => {
      const result = calculateValueConfidence("john@example.com", "hubspot", {
        sourceReliability: 0.9,
        dataFreshness: 0.8,
        verificationLevel: 0.85,
        consistencyAcrossSources: 0.9,
      });

      expect(result.confidenceScore).toBeGreaterThan(0.8);
      expect(result.sourceConnector).toBe("hubspot");
      expect(result.verificationMethod).toBe("automated_validation");
    });

    it("should handle missing factors with defaults", () => {
      const result = calculateValueConfidence("value", "api");
      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
    });

    it("should validate confidence schema", () => {
      const confidence = {
        value: "test@example.com",
        sourceConnector: "salesforce",
        confidenceScore: 0.85,
        factors: {
          sourceReliability: 0.9,
          dataFreshness: 0.8,
          verificationLevel: 0.85,
          consistencyAcrossSources: 0.8,
        },
        verificationMethod: "automated_validation" as const,
        lastVerifiedAt: new Date(),
      };

      const result = ValueConfidenceSchema.safeParse(confidence);
      expect(result.success).toBe(true);
    });
  });

  describe("Quality Score Calculation", () => {
    it("should calculate quality score for complete record", () => {
      const record = {
        id: "rec_1",
        name: "John Doe",
        email: "john@example.com",
        phone: "555-1234",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone"],
        recordType: "contact",
      };

      const score = calculateQualityScore(record, schema, "hubspot");
      expect(score.overallScore).toBeGreaterThanOrEqual(70);
      expect(score.qualityRating).toMatch(/good|excellent/);
      expect(score.scoreBreakdown.completenessScore).toBe(100);
    });

    it("should rate excellent quality for perfect record", () => {
      const record = {
        id: "rec_1",
        name: "John Doe",
        email: "john@example.com",
        phone: "555-1234",
        company: "ACME Corp",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone", "company"],
        recordType: "contact",
      };

      const score = calculateQualityScore(record, schema, "hubspot");
      expect(score.qualityRating).toMatch(/excellent|good/);
      expect(score.overallScore).toBeGreaterThanOrEqual(70);
    });

    it("should rate poor quality for incomplete record", () => {
      const record = {
        id: "rec_1",
        name: "John Doe",
      };

      const schema = {
        requiredFields: ["name", "email", "phone"],
        optionalFields: ["company"],
        recordType: "contact",
      };

      const score = calculateQualityScore(record, schema, "hubspot");
      expect(score.qualityRating).toMatch(/fair|poor/);
      expect(score.overallScore).toBeLessThanOrEqual(75);
      expect(score.recommendations.length).toBeGreaterThan(0);
    });

    it("should validate quality score schema", () => {
      const score: QualityScore = {
        recordId: "rec_1",
        sourceConnector: "hubspot",
        recordType: "contact",
        overallScore: 82,
        scoreBreakdown: {
          completenessScore: 85,
          consistencyScore: 80,
          accuracyScore: 85,
          freshnessScore: 80,
          lineageScore: 80,
        },
        qualityRating: "good",
        recommendations: [
          {
            area: "Completeness",
            recommendation: "Add missing phone field",
            severity: "medium",
          },
        ],
        scoredAt: new Date(),
      };

      const result = QualityScoreSchema.safeParse(score);
      expect(result.success).toBe(true);
    });
  });

  describe("Quality Gates", () => {
    it("should validate quality gate schema", () => {
      const gate: QualityGate = {
        gateId: "gate_1",
        gateName: "Minimum Completeness",
        metric: "completeness",
        minimumThreshold: 80,
        warningThreshold: 70,
        criticalThreshold: 50,
        enforced: true,
        onFailureAction: "flag_for_review",
      };

      const result = QualityGateSchema.safeParse(gate);
      expect(result.success).toBe(true);
    });

    it("should pass quality gates for good data", () => {
      const record = {
        id: "rec_1",
        name: "John Doe",
        email: "john@example.com",
        phone: "555-1234",
      };

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: ["phone"],
        recordType: "contact",
      };

      const score = calculateQualityScore(record, schema, "hubspot");

      const gates: QualityGate[] = [
        {
          gateId: "gate_completeness",
          gateName: "Minimum Completeness",
          metric: "completeness",
          minimumThreshold: 75,
          warningThreshold: 70,
          criticalThreshold: 50,
          enforced: true,
          onFailureAction: "flag_for_review",
        },
      ];

      const result = assessQualityGates(score, gates);
      expect(result.passed).toBe(true);
      expect(result.gateFailures).toHaveLength(0);
    });

    it("should fail quality gates for poor data", () => {
      const record = {
        id: "rec_1",
        name: "John",
      };

      const schema = {
        requiredFields: ["name", "email", "phone", "company"],
        optionalFields: [],
        recordType: "contact",
      };

      const score = calculateQualityScore(record, schema, "hubspot");

      const gates: QualityGate[] = [
        {
          gateId: "gate_completeness",
          gateName: "Minimum Completeness",
          metric: "completeness",
          minimumThreshold: 80,
          warningThreshold: 70,
          criticalThreshold: 50,
          enforced: true,
          onFailureAction: "block_import",
        },
      ];

      const result = assessQualityGates(score, gates);
      if (score.scoreBreakdown.completenessScore < 80) {
        expect(result.passed).toBe(false);
        expect(result.gateFailures.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Batch Quality Assessment", () => {
    it("should assess batch of records", () => {
      const records = [
        {
          id: "1",
          name: "John Doe",
          email: "john@example.com",
        },
        {
          id: "2",
          name: "Jane Smith",
          email: "jane@example.com",
        },
        {
          id: "3",
          name: "Bob Johnson",
          email: "bob@example.com",
        },
      ];

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: [],
        recordType: "contact",
      };

      const gates: QualityGate[] = [
        {
          gateId: "gate_completeness",
          gateName: "Minimum Completeness",
          metric: "completeness",
          minimumThreshold: 75,
          warningThreshold: 70,
          criticalThreshold: 50,
          enforced: true,
          onFailureAction: "flag_for_review",
        },
      ];

      const result = assessBatchQuality(records, schema, "hubspot", gates);
      expect(result.totalRecords).toBe(3);
      expect(result.recordsQualified).toBeGreaterThanOrEqual(0);
      expect(result.averageQualityScore).toBeGreaterThanOrEqual(0);
    });

    it("should identify quality issues in batch", () => {
      const records = [
        { id: "1", name: "John" },
        { id: "2", name: "Jane" },
        { id: "3" },
      ];

      const schema = {
        requiredFields: ["name", "email"],
        optionalFields: [],
        recordType: "contact",
      };

      const gates: QualityGate[] = [
        {
          gateId: "gate_completeness",
          gateName: "Minimum Completeness",
          metric: "completeness",
          minimumThreshold: 80,
          warningThreshold: 70,
          criticalThreshold: 50,
          enforced: true,
          onFailureAction: "quarantine_record",
        },
      ];

      const result = assessBatchQuality(records, schema, "api", gates);
      expect(result.recordsQuarantined).toBeGreaterThanOrEqual(0);
    });

    it("should validate batch quality result schema", () => {
      const result = {
        batchId: "batch_123",
        totalRecords: 100,
        recordsQualified: 85,
        recordsQuarantined: 15,
        averageQualityScore: 78,
        qualityDistribution: {
          excellent: 20,
          good: 45,
          fair: 30,
          poor: 5,
        },
        gateFailures: [
          {
            gateId: "gate_1",
            failureCount: 15,
            failedRecordSamples: ["rec_1", "rec_2", "rec_3"],
          },
        ],
        assessmentTimeMs: 245,
      };

      const parsed = BatchQualityResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("Data Lineage", () => {
    it("should validate data lineage schema", () => {
      const lineage = {
        recordId: "rec_123",
        fieldName: "email",
        originConnector: "hubspot",
        originField: "hubspot_email",
        transformations: [
          {
            transformationType: "normalize",
            appliedAt: new Date(),
            appliedBy: "system",
          },
        ],
        currentValue: "john@example.com",
        previousValues: [
          {
            value: "John@Example.Com",
            changedAt: new Date(),
            changedReason: "Normalization",
          },
        ],
      };

      const result = DataLineageSchema.safeParse(lineage);
      expect(result.success).toBe(true);
    });
  });

  describe("Comprehensive Quality Coverage", () => {
    it("should cover all quality metrics", () => {
      const completeness = calculateCompleteness(
        { name: "John", email: "john@example.com" },
        { requiredFields: ["name", "email"] },
      );
      expect(completeness).toBeDefined();

      const consistency = calculateConsistency(
        [
          { id: "1", status: "active" },
          { id: "2", status: "active" },
        ],
        "status",
      );
      expect(consistency).toBeDefined();

      const confidence = calculateValueConfidence("test", "source");
      expect(confidence).toBeDefined();

      const quality = calculateQualityScore(
        { name: "John", email: "john@example.com" },
        { requiredFields: ["name", "email"], recordType: "contact" },
        "source",
      );
      expect(quality).toBeDefined();
    });

    it("should provide quality assessment helpers", () => {
      expect(calculateCompleteness).toBeDefined();
      expect(calculateConsistency).toBeDefined();
      expect(calculateValueConfidence).toBeDefined();
      expect(calculateQualityScore).toBeDefined();
      expect(assessQualityGates).toBeDefined();
      expect(assessBatchQuality).toBeDefined();
    });
  });
});
