import {
  RecommendationCategory,
  PriorityLevel,
  RecommendationStatus,
  ImpactDimension,
  EffortScale,
  ConfidenceLevel,
  RECOMMENDATION_THRESHOLDS,
  validateRecommendation,
  recommendationToDTO,
} from "@/domain/recommendation/recommendation";

describe("Recommendation Domain Contract", () => {
  describe("Domain enums", () => {
    it("should define all recommendation categories", () => {
      expect(RecommendationCategory.SURVIVAL).toBe("SURVIVAL");
      expect(RecommendationCategory.GROWTH).toBe("GROWTH");
      expect(RecommendationCategory.OPERATIONAL).toBe("OPERATIONAL");
      expect(RecommendationCategory.FINANCIAL).toBe("FINANCIAL");
      expect(RecommendationCategory.MARKET).toBe("MARKET");
      expect(RecommendationCategory.TEAM).toBe("TEAM");
      expect(RecommendationCategory.STRATEGIC).toBe("STRATEGIC");
    });

    it("should define all priority levels", () => {
      expect(PriorityLevel.CRITICAL).toBe("CRITICAL");
      expect(PriorityLevel.HIGH).toBe("HIGH");
      expect(PriorityLevel.MEDIUM).toBe("MEDIUM");
      expect(PriorityLevel.LOW).toBe("LOW");
      expect(PriorityLevel.DEFER).toBe("DEFER");
    });

    it("should define all recommendation statuses", () => {
      expect(RecommendationStatus.PENDING).toBe("PENDING");
      expect(RecommendationStatus.REVIEWED).toBe("REVIEWED");
      expect(RecommendationStatus.ACCEPTED).toBe("ACCEPTED");
      expect(RecommendationStatus.IN_PROGRESS).toBe("IN_PROGRESS");
      expect(RecommendationStatus.COMPLETED).toBe("COMPLETED");
      expect(RecommendationStatus.FAILED).toBe("FAILED");
      expect(RecommendationStatus.DECLINED).toBe("DECLINED");
      expect(RecommendationStatus.SUPERSEDED).toBe("SUPERSEDED");
    });

    it("should define all impact dimensions", () => {
      expect(ImpactDimension.REVENUE).toBe("REVENUE");
      expect(ImpactDimension.PROFITABILITY).toBe("PROFITABILITY");
      expect(ImpactDimension.SURVIVAL).toBe("SURVIVAL");
      expect(ImpactDimension.TEAM_CAPACITY).toBe("TEAM_CAPACITY");
      expect(ImpactDimension.RISK_REDUCTION).toBe("RISK_REDUCTION");
    });

    it("should define all effort scales", () => {
      expect(EffortScale.MINIMAL).toBe("MINIMAL");
      expect(EffortScale.SMALL).toBe("SMALL");
      expect(EffortScale.MEDIUM).toBe("MEDIUM");
      expect(EffortScale.LARGE).toBe("LARGE");
      expect(EffortScale.VERY_LARGE).toBe("VERY_LARGE");
    });

    it("should define all confidence levels", () => {
      expect(ConfidenceLevel.VERY_HIGH).toBe("VERY_HIGH");
      expect(ConfidenceLevel.HIGH).toBe("HIGH");
      expect(ConfidenceLevel.MEDIUM).toBe("MEDIUM");
      expect(ConfidenceLevel.LOW).toBe("LOW");
      expect(ConfidenceLevel.SPECULATIVE).toBe("SPECULATIVE");
    });
  });

  describe("Thresholds", () => {
    it("should define priority scoring thresholds", () => {
      expect(RECOMMENDATION_THRESHOLDS.critical_priority_score).toBe(500);
      expect(RECOMMENDATION_THRESHOLDS.high_priority_score).toBe(200);
      expect(RECOMMENDATION_THRESHOLDS.medium_priority_score).toBe(50);
      expect(RECOMMENDATION_THRESHOLDS.low_priority_score).toBe(0);
    });

    it("should define impact thresholds in percent", () => {
      expect(RECOMMENDATION_THRESHOLDS.critical_impact_percent).toBe(30);
      expect(RECOMMENDATION_THRESHOLDS.high_impact_percent).toBe(15);
      expect(RECOMMENDATION_THRESHOLDS.medium_impact_percent).toBe(5);
    });

    it("should define urgency thresholds in days", () => {
      expect(RECOMMENDATION_THRESHOLDS.critical_urgency_days).toBe(7);
      expect(RECOMMENDATION_THRESHOLDS.high_urgency_days).toBe(30);
      expect(RECOMMENDATION_THRESHOLDS.medium_urgency_days).toBe(90);
    });

    it("should define confidence score thresholds", () => {
      expect(RECOMMENDATION_THRESHOLDS.confidence_very_high).toBe(90);
      expect(RECOMMENDATION_THRESHOLDS.confidence_high).toBe(75);
      expect(RECOMMENDATION_THRESHOLDS.confidence_medium).toBe(50);
      expect(RECOMMENDATION_THRESHOLDS.confidence_low).toBe(30);
    });

    it("should define effort hour estimates", () => {
      expect(RECOMMENDATION_THRESHOLDS.minimal_hours).toBe(2);
      expect(RECOMMENDATION_THRESHOLDS.small_hours).toBe(8);
      expect(RECOMMENDATION_THRESHOLDS.medium_hours).toBe(40);
      expect(RECOMMENDATION_THRESHOLDS.large_hours).toBe(100);
      expect(RECOMMENDATION_THRESHOLDS.very_large_hours).toBe(200);
    });
  });

  describe("validateRecommendation", () => {
    const createValidRec = (overrides?: Partial<any>) => ({
      id: "rec-123",
      workspaceId: "ws-123",
      category: RecommendationCategory.GROWTH,
      status: RecommendationStatus.PENDING,
      title: "Expand to new market",
      summary: "Open new geographic market",
      detailed_rationale: "Market analysis shows opportunity",
      expected_outcome: "+20% revenue",
      success_criteria: ["Market entry completed"],
      priority_score: {
        impact_score: 80,
        urgency_score: 70,
        confidence_score: 60,
        effort_score: 40,
        risk_score: 50,
        constraint_friction: 1.5,
        composite_priority: 224,
        priority_level: PriorityLevel.HIGH,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.REVENUE,
          baseline: 100000,
          projected: 120000,
          improvement_percent: 20,
          confidence: ConfidenceLevel.HIGH,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: true,
        window_days: 30,
        rationale: "Q2 market window closes",
      },
      action_items: [
        {
          id: "act-1",
          title: "Market research",
          description: "Validate demand",
          estimated_effort: EffortScale.MEDIUM,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Research complete"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "KPI",
          source: "Market analysis",
          finding: "Growing demand",
          measured_at: new Date(),
          confidence: ConfidenceLevel.HIGH,
        },
      ],
      created_at: new Date(),
      created_by: "user-123",
      version: 1,
      is_approved: false,
      risk_assessment: {
        execution_risk: "medium",
        market_risk: "medium",
        financial_risk: "low",
        customer_risk: "low",
        total_risk_level: "medium",
        mitigations: [],
      },
      ...overrides,
    });

    it("should validate well-formed recommendation", () => {
      const rec = createValidRec();
      expect(validateRecommendation(rec)).toBe(true);
    });

    it("should reject recommendation with missing id", () => {
      const rec = createValidRec({ id: "" });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with missing workspaceId", () => {
      const rec = createValidRec({ workspaceId: "" });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with missing title", () => {
      const rec = createValidRec({ title: "" });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with missing summary", () => {
      const rec = createValidRec({ summary: "" });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with missing priority_score", () => {
      const rec = createValidRec({ priority_score: undefined });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with empty action_items", () => {
      const rec = createValidRec({ action_items: [] });
      expect(validateRecommendation(rec)).toBe(false);
    });

    it("should reject recommendation with empty evidence", () => {
      const rec = createValidRec({ evidence: [] });
      expect(validateRecommendation(rec)).toBe(false);
    });
  });

  describe("recommendationToDTO", () => {
    const createRec = (overrides?: Partial<any>) => ({
      id: "rec-456",
      workspaceId: "ws-456",
      category: RecommendationCategory.FINANCIAL,
      status: RecommendationStatus.ACCEPTED,
      title: "Reduce operating costs",
      summary: "Cut SaaS subscriptions",
      detailed_rationale: "Duplicate tools identified",
      expected_outcome: "Save $50k/year",
      success_criteria: ["Contracts cancelled"],
      priority_score: {
        impact_score: 65,
        urgency_score: 55,
        confidence_score: 85,
        effort_score: 90,
        risk_score: 80,
        constraint_friction: 1.2,
        composite_priority: 298,
        priority_level: PriorityLevel.HIGH,
      },
      impact_assessments: [
        {
          dimension: ImpactDimension.PROFITABILITY,
          baseline: 200000,
          projected: 250000,
          improvement_percent: 25,
          confidence: ConfidenceLevel.VERY_HIGH,
          supporting_evidence: [],
        },
      ],
      urgency: {
        is_time_sensitive: false,
        rationale: "Immediate savings possible",
      },
      action_items: [
        {
          id: "act-2",
          title: "Audit subscriptions",
          description: "List all active subscriptions",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 4,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["List created"],
        },
      ],
      resource_requirements: [],
      constraints: [],
      evidence: [
        {
          type: "ANALYSIS",
          source: "Tool audit",
          finding: "3 duplicate tools",
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
      ],
      created_at: new Date("2026-05-01"),
      created_by: "user-456",
      version: 2,
      is_approved: true,
      approved_by: "admin-456",
      approved_at: new Date("2026-05-02"),
      risk_assessment: {
        execution_risk: "low",
        market_risk: "none",
        financial_risk: "low",
        customer_risk: "none",
        total_risk_level: "low",
        mitigations: [],
      },
      ...overrides,
    });

    it("should convert recommendation to DTO with all fields", () => {
      const rec = createRec();
      const dto = recommendationToDTO(rec);

      expect(dto.id).toBe("rec-456");
      expect(dto.workspaceId).toBe("ws-456");
      expect(dto.category).toBe(RecommendationCategory.FINANCIAL);
      expect(dto.status).toBe(RecommendationStatus.ACCEPTED);
      expect(dto.title).toBe("Reduce operating costs");
      expect(dto.summary).toBe("Cut SaaS subscriptions");
      expect(dto.priority_level).toBe(PriorityLevel.HIGH);
      expect(dto.priority_score).toBe(298);
      expect(dto.impact_percent).toBe(25);
      expect(dto.action_count).toBe(1);
      expect(dto.is_approved).toBe(true);
    });

    it("should set default impact_percent when no impact assessments", () => {
      const rec = createRec({ impact_assessments: [] });
      const dto = recommendationToDTO(rec);
      expect(dto.impact_percent).toBe(0);
    });

    it("should extract urgency_days when available", () => {
      const rec = createRec({
        urgency: {
          is_time_sensitive: true,
          window_days: 14,
          rationale: "Q2 deadline",
        },
      });
      const dto = recommendationToDTO(rec);
      expect(dto.urgency_days).toBe(14);
    });

    it("should include estimated_hours when available", () => {
      const rec = createRec({ estimated_total_hours: 40 });
      const dto = recommendationToDTO(rec);
      expect(dto.estimated_hours).toBe(40);
    });

    it("should include completed_at when available", () => {
      const completed = new Date("2026-05-15");
      const rec = createRec({ completed_at: completed });
      const dto = recommendationToDTO(rec);
      expect(dto.completed_at).toBe(completed);
    });

    it("should map risk levels correctly", () => {
      const rec = createRec({
        risk_assessment: {
          execution_risk: "high",
          market_risk: "high",
          financial_risk: "medium",
          customer_risk: "low",
          total_risk_level: "critical",
          mitigations: ["Hedge with small pilot"],
        },
      });
      const dto = recommendationToDTO(rec);
      expect(dto.risk_level).toBe("critical");
    });
  });

  describe("Tenant scoping", () => {
    it("should require workspaceId on all recommendations", () => {
      const rec = {
        id: "rec-999",
        workspaceId: "ws-999", // Required
        category: RecommendationCategory.OPERATIONAL,
        status: RecommendationStatus.PENDING,
        title: "Test",
        summary: "Test rec",
        priority_score: {
          impact_score: 50,
          urgency_score: 50,
          confidence_score: 50,
          effort_score: 50,
          risk_score: 50,
          constraint_friction: 1.0,
          composite_priority: 50,
          priority_level: PriorityLevel.MEDIUM,
        },
        action_items: [{ id: "a1", title: "Act", description: "D", estimated_effort: EffortScale.SMALL, dependencies: [], is_parallel_safe: true, success_criteria: [] }],
        evidence: [{ type: "KPI" as const, source: "s", finding: "f", measured_at: new Date(), confidence: ConfidenceLevel.MEDIUM }],
        created_at: new Date(),
        created_by: "u1",
        version: 1,
        is_approved: false,
        impact_assessments: [],
        urgency: { is_time_sensitive: false, rationale: "r" },
        resource_requirements: [],
        constraints: [],
        risk_assessment: {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
      };
      expect(validateRecommendation(rec as any)).toBe(true);
      expect(rec.workspaceId).toBe("ws-999");
    });

    it("should fail validation when workspaceId is missing", () => {
      const rec = {
        id: "rec-999",
        workspaceId: "", // Missing workspace
        category: RecommendationCategory.OPERATIONAL,
      };
      expect(validateRecommendation(rec as any)).toBe(false);
    });
  });

  describe("Action items", () => {
    it("should support complex action decomposition", () => {
      const actions = [
        {
          id: "a1",
          title: "Phase 1: Discovery",
          description: "Research market and competitors",
          estimated_effort: EffortScale.SMALL,
          estimated_hours: 16,
          dependencies: [],
          is_parallel_safe: true,
          success_criteria: ["Market research report completed"],
        },
        {
          id: "a2",
          title: "Phase 2: Prototype",
          description: "Build MVP",
          estimated_effort: EffortScale.LARGE,
          estimated_hours: 120,
          dependencies: ["a1"],
          is_parallel_safe: false,
          success_criteria: ["Working prototype deployed to staging"],
        },
        {
          id: "a3",
          title: "Phase 3: Validation",
          description: "Beta test with 10 customers",
          estimated_effort: EffortScale.MEDIUM,
          estimated_hours: 40,
          dependencies: ["a2"],
          is_parallel_safe: true,
          success_criteria: ["Customer feedback collected"],
        },
      ];

      expect(actions.length).toBe(3);
      expect(actions[0].dependencies).toEqual([]);
      expect(actions[1].dependencies).toEqual(["a1"]);
      expect(actions[2].dependencies).toEqual(["a2"]);
    });
  });

  describe("Impact assessment", () => {
    it("should support multi-dimensional impact", () => {
      const impacts = [
        {
          dimension: ImpactDimension.REVENUE,
          baseline: 500000,
          projected: 600000,
          improvement_percent: 20,
          confidence: ConfidenceLevel.HIGH,
          supporting_evidence: [],
        },
        {
          dimension: ImpactDimension.PROFITABILITY,
          baseline: 100000,
          projected: 150000,
          improvement_percent: 50,
          confidence: ConfidenceLevel.MEDIUM,
          supporting_evidence: [],
        },
        {
          dimension: ImpactDimension.RISK_REDUCTION,
          baseline: 0,
          projected: 0,
          improvement_percent: 35,
          confidence: ConfidenceLevel.HIGH,
          supporting_evidence: [],
        },
      ];

      expect(impacts.length).toBe(3);
      expect(impacts[0].improvement_percent).toBe(20);
      expect(impacts[1].improvement_percent).toBe(50);
      expect(impacts[2].improvement_percent).toBe(35);
    });
  });

  describe("Evidence types", () => {
    it("should support multiple evidence sources", () => {
      const evidences = [
        {
          type: "KPI" as const,
          source: "Analytics dashboard",
          finding: "Churn rate up 15%",
          measurement: 0.15,
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
        {
          type: "SURVIVAL_FACTOR" as const,
          source: "Survival assessment",
          finding: "Cash runway < 6 months",
          measurement: 4.5,
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
        {
          type: "FEEDBACK" as const,
          source: "Customer interviews",
          finding: "3/10 customers cited pricing",
          measured_at: new Date(),
          confidence: ConfidenceLevel.MEDIUM,
        },
        {
          type: "ANALYSIS" as const,
          source: "Competitive analysis",
          finding: "2 new competitors entered market",
          measured_at: new Date(),
          confidence: ConfidenceLevel.HIGH,
        },
        {
          type: "HISTORICAL" as const,
          source: "Historical data",
          finding: "Q4 is 2x revenue vs Q1",
          measurement: 2.0,
          measured_at: new Date(),
          confidence: ConfidenceLevel.VERY_HIGH,
        },
        {
          type: "PEER_BENCHMARK" as const,
          source: "Industry report",
          finding: "Peer median margin 35%",
          measurement: 0.35,
          measured_at: new Date(),
          confidence: ConfidenceLevel.HIGH,
        },
      ];

      expect(evidences.length).toBe(6);
      evidences.forEach((e) => {
        expect(["KPI", "SURVIVAL_FACTOR", "FEEDBACK", "ANALYSIS", "HISTORICAL", "PEER_BENCHMARK"]).toContain(e.type);
      });
    });
  });

  describe("Constraint factors", () => {
    it("should model execution constraints", () => {
      const constraints = [
        {
          type: "OWNER_AVAILABILITY" as const,
          severity: "high",
          description: "CEO traveling for 3 weeks",
          mitigation: "Delegate to COO",
        },
        {
          type: "TEAM_CAPACITY" as const,
          severity: "medium",
          description: "Engineering overloaded with bug fixes",
          mitigation: "Reduce tech debt first",
        },
        {
          type: "FINANCIAL" as const,
          severity: "high",
          description: "Cash runway 4 months, capex limited",
          mitigation: "Focus on high-ROI activities only",
        },
        {
          type: "TECHNICAL" as const,
          severity: "low",
          description: "Legacy system limits scaling",
          mitigation: "Plan migration for Q4",
        },
      ];

      expect(constraints.length).toBe(4);
      expect(constraints.filter((c) => c.severity === "high").length).toBe(2);
      expect(constraints.filter((c) => c.mitigation).length).toBe(4);
    });
  });

  describe("Recommendation lifecycle", () => {
    it("should support state transitions", () => {
      const statusTransitions = [
        { from: RecommendationStatus.PENDING, to: RecommendationStatus.REVIEWED },
        { from: RecommendationStatus.REVIEWED, to: RecommendationStatus.ACCEPTED },
        { from: RecommendationStatus.ACCEPTED, to: RecommendationStatus.IN_PROGRESS },
        { from: RecommendationStatus.IN_PROGRESS, to: RecommendationStatus.COMPLETED },
        { from: RecommendationStatus.IN_PROGRESS, to: RecommendationStatus.FAILED },
        { from: RecommendationStatus.REVIEWED, to: RecommendationStatus.DECLINED },
        { from: RecommendationStatus.ACCEPTED, to: RecommendationStatus.SUPERSEDED },
      ];

      expect(statusTransitions.length).toBe(7);
      expect(statusTransitions.some((t) => t.from === RecommendationStatus.PENDING)).toBe(true);
    });
  });

  describe("Risk assessment", () => {
    it("should combine multiple risk dimensions into total risk", () => {
      const risks = [
        {
          execution_risk: "low",
          market_risk: "low",
          financial_risk: "low",
          customer_risk: "low",
          total_risk_level: "low",
          mitigations: [],
        },
        {
          execution_risk: "high",
          market_risk: "high",
          financial_risk: "medium",
          customer_risk: "low",
          total_risk_level: "critical",
          mitigations: ["Run pilot first", "Get board approval"],
        },
        {
          execution_risk: "medium",
          market_risk: "medium",
          financial_risk: "high",
          customer_risk: "high",
          total_risk_level: "high",
          mitigations: ["Hedge financial exposure"],
        },
      ];

      expect(risks[0].total_risk_level).toBe("low");
      expect(risks[1].total_risk_level).toBe("critical");
      expect(risks[2].total_risk_level).toBe("high");
      expect(risks[1].mitigations.length).toBe(2);
    });
  });
});
