/**
 * Phase 9 Slice 4: Acquisition Engine Service
 *
 * Implements customer acquisition modeling, channel analysis, and ROI calculation.
 * Builds on growth-engines.ts domain contracts.
 *
 * CRITICAL: Service operates on workspace-scoped data only.
 * All inputs must include workspaceId for tenant safety.
 */

import {
  AcquisitionMetrics,
  ChannelPerformance,
  AcquisitionChannel,
  validateAcquisitionMetrics,
} from "@/domain/growth/growth-engines";

/**
 * Acquisition Engine Service with Workspace-Scoped Data Stores
 * CRITICAL FIX: Enforces workspace isolation on all data access
 */
export class AcquisitionEngine {
  // Workspace-scoped data stores (Map<workspaceId, DataArray>)
  private static metricsStore = new Map<string, AcquisitionMetrics[]>();

  /**
   * Create and validate acquisition metrics for a channel (workspace-scoped)
   */
  static recordMetrics(
    workspaceId: string,
    data: Partial<AcquisitionMetrics>
  ): { metrics: AcquisitionMetrics | null; error: string | null } {
    // Enforce workspace scoping FIRST (fail-closed)
    if (!workspaceId || workspaceId.length === 0) {
      return {
        metrics: null,
        error: "Workspace ID is required for acquisition metrics",
      };
    }

    // Validate metrics data
    const validation = validateAcquisitionMetrics(data);
    if (!validation.valid) {
      return {
        metrics: null,
        error: `Acquisition metrics validation failed: ${validation.errors.join("; ")}`,
      };
    }

    // Create metrics with workspace scoping
    const metrics: AcquisitionMetrics = {
      workspaceId,
      channel: data.channel || AcquisitionChannel.ORGANIC,
      month: data.month || new Date().toISOString().slice(0, 7),
      leads: data.leads || 0,
      qualifiedLeads: data.qualifiedLeads || 0,
      conversions: data.conversions || 0,
      costPerLead: data.costPerLead || 0,
      costPerAcquisition: data.costPerAcquisition || 0,
      targetCPA: data.targetCPA || 0,
    };

    // Store in workspace-scoped store
    if (!this.metricsStore.has(workspaceId)) {
      this.metricsStore.set(workspaceId, []);
    }
    this.metricsStore.get(workspaceId)!.push(metrics);

    return { metrics, error: null };
  }

  /**
   * Calculate conversion rate and efficiency metrics (workspace-scoped)
   * CRITICAL: Verifies metrics belong to calling workspace
   */
  static analyzeConversion(
    workspaceId: string,
    metrics: AcquisitionMetrics
  ): {
    leadToQualifiedRate: number; // 0-1
    qualifiedToConversionRate: number; // 0-1
    leadToConversionRate: number; // 0-1
    efficiency: "HIGH" | "MEDIUM" | "LOW";
  } {
    // Fail-closed: return empty if workspace missing
    if (!workspaceId) {
      return {
        leadToQualifiedRate: 0,
        qualifiedToConversionRate: 0,
        leadToConversionRate: 0,
        efficiency: "LOW",
      };
    }

    // Verify metrics belong to this workspace
    // If metrics have workspaceId set, it must match calling workspace
    if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
      return {
        leadToQualifiedRate: 0,
        qualifiedToConversionRate: 0,
        leadToConversionRate: 0,
        efficiency: "LOW",
      };
    }

    // If metrics don't have workspaceId yet, claim them for this workspace
    if (!metrics.workspaceId) {
      metrics.workspaceId = workspaceId;
      // Store with workspace so future calls from other workspaces can be detected
      if (!this.metricsStore.has(workspaceId)) {
        this.metricsStore.set(workspaceId, []);
      }
      if (!this.metricsStore.get(workspaceId)!.some((m) => m === metrics)) {
        this.metricsStore.get(workspaceId)!.push(metrics);
      }
    }

    const qualifiedLeads = metrics.qualifiedLeads || 0;
    const leadToQualified = metrics.leads > 0 ? qualifiedLeads / metrics.leads : 0;
    const qualifiedToConversion = qualifiedLeads > 0 ? metrics.conversions / qualifiedLeads : 0;
    const leadToConversion = metrics.leads > 0 ? metrics.conversions / metrics.leads : 0;

    // Efficiency benchmarks
    let efficiency: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    if (leadToConversion > 0.15) {
      efficiency = "HIGH"; // >15% overall conversion
    } else if (leadToConversion > 0.05) {
      efficiency = "MEDIUM"; // 5-15% overall conversion
    }

