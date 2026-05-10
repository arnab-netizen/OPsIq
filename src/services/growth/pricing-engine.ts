/**
 * Phase 9 Slice 3: Pricing Engine Service
 *
 * Implements pricing strategy, tier management, and optimization.
 * Builds on growth-engines.ts domain contracts.
 *
 * CRITICAL: Service operates on workspace-scoped data only.
 * All inputs must include workspaceId for tenant safety.
 */

import {
  PriceTier,
  PriceOptimization,
  PricingStrategy,
  validatePriceTier,
} from "@/domain/growth/growth-engines";

/**
 * Pricing Engine Service
 * Manages price tiers, strategy, and optimization
 */
export class PricingEngine {
  /**
   * Create and validate a new price tier
   */
  static createPriceTier(
    workspaceId: string,
    data: Partial<PriceTier>
  ): { tier: PriceTier | null; error: string | null } {
    // Ensure workspace scoping first
    if (!workspaceId || workspaceId.length === 0) {
      return {
        tier: null,
        error: "Workspace ID is required for price tier creation",
      };
    }

    // Validate tier data
    const validation = validatePriceTier(data);
    if (!validation.valid) {
      return {
        tier: null,
        error: `Price tier validation failed: ${validation.errors.join("; ")}`,
      };
    }

    // Create tier with workspace scoping
    const tier: PriceTier = {
      id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      name: data.name || "Unnamed Tier",
      entryPrice: data.entryPrice ?? 0,
      maxPrice: data.maxPrice ?? 0,
      targetMargin: data.targetMargin ?? 0.5,
      features: data.features || [],
      activationDate: data.activationDate || new Date(),
      status: data.status || "DRAFT",
    };

    return { tier, error: null };
  }

  /**
   * Calculate optimal price for tier based on elasticity
   */
  static optimizePrice(
    workspaceId: string,
    tier: PriceTier,
    currentPrice: number,
    elasticity: number = -0.5 // Default: moderate elasticity
  ): { recommendedPrice: number; confidence: number } {
    if (!workspaceId || tier.workspaceId !== workspaceId) {
      return { recommendedPrice: currentPrice, confidence: 0 };
    }

    // Elasticity-based optimization
    // If elasticity is -0.5: 1% price increase → 0.5% volume decrease
    // Optimal price increases revenue by testing +5% price with elasticity impact
    const priceIncrease = currentPrice * 0.05; // Test 5% increase
    const volumeImpact = elasticity * 5; // Percent volume change
    const revenueImpact = (5 + volumeImpact) / 100; // Net revenue change

    let recommendedPrice = currentPrice;
    let confidence = 0.5;

    // If revenue impact is positive, recommend price increase
    if (revenueImpact > 0) {
      recommendedPrice = currentPrice * (1 + revenueImpact / 100);
      confidence = Math.min(0.9, 0.5 + Math.abs(elasticity) * 0.5);
    } else if (revenueImpact < -0.02) {
      // If revenue drops significantly, consider decrease
      recommendedPrice = currentPrice * 0.95;
      confidence = 0.6;
    }

    // Enforce tier bounds
    recommendedPrice = Math.max(tier.entryPrice, Math.min(tier.maxPrice, recommendedPrice));

    return {
      recommendedPrice,
      confidence,
    };
  }

  /**
   * Compare pricing across tiers to detect gaps
   */
  static analyzeGaps(
    workspaceId: string,
    tiers: PriceTier[]
  ): {
    gaps: Array<{ name: string; minPrice: number; maxPrice: number }>;
    overlaps: Array<{ tier1: string; tier2: string }>;
  } {
    if (!workspaceId) {
      return { gaps: [], overlaps: [] };
    }

    // Filter to workspace
    const scopedTiers = tiers
      .filter((t) => t.workspaceId === workspaceId && t.status === "ACTIVE")
      .sort((a, b) => a.entryPrice - b.entryPrice);

    const gaps = [];
    const overlaps = [];

    // Detect gaps and overlaps between consecutive tiers
    for (let i = 0; i < scopedTiers.length - 1; i++) {
      const current = scopedTiers[i];
      const next = scopedTiers[i + 1];

      if (next.entryPrice > current.maxPrice + 1) {
        // Gap between tiers
        gaps.push({
          name: `Gap between ${current.name} and ${next.name}`,
          minPrice: current.maxPrice,
          maxPrice: next.entryPrice,
        });
      } else if (next.entryPrice < current.maxPrice) {
        // Overlap
        overlaps.push({
          tier1: current.name,
          tier2: next.name,
        });
      }
    }

    return { gaps, overlaps };
  }

  /**
   * Estimate margin impact of price change
   */
  static estimateMarginImpact(
    workspaceId: string,
    tier: PriceTier,
    newPrice: number,
    costOfGoods: number
  ): {
    currentMargin: number;
    newMargin: number;
    marginChange: number;
  } {
    if (!workspaceId || tier.workspaceId !== workspaceId) {
      return { currentMargin: 0, newMargin: 0, marginChange: 0 };
    }

    // Use tier's target margin as reference
    const entryMarginAmount = tier.entryPrice * tier.targetMargin;
    const currentMargin = (entryMarginAmount - costOfGoods) / tier.entryPrice;

    const newMarginAmount = newPrice * tier.targetMargin;
    const newMargin = (newMarginAmount - costOfGoods) / newPrice;

    return {
      currentMargin: Math.max(0, Math.min(1, currentMargin)),
      newMargin: Math.max(0, Math.min(1, newMargin)),
      marginChange: newMargin - currentMargin,
    };
  }

  /**
   * Recommend pricing strategy based on market position
   */
  static recommendStrategy(
    workspaceId: string,
    competitorAvgPrice: number,
    targetMargin: number,
    costOfGoods: number
  ): PricingStrategy {
    if (!workspaceId) {
      return PricingStrategy.COMPETITIVE;
    }

    // Cost-based minimum
    const costPlusMin = costOfGoods * (1 + targetMargin);

    if (costPlusMin > competitorAvgPrice * 1.1) {
      // Higher cost → penetration to gain share
      return PricingStrategy.PENETRATION;
    } else if (competitorAvgPrice > costPlusMin * 1.3) {
      // Opportunity for premium pricing
      return PricingStrategy.SKIMMING;
    } else if (targetMargin >= 0.5) {
      // High margin target → value-based
      return PricingStrategy.VALUE_BASED;
    } else {
      // Standard competitive
      return PricingStrategy.COMPETITIVE;
    }
  }

  /**
   * Calculate bundled tier value (sum of feature prices)
   */
  static calculateBundleValue(
    tier: PriceTier,
    featurePrices: Record<string, number>
  ): {
    bundledValue: number;
    discount: number; // percent
  } {
    if (!tier.features || tier.features.length === 0) {
      return { bundledValue: 0, discount: 0 };
    }

    let totalFeatureValue = 0;
    for (const feature of tier.features) {
      totalFeatureValue += featurePrices[feature] || 0;
    }

    const discount = totalFeatureValue > 0 ? ((totalFeatureValue - tier.entryPrice) / totalFeatureValue) * 100 : 0;

    return {
      bundledValue: totalFeatureValue,
      discount: Math.max(0, discount),
    };
  }
}
