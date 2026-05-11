/**
 * Phase 9 Slice 7: Offer Engine Service
 *
 * Implements offer management, performance tracking, and recommendation generation.
 * Builds on growth-engines.ts domain contracts.
 *
 * CRITICAL: Service operates on workspace-scoped data only.
 * All inputs must include workspaceId for tenant safety.
 */

import {
  Offer,
  OfferPerformance,
} from "@/domain/growth/growth-engines";

/**
 * Offer Engine Service
 * Manages promotional offers, pricing strategies, and offer performance
 */
export class OfferEngine {
  /**
   * Create a new offer
   */
  static createOffer(
    workspaceId: string,
    data: Partial<Offer>
  ): { offer: Offer | null; error: string | null } {
    // Ensure workspace scoping first
    if (!workspaceId || workspaceId.length === 0) {
      return {
        offer: null,
        error: "Workspace ID is required for offers",
      };
    }

    // Validate required fields
    if (!data.name || !data.basePrice || !data.bundledFeatures) {
      return {
        offer: null,
        error: "Offer must have name, basePrice, and bundledFeatures",
      };
    }

    if (data.discountPercent === undefined || data.discountPercent < 0 || data.discountPercent > 100) {
      return {
        offer: null,
        error: "Discount percent must be between 0-100",
      };
    }

    // Create offer with workspace scoping
    const offer: Offer = {
      id: `offer-${Date.now()}`,
      workspaceId,
      name: data.name,
      basePrice: data.basePrice,
      discountPercent: data.discountPercent,
      bundledFeatures: data.bundledFeatures,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      status: data.status || "DRAFT",
      maxUses: data.maxUses,
      usedCount: data.usedCount || 0,
    };

    return { offer, error: null };
  }

  /**
   * Calculate effective price and savings
   */
  static calculateEffectivePrice(
    workspaceId: string,
    basePrice: number,
    discountPercent: number
  ): {
    originalPrice: number;
    discountAmount: number;
    effectivePrice: number;
    savings: string;
  } {
    if (!workspaceId) {
      return {
        originalPrice: 0,
        discountAmount: 0,
        effectivePrice: 0,
        savings: "",
      };
    }

    const discountAmount = (basePrice * discountPercent) / 100;
    const effectivePrice = basePrice - discountAmount;
    const savings = `${discountPercent}% off (saves $${Math.round(discountAmount)})`;

    return {
      originalPrice: basePrice,
      discountAmount: Math.round(discountAmount),
      effectivePrice: Math.round(effectivePrice),
      savings,
    };
  }

  /**
   * Track offer performance
   */
  static recordPerformance(
    workspaceId: string,
    offerId: string,
    conversions: number,
    revenue: number,
    baselineConversions: number,
    baselineRevenue: number,
    productionCost: number
  ): { performance: OfferPerformance | null; error: string | null } {
    if (!workspaceId) {
      return {
        performance: null,
        error: "Workspace ID is required",
      };
    }

    if (!offerId || conversions < 0 || revenue < 0) {
      return {
        performance: null,
        error: "Invalid offer ID or metrics",
      };
    }

    // Calculate performance metrics
    const conversionLift = baselineConversions > 0
      ? ((conversions - baselineConversions) / baselineConversions) * 100
      : 0;

    const revenueImpact = revenue - baselineRevenue;

    const profitMargin = revenue > 0
      ? ((revenue - productionCost) / revenue)
      : 0;

    const performance: OfferPerformance = {
      offerId,
      conversionLift: Math.round(conversionLift * 100) / 100,
      revenueImpact: Math.round(revenueImpact),
      profitMargin: Math.round(profitMargin * 100) / 100,
      recommendation: this.generateRecommendation(
        conversionLift,
        revenueImpact,
        profitMargin
      ),
    };

    return { performance, error: null };
  }

  /**
   * Analyze offer effectiveness
   */
  static analyzeEffectiveness(
    workspaceId: string,
    offer: Offer,
    conversions: number,
    baselineConversions: number
  ): {
    effectivenessScore: number; // 0-100
    status: "UNDERPERFORMING" | "EFFECTIVE" | "EXCELLENT";
    utilizationRate: number; // 0-1
    recommendation: string;
  } {
    if (!workspaceId) {
      return {
        effectivenessScore: 0,
        status: "UNDERPERFORMING",
        utilizationRate: 0,
        recommendation: "Workspace ID is required",
      };
    }

    // Calculate effectiveness
    const conversionLift = baselineConversions > 0
      ? (conversions / baselineConversions)
      : 1;

    const effectivenessScore = Math.min(100, Math.round(conversionLift * 50)); // 50 base + lift bonus

    // Determine status
    let status: "UNDERPERFORMING" | "EFFECTIVE" | "EXCELLENT";
    if (conversionLift < 1) {
      status = "UNDERPERFORMING";
    } else if (conversionLift >= 1.5) {
      status = "EXCELLENT";
    } else {
      status = "EFFECTIVE";
    }

    // Calculate utilization
    const utilizationRate = offer.maxUses
      ? (offer.usedCount || 0) / offer.maxUses
      : 0;

    // Generate recommendation
    let recommendation = "";
    if (status === "UNDERPERFORMING") {
      recommendation = "This offer is underperforming. Consider adjusting terms or discontinuing.";
    } else if (status === "EXCELLENT") {
      recommendation = "This offer is highly effective. Consider extending validity or increasing limits.";
    } else {
      recommendation = "This offer is performing well. Monitor performance and optimize as needed.";
    }

    return {
      effectivenessScore,
      status,
      utilizationRate,
      recommendation,
    };
  }

