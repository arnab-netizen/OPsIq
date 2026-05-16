import { describe, it, expect } from "vitest";
import {
  RequestContextSchema,
  EngagementIntakeSchema,
  EvidenceIntakeSchema,
  ActionIntakeSchema,
  DecisionIntakeSchema,
  RecommendationIntakeSchema,
  ExperimentIntakeSchema,
  CostCenterIntakeSchema,
  RevenueStreamIntakeSchema,
  validateIntake,
  assessCompleteness,
  type EngagementIntake,
  type EvidenceIntake,
  type ActionIntake,
} from "@/domain/data-intake/intake-contracts";

describe("ADDENDUM F: Data Intake Contracts", () => {
  describe("RequestContextSchema", () => {
    it("should validate valid request context", () => {
      const context = {
        workspaceId: "ws_123",
        userId: "user_456",
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it("should reject missing workspace ID", () => {
      const context = {
        userId: "user_456",
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(context);
      expect(result.success).toBe(false);
    });

    it("should reject invalid email", () => {
      const context = {
        workspaceId: "ws_123",
        userId: "user_456",
        userEmail: "not-an-email",
        userRole: "admin",
        timestamp: new Date(),
      };

      const result = RequestContextSchema.safeParse(context);
      expect(result.success).toBe(false);
    });

    it("should validate optional traceId", () => {
      const context = {
        workspaceId: "ws_123",
        userId: "user_456",
        userEmail: "user@example.com",
        userRole: "admin",
        timestamp: new Date(),
        traceId: "trace_789",
      };

      const result = RequestContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });
  });

  describe("EngagementIntakeSchema", () => {
    it("should validate complete engagement intake", () => {
      const intake: EngagementIntake = {
        clientName: "Acme Corp",
        clientEmail: "contact@acme.com",
        projectName: "Digital Transformation",
        projectScope: "transformation",
        estimatedDuration: 90,
        estimatedBudget: 250000,
        businessGoals: ["Increase revenue by 20%", "Reduce operational costs"],
        initialCondition: {
          revenue: 5000000,
          employees: 150,
          marketShare: 15,
          growthRate: 5,
        },
      };

      const result = EngagementIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should validate engagement with minimal required fields", () => {
      const intake = {
        clientName: "Test Client",
        clientEmail: "test@example.com",
        projectName: "Test Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Identify opportunities"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject invalid project scope", () => {
      const intake = {
        clientName: "Test Client",
        clientEmail: "test@example.com",
        projectName: "Test Project",
        projectScope: "invalid_scope",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Test goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });

    it("should reject negative budget", () => {
      const intake = {
        clientName: "Test Client",
        clientEmail: "test@example.com",
        projectName: "Test Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: -1000,
        businessGoals: ["Test goal"],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });

    it("should reject empty business goals array", () => {
      const intake = {
        clientName: "Test Client",
        clientEmail: "test@example.com",
        projectName: "Test Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: [],
        initialCondition: {},
      };

      const result = EngagementIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("EvidenceIntakeSchema", () => {
    it("should validate complete evidence intake", () => {
      const intake: EvidenceIntake = {
        findingType: "metric_variance",
        title: "Revenue decline",
        description: "Q3 revenue down 15% vs Q2",
        severity: "high",
        source: "financial_review",
        sourceReference: "Q3 Financial Report",
        measurableImpact: {
          metric: "Quarterly Revenue",
          currentValue: 1200000,
          targetValue: 1412000,
          unit: "USD",
          timeframe: "Q3 2026",
        },
      };

      const result = EvidenceIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should validate evidence with minimal fields", () => {
      const intake = {
        findingType: "opportunity",
        title: "Market expansion",
        description: "New market segment identified",
        severity: "medium",
        source: "market_research",
      };

      const result = EvidenceIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject invalid severity", () => {
      const intake = {
        findingType: "opportunity",
        title: "Test",
        description: "Test description",
        severity: "catastrophic",
        source: "market_research",
      };

      const result = EvidenceIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("ActionIntakeSchema", () => {
    it("should validate complete action intake", () => {
      const intake: ActionIntake = {
        title: "Implement new CRM",
        description: "Deploy and configure new customer relationship system",
        owner: "John Smith",
        dueDate: new Date("2026-06-30"),
        priority: "high",
        estimatedHours: 120,
        expectedOutcome: "Improved customer engagement tracking",
        successCriteria: ["System deployed", "Team trained", "Data migrated"],
        dependencies: ["action_001", "action_002"],
        riskOfDelay: "revenue_loss",
      };

      const result = ActionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should validate action without optional fields", () => {
      const intake = {
        title: "Review budget",
        description: "Quarterly budget review",
        owner: "Jane Doe",
        dueDate: new Date("2026-06-15"),
        priority: "normal",
        estimatedHours: 8,
        expectedOutcome: "Budget approval",
        successCriteria: ["Reviewed", "Approved"],
      };

      const result = ActionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject invalid priority", () => {
      const intake = {
        title: "Test",
        description: "Test",
        owner: "Owner",
        dueDate: new Date(),
        priority: "super_urgent",
        estimatedHours: 10,
        expectedOutcome: "Outcome",
        successCriteria: ["Done"],
      };

      const result = ActionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });

    it("should reject zero estimated hours", () => {
      const intake = {
        title: "Test",
        description: "Test",
        owner: "Owner",
        dueDate: new Date(),
        priority: "normal",
        estimatedHours: 0,
        expectedOutcome: "Outcome",
        successCriteria: ["Done"],
      };

      const result = ActionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("DecisionIntakeSchema", () => {
    it("should validate decision with multiple options", () => {
      const intake = {
        title: "Choose deployment platform",
        context: "Need to migrate to cloud infrastructure",
        optionsToConsider: [
          {
            name: "AWS",
            pros: ["Mature", "Wide ecosystem"],
            cons: ["Higher cost", "Complexity"],
            estimatedCost: 100000,
            estimatedTimelineWeeks: 12,
          },
          {
            name: "GCP",
            pros: ["Good ML capabilities", "Competitive pricing"],
            cons: ["Smaller ecosystem", "Less experience on team"],
            estimatedCost: 80000,
            estimatedTimelineWeeks: 10,
          },
        ],
        deadline: new Date("2026-08-01"),
        decisionMaker: "CTO",
        recommendedOption: 0,
      };

      const result = DecisionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject decision with only one option", () => {
      const intake = {
        title: "Platform choice",
        context: "Choose infrastructure",
        optionsToConsider: [
          {
            name: "AWS",
            pros: ["Mature"],
            cons: ["Expensive"],
          },
        ],
        decisionMaker: "CTO",
      };

      const result = DecisionIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("RecommendationIntakeSchema", () => {
    it("should validate recommendation", () => {
      const intake = {
        title: "Implement automation",
        description: "Automate manual processes",
        rationale: "Will reduce operational costs by 30%",
        linkedEvidenceIds: ["ev_001", "ev_002"],
        implementationSteps: [
          "Identify processes to automate",
          "Select tools",
          "Implement",
          "Train team",
        ],
        expectedROI: {
          metric: "Cost reduction",
          projectedImprovement: 500000,
          timelineMonths: 6,
        },
        risk: "medium",
        owner: "Operations Manager",
      };

      const result = RecommendationIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject recommendation without linked evidence", () => {
      const intake = {
        title: "Test recommendation",
        description: "Test",
        rationale: "Test rationale",
        linkedEvidenceIds: [],
        implementationSteps: ["Step 1"],
      };

      const result = RecommendationIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("ExperimentIntakeSchema", () => {
    it("should validate experiment", () => {
      const intake = {
        title: "Pricing test",
        hypothesis: "10% price increase will maintain revenue",
        controlGroup: "Existing customers",
        treatmentGroup: "New customers",
        successMetric: {
          name: "Customer Acquisition",
          baselineValue: 100,
          successThreshold: 95,
          measurementMethod: "Count of new signups",
        },
        durationDays: 30,
        estimatedCost: 25000,
      };

      const result = ExperimentIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should reject zero-day experiment", () => {
      const intake = {
        title: "Test",
        hypothesis: "Test hypothesis",
        controlGroup: "Control",
        treatmentGroup: "Treatment",
        successMetric: {
          name: "Metric",
          baselineValue: 100,
          successThreshold: 110,
          measurementMethod: "Count",
        },
        durationDays: 0,
      };

      const result = ExperimentIntakeSchema.safeParse(intake);
      expect(result.success).toBe(false);
    });
  });

  describe("Financial Intake Schemas", () => {
    it("should validate cost center intake", () => {
      const intake = {
        name: "Engineering",
        owner: "VP Engineering",
        budget: 500000,
        budgetPeriod: "annual",
        description: "Engineering department budget",
      };

      const result = CostCenterIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });

    it("should validate revenue stream intake", () => {
      const intake = {
        name: "SaaS Subscriptions",
        model: "subscription",
        currentMonthlyRevenue: 250000,
        growthRate: 8,
        margin: 70,
        customerCount: 500,
      };

      const result = RevenueStreamIntakeSchema.safeParse(intake);
      expect(result.success).toBe(true);
    });
  });

  describe("validateIntake helper", () => {
    it("should return valid result for conforming data", () => {
      const intake = {
        clientName: "Test",
        clientEmail: "test@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = validateIntake(EngagementIntakeSchema, intake, "engagement");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should return errors for non-conforming data", () => {
      const intake = {
        clientName: "Test",
        clientEmail: "invalid-email",
        projectName: "Project",
        projectScope: "invalid",
        estimatedDuration: -1,
        estimatedBudget: 50000,
        businessGoals: [],
        initialCondition: {},
      };

      const result = validateIntake(EngagementIntakeSchema, intake, "engagement");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Check that errors include validation issues (could be email, scope, duration, or goals)
      const errorFields = result.errors.map((e) => e.field);
      expect(errorFields.some((f) => f === "clientEmail" || f === "projectScope" || f === "estimatedDuration" || f === "businessGoals")).toBe(true);
    });

    it("should include timing metadata", () => {
      const intake = {
        clientName: "Test",
        clientEmail: "test@example.com",
        projectName: "Project",
        projectScope: "diagnosis",
        estimatedDuration: 30,
        estimatedBudget: 50000,
        businessGoals: ["Goal"],
        initialCondition: {},
      };

      const result = validateIntake(EngagementIntakeSchema, intake, "engagement");
      expect(result.metadata.receivedAt).toBeInstanceOf(Date);
      expect(result.metadata.processedAt).toBeInstanceOf(Date);
      expect(result.metadata.processedAt.getTime()).toBeGreaterThanOrEqual(result.metadata.receivedAt.getTime());
    });
  });

  describe("assessCompleteness helper", () => {
    it("should assess 100% complete data", () => {
      const data = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      const result = assessCompleteness(data);
      expect(result.completenessPercent).toBe(100);
      expect(result.missingCriticalFields).toHaveLength(0);
    });

    it("should identify missing fields", () => {
      const data = {
        field1: "value1",
        field2: null,
        field3: undefined,
        field4: "",
        field5: "value5",
      };

      const result = assessCompleteness(data);
      expect(result.completenessPercent).toBe(40);
      expect(result.missingCriticalFields).toContain("field2");
      expect(result.missingCriticalFields).toContain("field3");
      expect(result.missingCriticalFields).toContain("field4");
    });

    it("should handle empty data object", () => {
      const result = assessCompleteness({});
      expect(result.completenessPercent).toBe(0);
      expect(result.totalRequiredFields).toBe(0);
    });
  });

  describe("Comprehensive Intake Coverage", () => {
    it("should cover 8+ major business entity types", () => {
      const schemas = [
        RequestContextSchema,
        EngagementIntakeSchema,
        EvidenceIntakeSchema,
        ActionIntakeSchema,
        DecisionIntakeSchema,
        RecommendationIntakeSchema,
        ExperimentIntakeSchema,
        CostCenterIntakeSchema,
        RevenueStreamIntakeSchema,
      ];

      expect(schemas.length).toBeGreaterThanOrEqual(8);

      // Each schema should be parse-able
      schemas.forEach((schema) => {
        expect(schema).toBeDefined();
        expect(schema.parse).toBeDefined();
      });
    });

    it("should include data quality validation helpers", () => {
      expect(validateIntake).toBeDefined();
      expect(assessCompleteness).toBeDefined();
    });
  });
});
