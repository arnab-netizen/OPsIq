/**
 * Growth: Acquisition Engine Service
 *
 * Workspace-scoped customer acquisition modeling, channel analysis, and ROI calculation.
 * Channel-month metrics are persisted to `acquisition_metrics_records` (DB-backed).
 * All writes are workspace-scoped and audit-tracked.
 *
 * Pure-function methods (analyzeConversion, calculateROI, rankChannels,
 * optimizeBudgetAllocation, forecastAcquisition) have no side effects and operate
 * on caller-supplied data.
 * Only recordMetrics and listMetrics touch the DB.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  AcquisitionMetrics,
  AcquisitionChannel,
  validateAcquisitionMetrics,
} from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

export class AcquisitionEngine {
  /**
   * Persist acquisition metrics for one channel-month (workspace-scoped, DB-backed).
   * Throws ValidationError on invalid data or missing workspaceId.
   * Emits ACQUISITION_METRICS_RECORDED audit event.
   */
  static async recordMetrics(
    workspaceId: string,
    actorId: string,
    data: Partial<AcquisitionMetrics>
  ): Promise<AcquisitionMetrics> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required for acquisition metrics");
    }

    const validation = validateAcquisitionMetrics(data);
    if (!validation.valid) {
      throw new ValidationError(
        `Acquisition metrics validation failed: ${validation.errors.join("; ")}`
      );
    }

    const metrics: AcquisitionMetrics = {
      workspaceId,
      channel: data.channel ?? AcquisitionChannel.ORGANIC,
      month: data.month!,
      leads: data.leads ?? 0,
      qualifiedLeads: data.qualifiedLeads,
      conversions: data.conversions ?? 0,
      costPerLead: data.costPerLead ?? 0,
      costPerAcquisition: data.costPerAcquisition ?? 0,
      targetCPA: data.targetCPA ?? 0,
    };

    const id = randomUUID();
    await db.acquisitionMetricsRecord.create({
      data: {
        id,
        workspaceId,
        channel: metrics.channel,
        month: metrics.month,
        leads: metrics.leads,
        qualifiedLeads: metrics.qualifiedLeads ?? null,
        conversions: metrics.conversions,
        costPerLead: metrics.costPerLead,
        costPerAcquisition: metrics.costPerAcquisition,
        targetCPA: metrics.targetCPA,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACQUISITION_METRICS_RECORDED,
      actorId,
      entityType: "acquisition_metrics_record",
      entityId: id,
      workspaceId,
      payload: {
        channel: metrics.channel,
        month: metrics.month,
        leads: metrics.leads,
        conversions: metrics.conversions,
      },
      visibility: "internal",
    });

    return metrics;
  }

  /**
   * List persisted acquisition metrics for a workspace (workspace-scoped read).
   * Optionally filter by channel and/or month.
   */
  static async listMetrics(
    workspaceId: string,
    channel?: AcquisitionChannel,
    month?: string
  ): Promise<AcquisitionMetrics[]> {
    if (!workspaceId) return [];

    const rows = await db.acquisitionMetricsRecord.findMany({
      where: {
        workspaceId,
        ...(channel ? { channel } : {}),
        ...(month ? { month } : {}),
      },
      orderBy: [{ month: "desc" }, { channel: "asc" }],
    });

    return rows.map((r: typeof rows[number]) => ({
      workspaceId: r.workspaceId,
      channel: r.channel as AcquisitionChannel,
      month: r.month,
      leads: r.leads,
      qualifiedLeads: r.qualifiedLeads ?? undefined,
      conversions: r.conversions,
      costPerLead: r.costPerLead,
      costPerAcquisition: r.costPerAcquisition,
      targetCPA: r.targetCPA,
    }));
  }

  /**
   * Calculate conversion rate and efficiency metrics.
   * Pure function — no DB access.
   * If metrics.workspaceId is set and doesn't match workspaceId, returns fail-closed zeros.
   */
  static analyzeConversion(
    workspaceId: string,
    metrics: AcquisitionMetrics
  ): {
    leadToQualifiedRate: number;
    qualifiedToConversionRate: number;
    leadToConversionRate: number;
    efficiency: "HIGH" | "MEDIUM" | "LOW";
  } {
    if (!workspaceId) {
      return { leadToQualifiedRate: 0, qualifiedToConversionRate: 0, leadToConversionRate: 0, efficiency: "LOW" };
    }

    if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
      return { leadToQualifiedRate: 0, qualifiedToConversionRate: 0, leadToConversionRate: 0, efficiency: "LOW" };
    }

    const qualifiedLeads = metrics.qualifiedLeads ?? 0;
    const leadToQualified = metrics.leads > 0 ? qualifiedLeads / metrics.leads : 0;
    const qualifiedToConversion = qualifiedLeads > 0 ? metrics.conversions / qualifiedLeads : 0;
    const leadToConversion = metrics.leads > 0 ? metrics.conversions / metrics.leads : 0;

    let efficiency: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    if (leadToConversion > 0.15) {
      efficiency = "HIGH";
    } else if (leadToConversion > 0.05) {
      efficiency = "MEDIUM";
    }

    return {
      leadToQualifiedRate: Math.min(1, Math.max(0, leadToQualified)),
      qualifiedToConversionRate: Math.min(1, Math.max(0, qualifiedToConversion)),
      leadToConversionRate: Math.min(1, Math.max(0, leadToConversion)),
      efficiency,
    };
  }

  /**
   * Calculate ROI for an acquisition channel.
   * Pure function — no DB access.
   * If metrics.workspaceId is set and doesn't match workspaceId, returns fail-closed zeros.
   */
  static calculateROI(
    workspaceId: string,
    metrics: AcquisitionMetrics,
    averageCustomerLifetimeValue: number
  ): {
    roi: number;
    roi_ratio: number;
    paybackDays: number;
    status: "PROFITABLE" | "BREAK_EVEN" | "UNPROFITABLE";
  } {
    if (!workspaceId) {
      return { roi: 0, roi_ratio: 0, paybackDays: 0, status: "UNPROFITABLE" };
    }

    if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
      return { roi: 0, roi_ratio: 0, paybackDays: 0, status: "UNPROFITABLE" };
    }

    const totalSpend = metrics.costPerAcquisition * metrics.conversions;
    const totalRevenue = metrics.conversions * averageCustomerLifetimeValue;
    const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;
    const roi_ratio = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const monthlyRevenue = metrics.conversions > 0 ? totalRevenue : 1;
    const paybackDays = monthlyRevenue > 0 ? Math.ceil((totalSpend / monthlyRevenue) * 30) : 999;

    let status: "PROFITABLE" | "BREAK_EVEN" | "UNPROFITABLE" = "UNPROFITABLE";
    if (roi > 50) {
      status = "PROFITABLE";
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
   * Compare channels and rank by efficiency.
   * Pure function — no DB access.
   * Metrics with a workspaceId set that doesn't match are filtered out.
   */
  static rankChannels(
    workspaceId: string,
    channelMetrics: Map<AcquisitionChannel, AcquisitionMetrics>
  ): Array<{
    channel: AcquisitionChannel;
    cpuScore: number;
    efficiency: string;
    rank: number;
  }> {
    if (!workspaceId) return [];

    const rankings = Array.from(channelMetrics.entries())
      .filter(([, m]) => !m.workspaceId || m.workspaceId === workspaceId)
      .map(([channel, metrics]) => {
        const qualifiedLeads = metrics.qualifiedLeads ?? 0;
        const cpuScore = qualifiedLeads > 0 ? metrics.costPerLead : Infinity;
        const conversion = this.analyzeConversion(workspaceId, metrics);
        return { channel, cpuScore, efficiency: conversion.efficiency, rank: 0 };
      });

    if (rankings.length === 0) return [];

    rankings.sort((a, b) => a.cpuScore - b.cpuScore);
    rankings.forEach((item, index) => { item.rank = index + 1; });
    return rankings;
  }

  /**
   * Calculate budget allocation across channels.
   * Pure function — no DB access.
   */
  static optimizeBudgetAllocation(
    workspaceId: string,
    channelMetrics: Map<AcquisitionChannel, AcquisitionMetrics>,
    totalBudget: number,
    targetAcquisitions: number
  ): Map<AcquisitionChannel, number> {
    if (!workspaceId || totalBudget <= 0 || targetAcquisitions <= 0) return new Map();

    const rankings = this.rankChannels(workspaceId, channelMetrics);
    if (rankings.length === 0) return new Map();

    const allocation = new Map<AcquisitionChannel, number>();
    const topChannel = rankings[0];
    const channel2 = rankings.length > 1 ? rankings[1] : null;

    allocation.set(topChannel.channel, totalBudget * 0.5);
    if (channel2) allocation.set(channel2.channel, totalBudget * 0.3);

    const remainingAllocation = channel2 ? totalBudget * 0.2 : totalBudget * 0.5;
    const otherChannels = rankings.slice(channel2 ? 2 : 1);
    if (otherChannels.length > 0) {
      const perChannel = remainingAllocation / otherChannels.length;
      otherChannels.forEach((item) => allocation.set(item.channel, perChannel));
    }

    return allocation;
  }

  /**
   * Forecast acquisition for next month based on historical trend.
   * Pure function — no DB access.
   * Metrics with a mismatched workspaceId are rejected (fail-closed).
   */
  static forecastAcquisition(
    workspaceId: string,
    historicalMetrics: AcquisitionMetrics[],
    growthRate: number = 0.1
  ): {
    projectedLeads: number;
    projectedConversions: number;
    projectedCost: number;
    confidence: number;
  } {
    const zero = { projectedLeads: 0, projectedConversions: 0, projectedCost: 0, confidence: 0 };

    if (!workspaceId || historicalMetrics.length === 0) return zero;

    for (const m of historicalMetrics) {
      if (m.workspaceId && m.workspaceId !== workspaceId) return zero;
    }

    const avgLeads = historicalMetrics.reduce((s, m) => s + m.leads, 0) / historicalMetrics.length;
    const avgConversions = historicalMetrics.reduce((s, m) => s + m.conversions, 0) / historicalMetrics.length;
    const avgCost = historicalMetrics.reduce((s, m) => s + m.costPerAcquisition, 0) / historicalMetrics.length;

    const projectedLeads = avgLeads * (1 + growthRate);
    const projectedConversions = avgConversions * (1 + growthRate);
    const projectedCost = projectedConversions * avgCost;
    const confidence = Math.min(0.9, 0.5 + historicalMetrics.length * 0.1);

    return {
      projectedLeads: Math.round(projectedLeads),
      projectedConversions: Math.round(projectedConversions),
      projectedCost: Math.round(projectedCost),
      confidence,
    };
  }
}
