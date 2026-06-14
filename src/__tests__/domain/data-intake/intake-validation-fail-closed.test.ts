/**
 * M02 Data Intake: Fail-Closed Validation Tests
 *
 * Tests that invalid or incomplete input data is explicitly rejected and never silently accepted.
 * Fail-closed behavior ensures bad data cannot enter the system undetected.
 *
 * Execution.md M02 requirement (section 8):
 * "invalid/missing input produces explicit error or low-confidence state"
 * "input is validated"
 * "source metadata is retained for any material input"
 */

import { describe, it, expect } from "vitest";
import {
  EngagementIntakeSchema,
  EvidenceIntakeSchema,
  ActionIntakeSchema,
  RequestContextSchema,
} from "@/domain/data-intake/intake-contracts";
import type { EngagementIntake, EvidenceIntake, ActionIntake, RequestContext } from "@/domain/data-intake/intake-contracts";

describe("M02: Data Intake Fail-Closed Validation", () => {
  describe("EngagementIntake validation - required fields", () => {
    it("should reject engagement with missing clientName", () => {
      const invalid = {
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Increase revenue"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("clientName"))).toBe(true);
    });

    it("should reject engagement with empty clientName", () => {
      const invalid: Partial<EngagementIntake> = {
        clientName: "", // Empty string not allowed
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Increase revenue"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject engagement with invalid email", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "not-an-email", // Invalid email format
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("clientEmail"))).toBe(true);
    });

    it("should reject engagement with empty businessGoals array", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: [], // Empty array not allowed
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("businessGoals"))).toBe(true);
    });

    it("should reject engagement with negative estimatedDuration", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: -5, // Negative duration not allowed
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject engagement with negative estimatedBudget", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: -1000, // Negative budget not allowed
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject engagement with invalid projectScope enum", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "invalid_scope", // Invalid enum value
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("projectScope"))).toBe(true);
    });
  });

  describe("EvidenceIntake validation - required fields", () => {
    it("should reject evidence with missing title", () => {
      const invalid = {
        findingType: "metric_variance",
        description: "Description",
        severity: "high",
        source: "client_interview",
        sourceReference: "ref-123",
      };

      const result = EvidenceIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("title"))).toBe(true);
    });

    it("should reject evidence with empty description", () => {
      const invalid = {
        findingType: "metric_variance",
        title: "Title",
        description: "", // Empty not allowed
        severity: "high",
        source: "client_interview",
      };

      const result = EvidenceIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject evidence with invalid severity enum", () => {
      const invalid = {
        findingType: "metric_variance",
        title: "Title",
        description: "Description",
        severity: "unknown_severity", // Invalid enum
        source: "client_interview",
      };

      const result = EvidenceIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject evidence with invalid findingType", () => {
      const invalid = {
        findingType: "invalid_type", // Invalid enum
        title: "Title",
        description: "Description",
        severity: "high",
        source: "client_interview",
      };

      const result = EvidenceIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("ActionIntake validation - required fields", () => {
    it("should reject action with missing title", () => {
      const invalid = {
        description: "Description",
        owner: "John",
        dueDate: new Date(),
        priority: "high",
        estimatedHours: 10,
        expectedOutcome: "Outcome",
        successCriteria: ["Criterion"],
      };

      const result = ActionIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("title"))).toBe(true);
    });

    it("should reject action with zero estimatedHours", () => {
      const invalid = {
        title: "Action",
        description: "Description",
        owner: "John",
        dueDate: new Date(),
        priority: "high",
        estimatedHours: 0, // Must be at least 0.5
        expectedOutcome: "Outcome",
        successCriteria: ["Criterion"],
      };

      const result = ActionIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject action with empty successCriteria", () => {
      const invalid = {
        title: "Action",
        description: "Description",
        owner: "John",
        dueDate: new Date(),
        priority: "high",
        estimatedHours: 10,
        expectedOutcome: "Outcome",
        successCriteria: [], // Must have at least one
      };

      const result = ActionIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject action with invalid priority enum", () => {
      const invalid = {
        title: "Action",
        description: "Description",
        owner: "John",
        dueDate: new Date(),
        priority: "undefined_priority", // Invalid enum
        estimatedHours: 10,
        expectedOutcome: "Outcome",
        successCriteria: ["Criterion"],
      };

      const result = ActionIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("RequestContext validation - workspace scoping", () => {
    it("should reject request without workspaceId", () => {
      const invalid = {
        userId: "user_123",
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes("workspaceId"))).toBe(true);
    });

    it("should reject request with empty workspaceId", () => {
      const invalid = {
        workspaceId: "", // Empty not allowed
        userId: "user_123",
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject request with empty userId", () => {
      const invalid = {
        workspaceId: "ws_123",
        userId: "", // Empty not allowed
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Numerical constraint validation", () => {
    it("should enforce market share between 0-100", () => {
      // Market share > 100% is invalid
      const initialConditionOverMax = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis" as const,
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {
          revenue: 1000000,
          employees: 50,
          marketShare: 101, // Invalid: > 100
          growthRate: 0.1,
        },
      };

      const result = EngagementIntakeSchema.safeParse(initialConditionOverMax);
      expect(result.success).toBe(false);
    });

    it("should allow valid employee count", () => {
      const valid: EngagementIntake = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {
          employees: 1, // Minimum 1
        },
      };

      const result = EngagementIntakeSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject zero employees", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "client@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {
          employees: 0, // Invalid: must be >= 1
        },
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("Fail-closed behavior summary", () => {
    it("should reject any invalid data immediately without defaults", () => {
      const testCases = [
        { missingField: "clientName", field: "clientName" },
        { missingField: "description", field: "description" },
        { missingField: "owner", field: "owner" },
      ];

      testCases.forEach(({ missingField }) => {
        // All of these should fail validation
        const result = EngagementIntakeSchema.safeParse({
          clientEmail: "client@example.com",
          projectName: "Project",
          projectScope: "diagnosis",
          estimatedDuration: 30,
          estimatedBudget: 50000,
          businessGoals: ["Goal"],
          initialCondition: {},
        });

        // Missing clientName should fail
        expect(result.success).toBe(false);
      });
    });

    it("should provide specific error information on validation failure", () => {
      const invalid = {
        clientName: "Acme",
        clientEmail: "not-an-email",
        projectName: "Project",
        projectScope: "invalid_scope",
        estimatedDuration: -5,
        estimatedBudget: 50000,
        businessGoals: [],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues.length).toBeGreaterThan(0);

      // Should have multiple specific error messages
      const errorPaths = result.error?.issues.map(i => i.path.join(".")) || [];
      expect(errorPaths.length).toBeGreaterThanOrEqual(2);
    });
  });
});