  /**
   * Compare offers to identify best performers
   */
  static compareOffers(
    workspaceId: string,
    offers: Offer[]
  ): {
    bestPerformer: Offer | null;
    worstPerformer: Offer | null;
    averageDiscount: number;
    activeCount: number;
    recommendations: string[];
  } {
    if (!workspaceId || !offers || offers.length === 0) {
      return {
        bestPerformer: null,
        worstPerformer: null,
        averageDiscount: 0,
        activeCount: 0,
        recommendations: [],
      };
    }

    const activeOffers = offers.filter((o) => o.status === "ACTIVE");
    const averageDiscount = offers.length > 0
      ? Math.round(
          offers.reduce((sum, o) => sum + (o.discountPercent || 0), 0) / offers.length
        )
      : 0;

    // Identify performers (in production, would use actual conversion/revenue data)
    const bestPerformer = offers[0] || null;
    const worstPerformer = offers[offers.length - 1] || null;

    // Generate recommendations
    const recommendations: string[] = [];
    if (offers.length > 5) {
      recommendations.push("Consider consolidating offers to reduce complexity.");
    }
    if (averageDiscount > 50) {
      recommendations.push("Average discount is high. Review pricing strategy.");
    }
    if (activeOffers.length === 0) {
      recommendations.push("No active offers found. Activate offers to drive conversions.");
    }

    return {
      bestPerformer,
      worstPerformer,
      averageDiscount,
      activeCount: activeOffers.length,
      recommendations,
    };
  }

  /**
   * Calculate bundle value and feature pricing
   */
  static calculateBundleValue(
    workspaceId: string,
    offer: Offer,
    featurePrices: Record<string, number>
  ): {
    bundleValue: number;
    individualPrice: number;
    bundleDiscount: number;
    value: string;
  } {
    if (!workspaceId) {
      return {
        bundleValue: 0,
        individualPrice: 0,
        bundleDiscount: 0,
        value: "",
      };
    }

    // Calculate individual feature prices
    let individualPrice = 0;
    offer.bundledFeatures.forEach((feature) => {
      individualPrice += featurePrices[feature] || 0;
    });

    // Bundle value is discounted from individual sum
    const discountAmount = (individualPrice * offer.discountPercent) / 100;
    const bundleValue = individualPrice - discountAmount;

    const bundleDiscount = Math.round((discountAmount / individualPrice) * 100);
    const value = `Bundle saves ${bundleDiscount}% vs individual features`;

    return {
      bundleValue: Math.round(bundleValue),
      individualPrice: Math.round(individualPrice),
      bundleDiscount,
      value,
    };
  }

  /**
   * Generate expiration alerts
   */
  static generateExpirationAlerts(
    workspaceId: string,
    offers: Offer[]
  ): {
    expiringToday: Offer[];
    expiringThisWeek: Offer[];
    expiringThisMonth: Offer[];
    actions: string[];
  } {
    if (!workspaceId || !offers || offers.length === 0) {
      return {
        expiringToday: [],
        expiringThisWeek: [],
        expiringThisMonth: [],
        actions: [],
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringToday = offers.filter(
      (o) =>
        o.validUntil &&
        o.validUntil.getTime() === today.getTime() &&
        o.status !== "EXPIRED"
    );

    const expiringThisWeek = offers.filter(
      (o) =>
        o.validUntil &&
        o.validUntil.getTime() > today.getTime() &&
        o.validUntil.getTime() <= weekFromNow.getTime() &&
        o.status !== "EXPIRED"
    );

    const expiringThisMonth = offers.filter(
      (o) =>
        o.validUntil &&
        o.validUntil.getTime() > weekFromNow.getTime() &&
        o.validUntil.getTime() <= monthFromNow.getTime() &&
        o.status !== "EXPIRED"
    );

    const actions: string[] = [];
    if (expiringToday.length > 0) {
      actions.push(`${expiringToday.length} offer(s) expiring today - archive or renew`);
    }
    if (expiringThisWeek.length > 0) {
      actions.push(`${expiringThisWeek.length} offer(s) expiring this week - plan renewals`);
    }

    return {
      expiringToday,
      expiringThisWeek,
      expiringThisMonth,
      actions,
    };
  }

  /**
   * Generate offer recommendation
   */
  private static generateRecommendation(
    conversionLift: number,
    revenueImpact: number,
    profitMargin: number
  ): "EXTEND" | "MODIFY_TERMS" | "RETIRE" {
    // EXTEND: Strong lift, positive revenue, good margin
    if (conversionLift > 20 && revenueImpact > 0 && profitMargin > 0.2) {
      return "EXTEND";
    }

    // RETIRE: Negative revenue impact or poor margin
    if (revenueImpact < 0 || profitMargin < 0.1) {
      return "RETIRE";
    }

    // MODIFY_TERMS: Moderate lift but needs adjustment
    return "MODIFY_TERMS";
  }
}
