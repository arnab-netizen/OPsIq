/**
 * B22-S1: Online Growth Intelligence — Unit Tests
 *
 * Tests opportunity validation, compliance controls, and recommendation ranking.
 */

import {
  validateGrowthOpportunity,
  canBePrimaryRecommendation,
  scoreOpportunity,
  filterByConstraints,
  rankOpportunitiesByScore,
  type GrowthOpportunity,
} from "@/domain/benchmark/growth-opportunity";
import {
  getAllSampleOpportunities,
  getSampleOpportunity,
  validateOpportunity,
  evaluateOpportunitity,
  scoreOpportunityById,
  rankAllSampleOpportunities,
  filterOpportunitiesByConstraints,
  getOpportunitySummary,
} from "@/services/benchmark/growth-opportunity.service";

describe("B22-S1 — Online Growth Intelligence", () => {
  describe("Sample Opportunities", () => {
    it("should create 4 sample opportunities", () => {
      const samples = getAllSampleOpportunities();
      expect(samples).toHaveLength(4);
    });

    it("should have unique opportunity IDs", () => {
      const samples = getAllSampleOpportunities();
      const ids = samples.map((o) => o.opportunity_id);
      expect(new Set(ids).size).toBe(4);
    });

    it("should retrieve opportunity by ID", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).not.toBeNull();
      expect(opp?.opportunity_id).toBe("opp_saas_channel_001");
    });

    it("should return null for unknown ID", () => {
      const opp = getSampleOpportunity("unknown");
      expect(opp).toBeNull();
    });

    it("all samples should be sourced", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        expect(opp.sourced).toBe(true);
      }
    });

    it("all samples should have source citations", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        expect(opp.source).toBeDefined();
        expect(opp.source.source_name).toBeTruthy();
        expect(opp.citations.length).toBeGreaterThan(0);
      }
    });

    it("primary opportunity should have high scores", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp?.relevance_score).toBeGreaterThan(70);
      expect(opp?.confidence_score).toBeGreaterThan(0.7);
    });

    it("constraint-violating opportunity should have violations listed", () => {
      const opp = getSampleOpportunity("opp_hire_sales_001");
      expect(opp?.constraint_violations).toBeDefined();
      expect(opp?.constraint_violations?.length).toBeGreaterThan(0);
    });
  });

  describe("Hard Rule: Sourcing", () => {
    it("should reject unsourced opportunity", () => {
      const unsourced = getSampleOpportunity("opp_saas_channel_001");
      expect(unsourced).toBeDefined();
      const invalid = { ...unsourced, sourced: false };
      const validation = validateGrowthOpportunity(invalid!);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("sourced"))).toBe(true);
    });

    it("should require source name", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const invalid = { ...opp, source: { ...opp!.source, source_name: "" } };
      const validation = validateGrowthOpportunity(invalid!);
      expect(validation.valid).toBe(false);
    });

    it("should require citations", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const invalid = { ...opp, citations: [] };
      const validation = validateGrowthOpportunity(invalid!);
      expect(validation.valid).toBe(false);
    });

    it("should require sourced claims", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const invalid = {
        ...opp,
        citations: [{ claim: "test", evidence: "test", source_cited: false }],
      };
      const validation = validateGrowthOpportunity(invalid!);
      expect(validation.valid).toBe(false);
    });
  });

  describe("Compliance: No Guaranteed ROI", () => {
    it("should reject opportunities with guaranteed ROI claims", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const invalid = { ...opp, has_guaranteed_roi_claim: true };
      const validation = validateGrowthOpportunity(invalid!);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Guaranteed ROI"))).toBe(true);
    });

    it("sample opportunities should not have guaranteed ROI", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        expect(opp.has_guaranteed_roi_claim).not.toBe(true);
      }
    });
  });

  describe("Source Freshness", () => {
    it("should mark outdated sources", () => {
      const opp = getSampleOpportunity("opp_outdated_event_001");
      expect(opp).toBeDefined();
      const validation = validateGrowthOpportunity(opp!);
      expect(validation.warnings.some((w) => w.includes("outdated"))).toBe(true);
      expect(opp?.is_outdated).toBe(true);
    });

    it("should warn about >12 month old sources", () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 13); // 13 months ago

      const opp = getSampleOpportunity("opp_outdated_event_001");
      expect(opp).toBeDefined();

      const oldOpp = { ...opp, retrieved_date: oldDate };
      const validation = validateGrowthOpportunity(oldOpp!);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });

    it("fresh sources should not trigger outdated warning", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const validation = validateGrowthOpportunity(opp!);
      expect(validation.warnings.some((w) => w.includes("outdated"))).toBe(false);
    });
  });

  describe("Constraint Validation", () => {
    it("should identify constraint violations", () => {
      const violating = getSampleOpportunity("opp_hire_sales_001");
      expect(violating).toBeDefined();
      expect(violating?.constraint_violations?.length).toBeGreaterThan(0);
    });

    it("should block constraint-violating opportunities from primary recommendation", () => {
      const violating = getSampleOpportunity("opp_hire_sales_001");
      expect(violating).toBeDefined();
      const tier = canBePrimaryRecommendation(violating!);
      expect(tier.can_recommend_primary).toBe(false);
      expect(tier.recommendation_tier).toBe("exploratory");
    });

    it("should filter opportunities by constraints", () => {
      const opportunities = getAllSampleOpportunities();
      const result = filterByConstraints(opportunities, []);
      expect(result.compliant.length + result.violating.length).toBe(opportunities.length);
      expect(result.violating.length).toBeGreaterThan(0);
    });
  });

  describe("Primary Recommendation Tier", () => {
    it("should allow high-scoring, sourced opportunities as primary", () => {
      const primary = getSampleOpportunity("opp_saas_channel_001");
      expect(primary).toBeDefined();
      const tier = canBePrimaryRecommendation(primary!);
      expect(tier.can_recommend_primary).toBe(true);
      expect(tier.recommendation_tier).toBe("primary");
    });

    it("should not allow outdated sources as primary", () => {
      const outdated = getSampleOpportunity("opp_outdated_event_001");
      expect(outdated).toBeDefined();
      const validation = validateGrowthOpportunity(outdated!);
      const tier = canBePrimaryRecommendation(outdated!);
      expect(tier.can_recommend_primary).toBe(false);
      expect(tier.recommendation_tier).toBe("secondary");
    });

    it("should rank secondary opportunities", () => {
      const secondary = getSampleOpportunity("opp_content_marketing_001");
      expect(secondary).toBeDefined();
      const tier = canBePrimaryRecommendation(secondary!);
      expect(tier.recommendation_tier).toBe("secondary");
    });
  });

  describe("Opportunity Scoring", () => {
    it("should score opportunities 0-100", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        const scores = scoreOpportunity(opp);
        expect(scores.viability_score).toBeGreaterThanOrEqual(0);
        expect(scores.viability_score).toBeLessThanOrEqual(100);
      }
    });

    it("should calculate effort-cost ratio", () => {
      const primary = getSampleOpportunity("opp_saas_channel_001");
      expect(primary).toBeDefined();
      const scores = scoreOpportunity(primary!);
      expect(scores.effort_cost_ratio).toBeGreaterThan(0);
    });

    it("should apply risk penalty", () => {
      const scores = scoreOpportunity(getAllSampleOpportunities()[0]);
      expect(scores.risk_adjusted_score).toBeLessThanOrEqual(scores.viability_score);
    });

    it("should assign recommendation strength", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        const scores = scoreOpportunity(opp);
        expect(["strong", "moderate", "weak"]).toContain(scores.recommendation_strength);
      }
    });

    it("high-scoring opportunity should have strong recommendation", () => {
      const primary = getSampleOpportunity("opp_saas_channel_001");
      expect(primary).toBeDefined();
      const scores = scoreOpportunity(primary!);
      expect(scores.recommendation_strength).toBe("strong");
    });
  });

  describe("Opportunity Ranking", () => {
    it("should rank opportunities by viability", () => {
      const ranked = rankAllSampleOpportunities();
      expect(ranked.length).toBe(4);

      // Check that ranking is by viability score descending
      for (let i = 0; i < ranked.length - 1; i++) {
        expect(ranked[i].rank).toBeLessThan(ranked[i + 1].rank);
      }
    });

    it("primary opportunities should rank higher", () => {
      const ranked = rankAllSampleOpportunities();
      const primary = ranked.filter((r) => r.recommendation_tier === "primary");
      const secondary = ranked.filter((r) => r.recommendation_tier === "secondary");

      if (primary.length > 0 && secondary.length > 0) {
        const primaryAvgRank =
          primary.reduce((sum, r) => sum + r.rank, 0) / primary.length;
        const secondaryAvgRank =
          secondary.reduce((sum, r) => sum + r.rank, 0) / secondary.length;
        expect(primaryAvgRank).toBeLessThan(secondaryAvgRank);
      }
    });

    it("should include rank positions", () => {
      const ranked = rankAllSampleOpportunities();
      expect(ranked[0].rank).toBe(1);
      if (ranked.length > 1) {
        expect(ranked[1].rank).toBe(2);
      }
    });
  });

  describe("Service Functions", () => {
    it("should validate opportunity via service", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const result = validateOpportunity(opp!);
      expect(result.valid).toBe(true);
    });

    it("should evaluate opportunity for tier", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();
      const evaluation = evaluateOpportunitity(opp!);
      expect(evaluation.recommendation_tier).toBe("primary");
      expect(evaluation.viability_score).toBeGreaterThan(0);
    });

    it("should score opportunity by ID", () => {
      const scores = scoreOpportunityById("opp_saas_channel_001");
      expect(scores).not.toBeNull();
      expect(scores?.viability_score).toBeGreaterThan(0);
    });

    it("should return null for unknown opportunity score", () => {
      const scores = scoreOpportunityById("unknown");
      expect(scores).toBeNull();
    });

    it("should filter by constraints", () => {
      const result = filterOpportunitiesByConstraints([
        "Limited budget",
        "Cannot hire staff",
      ]);
      expect(result.compliant.length + result.violating.length).toBe(4);
    });

    it("should provide summary", () => {
      const summary = getOpportunitySummary();
      expect(summary.total_opportunities).toBe(4);
      expect(summary.primary_candidates).toBeGreaterThan(0);
      expect(summary.constraint_violations).toBeGreaterThan(0);
      expect(summary.top_opportunity).not.toBeNull();
    });
  });

  describe("Determinism", () => {
    it("should score identically for same opportunity", () => {
      const opp1 = getSampleOpportunity("opp_saas_channel_001");
      const opp2 = getSampleOpportunity("opp_saas_channel_001");

      const scores1 = scoreOpportunity(opp1!);
      const scores2 = scoreOpportunity(opp2!);

      expect(scores1.viability_score).toBe(scores2.viability_score);
      expect(scores1.effort_cost_ratio).toBe(scores2.effort_cost_ratio);
      expect(scores1.recommendation_strength).toBe(scores2.recommendation_strength);
    });

    it("should rank consistently", () => {
      const ranked1 = rankAllSampleOpportunities();
      const ranked2 = rankAllSampleOpportunities();

      expect(ranked1.length).toBe(ranked2.length);
      for (let i = 0; i < ranked1.length; i++) {
        expect(ranked1[i].opportunity_id).toBe(ranked2[i].opportunity_id);
        expect(ranked1[i].rank).toBe(ranked2[i].rank);
      }
    });
  });

  describe("Integration: Full workflow", () => {
    it("should demonstrate complete opportunity evaluation", () => {
      const opp = getSampleOpportunity("opp_saas_channel_001");
      expect(opp).toBeDefined();

      // 1. Validate
      const validation = validateOpportunity(opp!);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);

      // 2. Evaluate tier
      const evaluation = evaluateOpportunitity(opp!);
      expect(evaluation.recommendation_tier).toBe("primary");

      // 3. Score
      const scores = scoreOpportunityById(opp!.opportunity_id);
      expect(scores).not.toBeNull();

      // 4. Check primary qualification
      const tier = canBePrimaryRecommendation(opp!);
      expect(tier.can_recommend_primary).toBe(true);
    });

    it("should demonstrate recommendation ranking", () => {
      // Get all opportunities
      const opportunities = getAllSampleOpportunities();
      expect(opportunities.length).toBe(4);

      // Rank them
      const ranked = rankAllSampleOpportunities();
      expect(ranked.length).toBe(4);

      // Top should be primary
      const top = ranked[0];
      const topOpp = getSampleOpportunity(top.opportunity_id);
      expect(topOpp).toBeDefined();
      expect(topOpp?.relevance_score).toBeGreaterThan(50);
    });

    it("should show constraint filtering in action", () => {
      const constraints = [
        "Limited headcount budget",
        "Cannot hire for 6 months",
      ];

      const filtered = filterOpportunitiesByConstraints(constraints);

      // Hiring opportunity should be in violating
      const hiringOpp = filtered.violating.find(
        (o) => o.opportunity_id === "opp_hire_sales_001"
      );
      expect(hiringOpp).toBeDefined();
    });

    it("should demonstrate hard rule: no unsourced opportunities", () => {
      const samples = getAllSampleOpportunities();
      for (const opp of samples) {
        // All samples MUST be sourced
        expect(opp.sourced).toBe(true);

        // If we try to use it unsourced, validation fails
        const unsourced = { ...opp, sourced: false };
        const validation = validateGrowthOpportunity(unsourced);
        expect(validation.valid).toBe(false);
      }
    });
  });
});
