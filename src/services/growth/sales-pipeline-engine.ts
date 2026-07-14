/**
 * Growth: Sales Pipeline Engine Service
 *
 * Workspace-scoped sales deal management, pipeline metrics, and revenue forecasting.
 * Deal records are persisted to `sales_deal_records` (DB-backed).
 * All writes are workspace-scoped and audit-tracked.
 *
 * Pure-function methods (calculatePipelineMetrics, forecastPipelineRevenue,
 * analyzePipelineHealth, identifyOpportunities) are stateless and operate on
 * caller-supplied deal arrays.
 * Only recordDeal, progressDeal, and listDeals touch the DB.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  SalesPipeline,
  SalesDeal,
  DealStage,
  validateSalesDeal,
} from "@/domain/growth/growth-engines";
import { ValidationError, NotFoundError } from "@/infra/errors";

export interface SalesDealRecord {
  id: string;
  workspaceId: string;
  companyName: string;
  stage: DealStage;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: Date;
  owner?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: {
  id: string;
  workspaceId: string;
  companyName: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: Date;
  owner: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SalesDealRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    companyName: row.companyName,
    stage: row.stage as DealStage,
    value: row.value,
    currency: row.currency,
    probability: row.probability,
    expectedCloseDate: row.expectedCloseDate,
    owner: row.owner,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SalesPipelineEngine {
  /**
   * Persist a new sales deal (workspace-scoped, DB-backed).
   * Throws ValidationError on invalid data or missing workspaceId.
   * Emits SALES_DEAL_RECORDED audit event.
   */
  static async recordDeal(
    workspaceId: string,
    actorId: string,
    data: Partial<SalesDeal>
  ): Promise<SalesDealRecord> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required for sales deals");
    }

    const validation = validateSalesDeal(data);
    if (!validation.valid) {
      throw new ValidationError(
        `Sales deal validation failed: ${validation.errors.join("; ")}`
      );
    }

    const id = randomUUID();
    const row = await db.salesDealRecord.create({
      data: {
        id,
        workspaceId,
        companyName: data.companyName!,
        stage: data.stage ?? DealStage.PROSPECT,
        value: data.value!,
        currency: data.currency ?? "USD",
        probability: Math.min(1, Math.max(0, data.probability ?? 0)),
        expectedCloseDate: data.expectedCloseDate ?? new Date(),
        owner: data.owner ?? null,
        notes: data.notes ?? null,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.SALES_DEAL_RECORDED,
      actorId,
      entityType: "sales_deal_record",
      entityId: id,
      workspaceId,
      payload: {
        companyName: data.companyName,
        stage: row.stage,
        value: row.value,
      },
      visibility: "internal",
    });

    return mapRow(row);
  }

  /**
   * Update a deal's pipeline stage (workspace-scoped, DB-backed).
   * Looks up the deal by id, verifies workspace ownership, updates stage.
   * Throws ValidationError on missing params, NotFoundError if deal not found.
   * Emits SALES_DEAL_STAGE_UPDATED audit event.
   */
  static async progressDeal(
    workspaceId: string,
    actorId: string,
    dealId: string,
    newStage: DealStage
  ): Promise<{ deal: SalesDealRecord; progressionNote: string }> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required");
    }
    if (!dealId || !newStage) {
      throw new ValidationError("Deal ID and new stage are required");
    }

    const existing = await db.salesDealRecord.findUnique({ where: { id: dealId } });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundError("sales_deal_record", dealId);
    }

    const updated = await db.salesDealRecord.update({
      where: { id: dealId },
      data: {
        stage: newStage,
        probability: SalesPipelineEngine.calculateWinProbability(newStage),
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.SALES_DEAL_STAGE_UPDATED,
      actorId,
      entityType: "sales_deal_record",
      entityId: dealId,
      workspaceId,
      payload: { previousStage: existing.stage, newStage },
      visibility: "internal",
    });

    const deal = mapRow(updated);
    const progressionNote = `Deal progressed from ${existing.stage} to ${newStage}. Win probability updated to ${(deal.probability * 100).toFixed(0)}%.`;
    return { deal, progressionNote };
  }

  /**
   * List persisted sales deals for a workspace (workspace-scoped read).
   * Optionally filter by stage. Ordered newest first.
   */
  static async listDeals(
    workspaceId: string,
    stage?: DealStage
  ): Promise<SalesDealRecord[]> {
    const rows = await db.salesDealRecord.findMany({
      where: { workspaceId, ...(stage ? { stage } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRow);
  }

  /**
   * Calculate pipeline metrics from a caller-supplied deal array.
   * Pure function — no DB access, no side effects.
   */
  static calculatePipelineMetrics(
    workspaceId: string,
    deals: SalesDeal[]
  ): SalesPipeline {
    if (!workspaceId) {
      return {
        workspaceId: "",
        month: "",
        totalPipeline: 0,
        dealsByStage: {} as Record<DealStage, number>,
        winRate: 0,
        avgDealSize: 0,
        salesCycle: 0,
      };
    }

    const scopedDeals = deals.filter(d => !d.workspaceId || d.workspaceId === workspaceId);

    const dealsByStage: Record<DealStage, number> = {
      [DealStage.PROSPECT]: 0,
      [DealStage.QUALIFIED]: 0,
      [DealStage.PROPOSAL]: 0,
      [DealStage.NEGOTIATION]: 0,
      [DealStage.CLOSED_WON]: 0,
      [DealStage.CLOSED_LOST]: 0,
    };

    let totalPipeline = 0;
    let closedWonCount = 0;
    let closedLostCount = 0;

    scopedDeals.forEach((deal) => {
      if (Object.prototype.hasOwnProperty.call(dealsByStage, deal.stage)) {
        dealsByStage[deal.stage]++;
      }
      totalPipeline += deal.value * (deal.probability || 0.5);
      if (deal.stage === DealStage.CLOSED_WON) closedWonCount++;
      else if (deal.stage === DealStage.CLOSED_LOST) closedLostCount++;
    });

    const totalClosed = closedWonCount + closedLostCount;
    const winRate = totalClosed > 0 ? closedWonCount / totalClosed : 0;
    const avgDealSize = scopedDeals.length > 0
      ? scopedDeals.reduce((sum, d) => sum + d.value, 0) / scopedDeals.length
      : 0;

    return {
      workspaceId,
      month: new Date().toISOString().slice(0, 7),
      totalPipeline: Math.round(totalPipeline),
      dealsByStage,
      winRate: Math.round(winRate * 100) / 100,
      avgDealSize: Math.round(avgDealSize),
      salesCycle: 30,
    };
  }

  /**
   * Forecast revenue realization from pipeline.
   * Pure function — no DB access, no side effects.
   */
  static forecastPipelineRevenue(
    workspaceId: string,
    deals: SalesDeal[],
    months: number = 3
  ): {
    forecastByMonth: Record<number, number>;
    totalForecast: number;
    confidence: number;
  } {
    if (!workspaceId || !deals || deals.length === 0) {
      return { forecastByMonth: {}, totalForecast: 0, confidence: 0 };
    }

    const scopedDeals = deals.filter(d => !d.workspaceId || d.workspaceId === workspaceId);

    const forecastByMonth: Record<number, number> = {};
    let totalForecast = 0;

    for (let month = 1; month <= months; month++) {
      let monthRevenue = 0;
      scopedDeals.forEach((deal) => {
        const closeDate = new Date(deal.expectedCloseDate);
        const monthsUntilClose = (closeDate.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);
        if (monthsUntilClose <= month && monthsUntilClose > month - 1) {
          monthRevenue += deal.value * (deal.probability || 0.5);
        }
      });
      forecastByMonth[month] = Math.round(monthRevenue);
      totalForecast += monthRevenue;
    }

    return {
      forecastByMonth,
      totalForecast: Math.round(totalForecast),
      confidence: Math.max(0.3, 1 - months * 0.15),
    };
  }

  /**
   * Analyze pipeline health and identify bottlenecks.
   * Pure function — no DB access, no side effects.
   */
  static analyzePipelineHealth(
    workspaceId: string,
    pipeline: SalesPipeline
  ): {
    healthScore: number;
    bottleneckStage: string | null;
    recommendation: string;
    metrics: {
      pipelineEfficiency: number;
      stageConversion: number;
      dealVelocity: string;
    };
  } {
    if (!workspaceId) {
      return {
        healthScore: 0,
        bottleneckStage: null,
        recommendation: "Workspace ID is required",
        metrics: { pipelineEfficiency: 0, stageConversion: 0, dealVelocity: "UNKNOWN" },
      };
    }

    const winRateScore = pipeline.winRate * 50;
    const pipelineScore = Math.min(50, (pipeline.totalPipeline / 500000) * 50);
    const healthScore = Math.round(winRateScore + pipelineScore);

    const stageValues = Object.entries(pipeline.dealsByStage);
    const bottleneckStage = stageValues.reduce((prev, curr) =>
      (curr[1] || 0) > (prev[1] || 0) ? curr : prev
    )[0] as string | null;

    const pipelineEfficiency = pipeline.salesCycle > 0
      ? Math.round((pipeline.avgDealSize / pipeline.salesCycle) * 100) / 100
      : 0;

    const qualifiedCount = pipeline.dealsByStage[DealStage.QUALIFIED] || 0;
    const prospectCount = pipeline.dealsByStage[DealStage.PROSPECT] || 0;
    const stageConversion = prospectCount > 0 ? qualifiedCount / prospectCount : 0;

    let dealVelocity = "STABLE";
    if (pipeline.salesCycle < 20) dealVelocity = "FAST";
    else if (pipeline.salesCycle > 45) dealVelocity = "SLOW";

    let recommendation = "Pipeline is healthy.";
    if (healthScore < 50) {
      recommendation = "Pipeline needs growth. Focus on prospecting.";
    } else if (pipeline.winRate < 0.2) {
      recommendation = "Win rate is low. Improve qualification criteria and deal quality.";
    } else if (dealVelocity === "SLOW") {
      recommendation = "Sales cycle is extending. Identify and remove obstacles.";
    }

    return {
      healthScore,
      bottleneckStage,
      recommendation,
      metrics: {
        pipelineEfficiency,
        stageConversion: Math.round(stageConversion * 100) / 100,
        dealVelocity,
      },
    };
  }

  /**
   * Identify opportunities in a caller-supplied deal array.
   * Pure function — no DB access, no side effects.
   */
  static identifyOpportunities(
    workspaceId: string,
    deals: SalesDeal[]
  ): {
    highValueEarlyStageDeals: SalesDeal[];
    atRiskDeals: SalesDeal[];
    closingDeals: SalesDeal[];
  } {
    if (!workspaceId || !deals || deals.length === 0) {
      return { highValueEarlyStageDeals: [], atRiskDeals: [], closingDeals: [] };
    }

    const scopedDeals = deals.filter(d => !d.workspaceId || d.workspaceId === workspaceId);

    const highValueEarlyStageDeals = scopedDeals.filter(
      (d) =>
        (d.stage === DealStage.PROSPECT || d.stage === DealStage.QUALIFIED) &&
        d.value > 50000
    );

    const atRiskDeals = scopedDeals.filter(
      (d) => d.probability !== undefined && d.probability < 0.2 && d.stage !== DealStage.CLOSED_LOST
    );

    const closingDeals = scopedDeals.filter(
      (d) => d.stage === DealStage.NEGOTIATION || d.stage === DealStage.PROPOSAL
    );

    return { highValueEarlyStageDeals, atRiskDeals, closingDeals };
  }

  private static calculateWinProbability(stage: DealStage): number {
    const probabilities: Record<DealStage, number> = {
      [DealStage.PROSPECT]: 0.05,
      [DealStage.QUALIFIED]: 0.25,
      [DealStage.PROPOSAL]: 0.65,
      [DealStage.NEGOTIATION]: 0.85,
      [DealStage.CLOSED_WON]: 1.0,
      [DealStage.CLOSED_LOST]: 0.0,
    };
    return probabilities[stage] ?? 0.5;
  }
}
