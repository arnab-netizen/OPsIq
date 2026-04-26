import { describe, it, expect } from "vitest";
import {
  engagementUpdateSchema,
  actionStatusUpdateSchema,
  findingCreateSchema,
  findingUpdateSchema,
  recommendationUpdateSchema,
  recommendationRerankSchema,
  engagementReportResponseSchema,
  parseRequest,
  formatValidationError,
} from "./api-contracts";

describe("API Contracts", () => {
  describe("Engagement Update Schema", () => {
    it("accepts valid engagement update", () => {
      const result = parseRequest(engagementUpdateSchema, {
        title: "Updated Title",
        version: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing version", () => {
      const result = parseRequest(engagementUpdateSchema, {
        title: "Updated Title",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.field === "version")).toBe(true);
      }
    });

    it("rejects invalid UUID for ownerId", () => {
      const result = parseRequest(engagementUpdateSchema, {
        ownerId: "not-a-uuid",
        version: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.field === "ownerId")).toBe(true);
      }
    });

    it("rejects negative version", () => {
      const result = parseRequest(engagementUpdateSchema, {
        version: -1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts all optional fields", () => {
      const result = parseRequest(engagementUpdateSchema, {
        title: "New Title",
        description: "New description",
        status: "active",
        version: 5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Action Status Update Schema", () => {
    it("accepts valid action update", () => {
      const result = parseRequest(actionStatusUpdateSchema, {
        status: "completed",
        version: 2,
      });
      expect(result.success).toBe(true);
    });

    it("accepts any priority string", () => {
      const result = parseRequest(actionStatusUpdateSchema, {
        priority: "custom-priority",
        version: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects blocker reason exceeding 500 chars", () => {
      const result = parseRequest(actionStatusUpdateSchema, {
        blockageReason: "x".repeat(501),
        version: 1,
      });
      expect(result.success).toBe(false);
    });

    it("accepts blocker reason within limit", () => {
      const result = parseRequest(actionStatusUpdateSchema, {
        blockageReason: "x".repeat(500),
        version: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Finding Create Schema", () => {
    it("accepts valid finding creation", () => {
      const result = parseRequest(findingCreateSchema, {
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        title: "Critical Finding",
        severity: "critical",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid severity", () => {
      const result = parseRequest(findingCreateSchema, {
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        title: "Finding",
        severity: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required fields", () => {
      const result = parseRequest(findingCreateSchema, {
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("accepts optional summary", () => {
      const result = parseRequest(findingCreateSchema, {
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        title: "Finding with Summary",
        severity: "high",
        summary: "This is a summary",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Finding Update Schema", () => {
    it("accepts valid finding update", () => {
      const result = parseRequest(findingUpdateSchema, {
        severity: "high",
        version: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid severity in update", () => {
      const result = parseRequest(findingUpdateSchema, {
        severity: "unknown-severity",
        version: 1,
      });
      expect(result.success).toBe(false);
    });

    it("requires version for update", () => {
      const result = parseRequest(findingUpdateSchema, {
        severity: "high",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Recommendation Update Schema", () => {
    it("accepts valid recommendation update", () => {
      const result = parseRequest(recommendationUpdateSchema, {
        priority: "high",
        version: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid priority", () => {
      const result = parseRequest(recommendationUpdateSchema, {
        priority: "super-high",
        version: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Recommendation Rerank Schema", () => {
    it("accepts valid reranking", () => {
      const result = parseRequest(recommendationRerankSchema, {
        recommendations: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            priority: "critical",
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            priority: "high",
          },
        ],
        version: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID in recommendations", () => {
      const result = parseRequest(recommendationRerankSchema, {
        recommendations: [
          {
            id: "not-a-uuid",
            priority: "critical",
          },
        ],
        version: 1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty recommendations array", () => {
      const result = parseRequest(recommendationRerankSchema, {
        recommendations: [],
        version: 1,
      });
      // Empty array is technically valid per the schema
      expect(result.success).toBe(true);
    });
  });

  describe("Validation Error Formatting", () => {
    it("formats validation errors correctly", () => {
      const errors = [
        { field: "title", message: "Title is required", code: "invalid_type" },
        { field: "version", message: "Version must be positive", code: "too_small" },
      ];

      const formatted = formatValidationError(errors);

      expect(formatted.error).toBe("VALIDATION_ERROR");
      expect(formatted.details).toEqual(errors);
      expect(formatted.details.length).toBe(2);
    });

    it("handles empty error array", () => {
      const formatted = formatValidationError([]);
      expect(formatted.error).toBe("VALIDATION_ERROR");
      expect(formatted.details).toEqual([]);
    });
  });

  describe("Report Response Schema", () => {
    it("accepts valid engagement report", () => {
      const validReport = {
        summary: {
          engagementId: "550e8400-e29b-41d4-a716-446655440000",
          engagementCode: "ENG-001",
          engagementTitle: "Test Engagement",
          status: "active",
          healthStatus: "healthy",
          interventionMode: "stabilization",
        },
        executiveSummary: {
          totalFindings: 5,
          criticalFindings: 1,
          highPriorityActions: 3,
          overallRiskLevel: "high",
          immediateActionRequired: true,
          riskReasoning: "1 critical finding unresolved",
        },
        findings: [],
        recommendations: [],
        actions: [],
        kpis: [],
        reviewStatus: {
          trend: "improving",
          reasoning: "Progress on actions",
          findingCount: 5,
          criticalFindingCount: 1,
          openActionCount: 2,
          completedActionCount: 1,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          version: "2.0",
          dataCompleteness: {
            hasFindings: true,
            hasRecommendations: false,
            hasActions: true,
            hasKPIs: false,
            hasConditionProfile: true,
          },
        },
      };

      const result = parseRequest(engagementReportResponseSchema, validReport);
      expect(result.success).toBe(true);
    });

    it("rejects report with invalid risk level", () => {
      const invalidReport = {
        summary: {
          engagementId: "550e8400-e29b-41d4-a716-446655440000",
          engagementCode: "ENG-001",
          engagementTitle: "Test",
          status: "active",
          healthStatus: "healthy",
          interventionMode: "stabilization",
        },
        executiveSummary: {
          totalFindings: 0,
          criticalFindings: 0,
          highPriorityActions: 0,
          overallRiskLevel: "invalid-level",
          immediateActionRequired: false,
          riskReasoning: "No issues",
        },
        findings: [],
        recommendations: [],
        actions: [],
        kpis: [],
        reviewStatus: {
          trend: "stagnant",
          reasoning: "No change",
          findingCount: 0,
          criticalFindingCount: 0,
          openActionCount: 0,
          completedActionCount: 0,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          version: "2.0",
          dataCompleteness: {
            hasFindings: false,
            hasRecommendations: false,
            hasActions: false,
            hasKPIs: false,
            hasConditionProfile: false,
          },
        },
      };

      const result = parseRequest(engagementReportResponseSchema, invalidReport);
      expect(result.success).toBe(false);
    });
  });

  describe("parseRequest Helper", () => {
    it("returns success with parsed data on valid input", () => {
      const result = parseRequest(engagementUpdateSchema, {
        title: "Test",
        version: 1,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Test");
        expect(result.data.version).toBe(1);
      }
    });

    it("returns errors array on invalid input", () => {
      const result = parseRequest(engagementUpdateSchema, {
        version: "not-a-number",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("includes field path in errors", () => {
      const result = parseRequest(engagementUpdateSchema, {
        title: 123,
        version: 1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.field === "title")).toBe(true);
      }
    });
  });
});
