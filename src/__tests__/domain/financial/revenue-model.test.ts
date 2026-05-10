import {
  RevenueStreamType,
  PricingModelType,
  BillingFrequency,
  RevenueMetricType,
  RevenueModel,
  RevenueComponent,
  RevenueModelDTO,
  REVENUE_MODEL_REQUIREMENTS,
  REVENUE_STREAM_CATEGORIES,
  calculateARRFromMRR,
  calculateMRRFromARR,
  validateComponentHealth,
  validateRevenueModel,
  revenueModelToDTO,
} from "@/domain/financial/revenue-model";

describe("Revenue Model Domain", () => {
  const mockComponent: RevenueComponent = {
    id: "comp-123",
    stream: RevenueStreamType.SUBSCRIPTION,
    metric: RevenueMetricType.MONTHLY_RECURRING_REVENUE,
    metric_name: "Enterprise Subscription MRR",
    current_value: 45000,
    currency: "USD",
    frequency: BillingFrequency.MONTHLY,
    growth_rate_percent: 8,
    churn_rate_percent: 2,
    customer_count: 25,
    last_measured_at: new Date(),
    measurement_confidence: "high",
    workspaceId: "ws-test-xyz",
  };

  const mockModel: RevenueModel = {
    id: "model-123",
    workspaceId: "ws-test-xyz",
    name: "FY2026 Revenue Model",
    description: "Q1 2026 revenue baseline",
    model_as_of: new Date(),
    last_updated_at: new Date(),
    updated_by: "user-456",

    streams: [RevenueStreamType.SUBSCRIPTION, RevenueStreamType.PROFESSIONAL_SERVICES],
    components: [
      mockComponent,
      {
        ...mockComponent,
        id: "comp-124",
        stream: RevenueStreamType.PROFESSIONAL_SERVICES,
        metric: RevenueMetricType.TOTAL_CONTRACT_VALUE,
        metric_name: "Services TCV",
        current_value: 12000,
        frequency: BillingFrequency.ONE_TIME,
        customer_count: 4,
      },
    ],

    pricing_models: {
      [RevenueStreamType.SUBSCRIPTION]: {
        id: "pm-sub-1",
        type: PricingModelType.TIERED,
        base_price: 299,
        tiers: [
          { name: "Starter", price_per_unit: 299, max_units: 50, annual_discount_percent: 10 },
          { name: "Professional", price_per_unit: 799, min_units: 51, max_units: 200, annual_discount_percent: 15 },
          { name: "Enterprise", price_per_unit: 1500, min_units: 201, annual_discount_percent: 20 },
        ],
      },
      [RevenueStreamType.PROFESSIONAL_SERVICES]: {
        id: "pm-svc-1",
        type: PricingModelType.VALUE_BASED,
        base_price: 3000,
        description: "Per engagement",
      },
      [RevenueStreamType.PRODUCT_SALE]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.LICENSE]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.RECURRING_SERVICE]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.IMPLEMENTATION]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.USAGE_BASED]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.TRANSACTION_FEE]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.COMMISSION]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.MARKETPLACE_LISTING]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.MARKETPLACE_REVENUE_SHARE]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.PARTNERSHIPS]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
      [RevenueStreamType.OTHER]: {
        id: "pm-unused",
        type: PricingModelType.FLAT_RATE,
      },
    },

    metrics: {
      total_mrr: 57000,
      total_arr: 684000,
      currency: "USD",
      avg_customer_value: 2280,
      active_customer_count: 29,
      blended_growth_rate_percent: 6.5,
      blended_churn_rate_percent: 2,
    },

    projections: {
      next_month_estimated_revenue: 59000,
      next_quarter_estimated_revenue: 173000,
      next_year_estimated_revenue: 727000,
      confidence_level: "high",
    },

    version: 1,
    is_approved: true,
    approved_by: "user-789",
    approved_at: new Date(),
  };

  describe("Revenue Stream Types", () => {
    it("should have all revenue stream types", () => {
      expect(RevenueStreamType.SUBSCRIPTION).toBe("SUBSCRIPTION");
      expect(RevenueStreamType.PRODUCT_SALE).toBe("PRODUCT_SALE");
      expect(RevenueStreamType.USAGE_BASED).toBe("USAGE_BASED");
      expect(RevenueStreamType.COMMISSION).toBe("COMMISSION");
    });

    it("should categorize streams correctly", () => {
      expect(REVENUE_STREAM_CATEGORIES[RevenueStreamType.SUBSCRIPTION]).toBe("recurring");
      expect(REVENUE_STREAM_CATEGORIES[RevenueStreamType.PROFESSIONAL_SERVICES]).toBe("one_time");
      expect(REVENUE_STREAM_CATEGORIES[RevenueStreamType.USAGE_BASED]).toBe("variable");
    });
  });

  describe("Pricing Models", () => {
    it("should support flat rate pricing", () => {
      const model = mockModel.pricing_models[RevenueStreamType.PRODUCT_SALE];
      expect(model.type).toBe(PricingModelType.FLAT_RATE);
      expect(model).toBeDefined();
    });

    it("should support tiered pricing with discounts", () => {
      const model = mockModel.pricing_models[RevenueStreamType.SUBSCRIPTION];
      expect(model.type).toBe(PricingModelType.TIERED);
      expect(model.tiers).toHaveLength(3);
      expect(model.tiers?.[0].annual_discount_percent).toBe(10);
      expect(model.tiers?.[2].min_units).toBe(201);
    });

    it("should support value-based pricing", () => {
      const model = mockModel.pricing_models[RevenueStreamType.PROFESSIONAL_SERVICES];
      expect(model.type).toBe(PricingModelType.VALUE_BASED);
    });
  });

  describe("Revenue Component Health", () => {
    it("should classify healthy component", () => {
      const health = validateComponentHealth(mockComponent);
      expect(health).toBe("healthy");
    });

    it("should classify zero revenue as critical", () => {
      const critical = validateComponentHealth({
        ...mockComponent,
        current_value: 0,
      });
      expect(critical).toBe("critical");
    });

    it("should classify negative value as critical", () => {
      const critical = validateComponentHealth({
        ...mockComponent,
        current_value: -100,
      });
      expect(critical).toBe("critical");
    });

    it("should classify low confidence as warning", () => {
      const warning = validateComponentHealth({
        ...mockComponent,
        measurement_confidence: "low",
      });
      expect(warning).toBe("warning");
    });

    it("should classify high churn as warning", () => {
      const warning = validateComponentHealth({
        ...mockComponent,
        churn_rate_percent: 15,
      });
      expect(warning).toBe("warning");
    });

    it("should classify negative growth for recurring as warning", () => {
      const warning = validateComponentHealth({
        ...mockComponent,
        growth_rate_percent: -10,
      });
      expect(warning).toBe("warning");
    });

    it("should classify stale data as critical", () => {
      const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // 120 days ago
      const critical = validateComponentHealth({
        ...mockComponent,
        last_measured_at: staleDate,
      });
      expect(critical).toBe("critical");
    });
  });

  describe("Revenue Model Validation", () => {
    it("should validate complete model", () => {
      expect(validateRevenueModel(mockModel)).toBe(true);
    });

    it("should reject model with no components", () => {
      const invalid = { ...mockModel, components: [] };
      expect(validateRevenueModel(invalid)).toBe(false);
    });

    it("should reject model with negative metrics", () => {
      const invalid = {
        ...mockModel,
        metrics: { ...mockModel.metrics, total_mrr: -1000 },
      };
      expect(validateRevenueModel(invalid)).toBe(false);
    });

    it("should reject model without workspace context", () => {
      const invalid = { ...mockModel, workspaceId: "" };
      expect(validateRevenueModel(invalid as any)).toBe(false);
    });

    it("should reject model with invalid component values", () => {
      const invalid = {
        ...mockModel,
        components: [{ ...mockComponent, current_value: -500 }],
      };
      expect(validateRevenueModel(invalid)).toBe(false);
    });
  });

  describe("ARR / MRR Calculations", () => {
    it("should calculate ARR from MRR", () => {
      const arr = calculateARRFromMRR(5000);
      expect(arr).toBe(60000);
    });

    it("should calculate MRR from ARR", () => {
      const mrr = calculateMRRFromARR(60000);
      expect(mrr).toBe(5000);
    });

    it("should be reversible", () => {
      const original = 7500;
      const arr = calculateARRFromMRR(original);
      const mrr = calculateMRRFromARR(arr);
      expect(mrr).toBe(original);
    });
  });

  describe("Revenue Model DTO", () => {
    it("should convert model to DTO with key metrics", () => {
      const dto = revenueModelToDTO(mockModel);

      expect(dto.id).toBe(mockModel.id);
      expect(dto.workspaceId).toBe(mockModel.workspaceId);
      expect(dto.name).toBe(mockModel.name);
      expect(dto.total_mrr).toBe(57000);
      expect(dto.total_arr).toBe(684000);
      expect(dto.currency).toBe("USD");
      expect(dto.is_approved).toBe(true);
    });

    it("should include active streams in DTO", () => {
      const dto = revenueModelToDTO(mockModel);
      expect(dto.active_streams).toContain(RevenueStreamType.SUBSCRIPTION);
      expect(dto.active_streams).toContain(RevenueStreamType.PROFESSIONAL_SERVICES);
    });

    it("should include projections in DTO", () => {
      const dto = revenueModelToDTO(mockModel);
      expect(dto.projections).toBeDefined();
      expect(dto.projections?.next_month_estimated_revenue).toBe(59000);
    });

    it("should include growth metrics in DTO", () => {
      const dto = revenueModelToDTO(mockModel);
      expect(dto.blended_growth_rate_percent).toBe(6.5);
      expect(dto.average_customer_value).toBe(2280);
    });
  });

  describe("Billing Frequencies", () => {
    it("should have all billing frequencies", () => {
      expect(BillingFrequency.MONTHLY).toBe("MONTHLY");
      expect(BillingFrequency.ANNUAL).toBe("ANNUAL");
      expect(BillingFrequency.ONE_TIME).toBe("ONE_TIME");
      expect(BillingFrequency.USAGE_BASED).toBe("USAGE_BASED");
    });
  });

  describe("Revenue Metric Types", () => {
    it("should have all metric types", () => {
      expect(RevenueMetricType.MONTHLY_RECURRING_REVENUE).toBe("MONTHLY_RECURRING_REVENUE");
      expect(RevenueMetricType.ANNUAL_RECURRING_REVENUE).toBe("ANNUAL_RECURRING_REVENUE");
      expect(RevenueMetricType.AVERAGE_REVENUE_PER_ACCOUNT).toBe("AVERAGE_REVENUE_PER_ACCOUNT");
    });
  });

  describe("Revenue Model Structure", () => {
    it("should have all required metadata fields", () => {
      expect(mockModel.id).toBeDefined();
      expect(mockModel.workspaceId).toBeDefined();
      expect(mockModel.name).toBeDefined();
      expect(mockModel.model_as_of).toBeDefined();
      expect(mockModel.last_updated_at).toBeDefined();
      expect(mockModel.updated_by).toBeDefined();
    });

    it("should have all required metric fields", () => {
      expect(mockModel.metrics.total_mrr).toBeDefined();
      expect(mockModel.metrics.total_arr).toBeDefined();
      expect(mockModel.metrics.currency).toBeDefined();
      expect(mockModel.metrics.avg_customer_value).toBeDefined();
      expect(mockModel.metrics.active_customer_count).toBeDefined();
    });

    it("should have pricing models for all stream types", () => {
      Object.values(RevenueStreamType).forEach((streamType) => {
        expect(mockModel.pricing_models[streamType]).toBeDefined();
      });
    });

    it("should support projections", () => {
      expect(mockModel.projections).toBeDefined();
      expect(mockModel.projections?.next_month_estimated_revenue).toBe(59000);
      expect(mockModel.projections?.confidence_level).toBe("high");
    });

    it("should support approval workflow", () => {
      expect(mockModel.is_approved).toBe(true);
      expect(mockModel.approved_by).toBeDefined();
      expect(mockModel.approved_at).toBeDefined();
      expect(mockModel.version).toBe(1);
    });
  });

  describe("Revenue Component Structure", () => {
    it("should require workspace context", () => {
      expect(mockComponent.workspaceId).toBe("ws-test-xyz");
    });

    it("should track measurement confidence", () => {
      expect(mockComponent.measurement_confidence).toBe("high");
    });

    it("should support optional growth and churn rates", () => {
      expect(mockComponent.growth_rate_percent).toBe(8);
      expect(mockComponent.churn_rate_percent).toBe(2);
    });

    it("should track customer count when applicable", () => {
      expect(mockComponent.customer_count).toBe(25);
    });

    it("should track last measurement timestamp", () => {
      expect(mockComponent.last_measured_at instanceof Date).toBe(true);
    });
  });

  describe("Requirements Constants", () => {
    it("should define minimum components required", () => {
      expect(REVENUE_MODEL_REQUIREMENTS.minComponentsRequired).toBe(1);
    });

    it("should define minimum customers for reliability", () => {
      expect(REVENUE_MODEL_REQUIREMENTS.minCustomersForReliability).toBe(10);
    });

    it("should define stale component threshold (90 days)", () => {
      const expectedMs = 90 * 24 * 60 * 60 * 1000;
      expect(REVENUE_MODEL_REQUIREMENTS.staleComponentThreshold).toBe(expectedMs);
    });

    it("should define minimum confidence level for projections", () => {
      expect(REVENUE_MODEL_REQUIREMENTS.minConfidenceLevelForProjections).toBe("medium");
    });
  });
});