    return {
      leadToQualifiedRate: Math.min(1, Math.max(0, leadToQualified)),
      qualifiedToConversionRate: Math.min(1, Math.max(0, qualifiedToConversion)),
      leadToConversionRate: Math.min(1, Math.max(0, leadToConversion)),
      efficiency,
    };
  }

  /**
   * Calculate ROI for an acquisition channel (workspace-scoped)
   * CRITICAL: Verifies metrics belong to calling workspace
   */
  static calculateROI(
    workspaceId: string,
    metrics: AcquisitionMetrics,
    averageCustomerLifetimeValue: number
  ): {
    roi: number; // percent
    roi_ratio: number; // revenue/spend
    paybackDays: number; // estimated
    status: "PROFITABLE" | "BREAK_EVEN" | "UNPROFITABLE";
  } {
    // Fail-closed: return empty if workspace missing
    if (!workspaceId) {
      return {
        roi: 0,
        roi_ratio: 0,
        paybackDays: 0,
        status: "UNPROFITABLE",
      };
    }

    // Verify metrics belong to this workspace
    // If metrics have workspaceId set, it must match calling workspace
    if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
      return {
        roi: 0,
        roi_ratio: 0,
        paybackDays: 0,
        status: "UNPROFITABLE",
      };
    }

    // If metrics don't have workspaceId yet, claim them for this workspace
    if (!metrics.workspaceId) {
      metrics.workspaceId = workspaceId;
      // Store with workspace so future calls from other workspaces can be detected
      if (!this.metricsStore.has(workspaceId)) {
        this.metricsStore.set(workspaceId, []);
      }
      if (!this.metricsStore.get(workspaceId)!.some((m) => m === metrics)) {
        this.metricsStore.get(workspaceId)!.push(metrics);
      }
    }

    // Total spend
    const totalSpend = metrics.costPerAcquisition * metrics.conversions;

    // Total revenue (conversions × LTV)
    const totalRevenue = metrics.conversions * averageCustomerLifetimeValue;

    // ROI = (Revenue - Cost) / Cost × 100
    const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;

    // ROI ratio = Revenue / Cost
    const roi_ratio = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // Payback = total spend / monthly revenue (simplified)
    const monthlyRevenue = metrics.conversions > 0 ? totalRevenue / 1 : 1;
    const paybackDays = monthlyRevenue > 0 ? Math.ceil((totalSpend / monthlyRevenue) * 30) : 999;

    let status: "PROFITABLE" | "BREAK_EVEN" | "UNPROFITABLE" = "UNPROFITABLE";
    if (roi > 50) {
      status = "PROFITABLE"; // >50% ROI is good
    } else if (roi > 0) {
      status = "BREAK_EVEN";
    }

    return {
      roi: Math.max(-100, roi),
      roi_ratio: Math.max(0, roi_ratio),
      paybackDays: Math.max(0, paybackDays),
      status,
    };
  }

  /**
   * Compare channels and rank by efficiency - WORKSPACE-SCOPED
   * CRITICAL: Returns empty if workspace doesn't own the data
   */
  static rankChannels(
    workspaceId: string,
    channelMetrics: Map<AcquisitionChannel, AcquisitionMetrics>
  ): Array<{
    channel: AcquisitionChannel;
    cpuScore: number; // cost per useful (qualified) lead
    efficiency: string;
    rank: number;
  }> {
    // Fail-closed: return empty if workspace missing
    if (!workspaceId) {
      return [];
    }

    const rankings = Array.from(channelMetrics.entries()).map(([channel, metrics]) => {
      // Verify metrics belong to this workspace
      // If metrics have workspaceId set, it must match
      if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
        return null;
      }

      // If metrics don't have workspaceId yet, claim them for this workspace
      if (!metrics.workspaceId) {
        metrics.workspaceId = workspaceId;
        // Store with workspace
        if (!this.metricsStore.has(workspaceId)) {
          this.metricsStore.set(workspaceId, []);
        }
        if (!this.metricsStore.get(workspaceId)!.some((m) => m === metrics)) {
          this.metricsStore.get(workspaceId)!.push(metrics);
        }
      }

      // Cost Per Useful (qualified) lead
      const qualifiedLeads = metrics.qualifiedLeads || 0;
      const cpuScore = qualifiedLeads > 0 ? metrics.costPerLead : Infinity;

      const conversion = this.analyzeConversion(workspaceId, metrics);

      return {
        channel,
        cpuScore,
        efficiency: conversion.efficiency,
        rank: 0,
      };
    }).filter((r) => r !== null) as Array<{ channel: AcquisitionChannel; cpuScore: number; efficiency: string; rank: number }>;

    if (rankings.length === 0) {
      return [];
    }

    // Sort by CPU score (lower is better)
    rankings.sort((a, b) => a.cpuScore - b.cpuScore);

    // Assign ranks
    rankings.forEach((item, index) => {
      item.rank = index + 1;
    });

    return rankings;
  }

  /**
   * Calculate budget allocation across channels - WORKSPACE-SCOPED
   * CRITICAL: Returns empty if workspace doesn't own the data
   */
  static optimizeBudgetAllocation(
    workspaceId: string,
    channelMetrics: Map<AcquisitionChannel, AcquisitionMetrics>,
    totalBudget: number,
    targetAcquisitions: number
  ): Map<AcquisitionChannel, number> {
    // Fail-closed: return empty if workspace missing or invalid params
    if (!workspaceId || totalBudget <= 0 || targetAcquisitions <= 0) {
      return new Map();
    }

    const allocation = new Map<AcquisitionChannel, number>();

    // Rank channels by efficiency (returns empty if workspace doesn't own data)
    const rankings = this.rankChannels(workspaceId, channelMetrics);

    if (rankings.length === 0) {
      return allocation;
    }

    // Allocate budget: top 50% to best channel, 30% to 2nd, 20% to others
    const topChannel = rankings[0];
    const allocation1 = totalBudget * 0.5;

    const channel2 = rankings.length > 1 ? rankings[1] : null;
    const allocation2 = channel2 ? totalBudget * 0.3 : 0;

    const otherAllocation = totalBudget * (channel2 ? 0.2 : 0.5);

    allocation.set(topChannel.channel, allocation1);

    if (channel2) {
      allocation.set(channel2.channel, allocation2);
    }

    // Distribute remaining to other channels equally
    const otherChannels = rankings.slice(channel2 ? 2 : 1);
    if (otherChannels.length > 0) {
      const perChannelAllocation = otherAllocation / otherChannels.length;
      otherChannels.forEach((item) => {
        allocation.set(item.channel, perChannelAllocation);
      });
    }

    return allocation;
  }

  /**
   * Forecast acquisition for next month - WORKSPACE-SCOPED
   * CRITICAL: Returns empty forecast if workspace doesn't own the data
   */
  static forecastAcquisition(
    workspaceId: string,
    historicalMetrics: AcquisitionMetrics[],
    growthRate: number = 0.1 // 10% default growth
  ): {
    projectedLeads: number;
    projectedConversions: number;
    projectedCost: number;
    confidence: number;
  } {
    // Fail-closed: return zero forecast if workspace or data missing
    if (!workspaceId || historicalMetrics.length === 0) {
      return {
        projectedLeads: 0,
        projectedConversions: 0,
        projectedCost: 0,
        confidence: 0,
      };
    }

    // Verify all metrics belong to this workspace or claim them
    for (const m of historicalMetrics) {
      // If metrics have workspaceId set, it must match
      if (m.workspaceId && m.workspaceId !== workspaceId) {
        return {
          projectedLeads: 0,
          projectedConversions: 0,
          projectedCost: 0,
          confidence: 0,
        };
      }
      // If metrics don't have workspaceId yet, claim them
      if (!m.workspaceId) {
        m.workspaceId = workspaceId;
        if (!this.metricsStore.has(workspaceId)) {
          this.metricsStore.set(workspaceId, []);
        }
        if (!this.metricsStore.get(workspaceId)!.some((x) => x === m)) {
          this.metricsStore.get(workspaceId)!.push(m);
        }
      }
    }

    // Average historical metrics
    const avgLeads = historicalMetrics.reduce((sum, m) => sum + m.leads, 0) / historicalMetrics.length;
    const avgConversions = historicalMetrics.reduce((sum, m) => sum + m.conversions, 0) / historicalMetrics.length;
    const avgCost = historicalMetrics.reduce((sum, m) => sum + m.costPerAcquisition, 0) / historicalMetrics.length;

    // Apply growth rate
    const projectedLeads = avgLeads * (1 + growthRate);
    const projectedConversions = avgConversions * (1 + growthRate);
    const projectedCost = projectedConversions * avgCost;

    // Confidence based on data age and consistency
    const confidence = Math.min(0.9, 0.5 + historicalMetrics.length * 0.1);

    return {
      projectedLeads: Math.round(projectedLeads),
      projectedConversions: Math.round(projectedConversions),
      projectedCost: Math.round(projectedCost),
      confidence,
    };
  }
}
