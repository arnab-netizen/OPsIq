/**
 * Phase 9 Slice 2: Revenue Engine Service
 *
 * Implements revenue modeling, stream management, and forecasting.
 * Builds on growth-engines.ts domain contracts.
 *
 * CRITICAL: Service operates on workspace-scoped data only.
 * All inputs must include workspaceId for tenant safety.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  RevenueStream,
  RevenueForecast,
  RevenueModel,
  BillingCycle,
  validateRevenueStream,
} from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

export interface RevenueStreamRecord {
  id: string;
  workspaceId: string;
  name: string;
  model: string;
  billingCycle: string;
  basePrice: number;
  currency: string;
  volume?: number | null;
  volumeUnit?: string | null;
  activationDate?: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Revenue Engine Service
 * Manages revenue streams, forecasting, and analysis
 */
export class RevenueEngine {
  /**
   * Persist a new revenue stream (workspace-scoped, DB-backed).
   * Throws ValidationError on invalid data or missing workspaceId.
   * Emits REVENUE_STREAM_CREATED audit event.
   */
  static async persistStream(
    workspaceId: string,
    actorId: string,
    data: Partial<RevenueStream>
  ): Promise<RevenueStreamRecord> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required for revenue stream creation");
    }

    const validationData = {
      name: data.name,
      model: data.model || RevenueModel.SUBSCRIPTION,
      billingCycle: data.billingCycle || BillingCycle.MONTHLY,
      basePrice: data.basePrice ?? 0,
      currency: data.currency || "USD",
    };
    const validation = validateRevenueStream(validationData);
    if (!validation.valid) {
      throw new ValidationError(
        `Revenue stream validation failed: ${validation.errors.join("; ")}`
      );
    }

    const id = randomUUID();
    const row = await db.revenueStreamRecord.create({
      data: {
        id,
        workspaceId,
        name: data.name!,
        model: (data.model || RevenueModel.SUBSCRIPTION) as string,
        billingCycle: (data.billingCycle || BillingCycle.MONTHLY) as string,
        basePrice: data.basePrice ?? 0,
        currency: data.currency ?? "USD",
        volume: data.volume ?? null,
        volumeUnit: data.volumeUnit ?? null,
        activationDate: data.activationDate ?? null,
        status: data.status ?? "DRAFT",
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.REVENUE_STREAM_CREATED,
      actorId,
      entityType: "revenue_stream_record",
      entityId: id,
      workspaceId,
      payload: { name: row.name, model: row.model, basePrice: row.basePrice },
      visibility: "internal",
    });

    return row;
  }

  /**
   * List persisted revenue streams for a workspace (workspace-scoped read).
   * Optionally filter by status. Ordered newest first.
   */
  static async listStreams(
    workspaceId: string,
    status?: string
  ): Promise<RevenueStreamRecord[]> {
    return db.revenueStreamRecord.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Create and validate a new revenue stream (in-memory, for validation only).
   * Use persistStream() to write to DB.
   */
  static createRevenueStream(
    workspaceId: string,
    data: Partial<RevenueStream>
  ): { stream: RevenueStream | null; error: string | null } {
    if (!workspaceId || workspaceId.length === 0) {
      return { stream: null, error: "Workspace ID is required for revenue stream creation" };
    }

    const validationData = {
      name: data.name,
      model: data.model || RevenueModel.SUBSCRIPTION,
      billingCycle: data.billingCycle || BillingCycle.MONTHLY,
      basePrice: data.basePrice ?? 0,
      currency: data.currency || "USD",
    };
    const validation = validateRevenueStream(validationData);
    if (!validation.valid) {
      return { stream: null, error: `Revenue stream validation failed: ${validation.errors.join("; ")}` };
    }

    const stream: RevenueStream = {
      id: randomUUID(),
      workspaceId,
      name: data.name || "Unnamed Stream",
      model: data.model || RevenueModel.SUBSCRIPTION,
      billingCycle: data.billingCycle || BillingCycle.MONTHLY,
      basePrice: data.basePrice ?? 0,
      currency: data.currency || "USD",
      volume: data.volume,
      volumeUnit: data.volumeUnit,
      activationDate: data.activationDate || new Date(),
      status: data.status || "DRAFT",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as RevenueStream;

    return { stream, error: null };
  }

  /**
   * Calculate blended revenue metric across streams
   */
  static calculateBlendedMetric(
    workspaceId: string,
    streams: RevenueStream[],
    metricName: "basePrice" | "volume"
  ): { value: number; count: number; average: number } {
    if (!workspaceId) {
      return { value: 0, count: 0, average: 0 };
    }

    // Filter to workspace scope
    const scopedStreams = streams.filter((s) => s.workspaceId === workspaceId && s.status === "ACTIVE");

    if (scopedStreams.length === 0) {
      return { value: 0, count: 0, average: 0 };
    }

    const values = scopedStreams
      .map((s) => (s as any)[metricName] || 0)
      .filter((v) => typeof v === "number" && v > 0);

    const sum = values.reduce((a, b) => a + b, 0);
    const average = values.length > 0 ? sum / values.length : 0;

    return {
      value: sum,
      count: values.length,
      average,
    };
  }

  /**
   * Forecast monthly revenue based on current streams
   */
  static forecastRevenue(
    workspaceId: string,
    streams: RevenueStream[],
    month: string // YYYY-MM format
  ): RevenueForecast {
    if (!workspaceId) {
      return {
        workspaceId,
        month,
        baselineRevenue: 0,
        projectedRevenue: 0,
        variance: 0,
        variancePercent: 0,
        confidence: 0,
        driversByStream: {},
      };
    }

    // Filter to workspace
    const scopedStreams = streams.filter((s) => s.workspaceId === workspaceId && s.status === "ACTIVE");

    // Calculate baseline: sum of all active stream base prices
    const baselineRevenue = scopedStreams.reduce((sum, stream) => {
      // Simple forecast: base price × estimated units
      const units = stream.volume || 10; // Default to 10 units if not specified
      return sum + stream.basePrice * units;
    }, 0);

    // Project with small variance for realism
    const variance = baselineRevenue * 0.05; // 5% variance
    const projectedRevenue = baselineRevenue + variance;

    // Build driver breakdown
    const driversByStream: Record<string, number> = {};
    scopedStreams.forEach((stream) => {
      const units = stream.volume || 10;
      driversByStream[stream.name] = stream.basePrice * units;
    });

    return {
      workspaceId,
      month,
      baselineRevenue,
      projectedRevenue,
      variance,
      variancePercent: baselineRevenue > 0 ? (variance / baselineRevenue) * 100 : 0,
      confidence: scopedStreams.length > 0 ? 0.75 : 0.5, // Higher confidence with more streams
      driversByStream,
    };
  }

  /**
   * Analyze revenue stream health
   */
  static analyzeStreamHealth(
    workspaceId: string,
    stream: RevenueStream
  ): {
    isHealthy: boolean;
    score: number; // 0-100
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 100;

    // Tenant safety check
    if (!workspaceId || stream.workspaceId !== workspaceId) {
      return {
        isHealthy: false,
        score: 0,
        factors: ["Workspace mismatch or unauthorized access"],
      };
    }

    // Status check
    if (stream.status === "DRAFT") {
      factors.push("Stream not yet active");
      score -= 25;
    } else if (stream.status === "DEPRECATED") {
      factors.push("Stream is deprecated and sunset");
      score -= 40;
    }

    // Price check
    if (stream.basePrice <= 0) {
      factors.push("Base price is zero or negative");
      score -= 35;
    } else if (stream.basePrice < 10) {
      factors.push("Base price is very low (< $10)");
      score -= 10;
    }

    // Billing cycle check
    const validCycles = ["MONTHLY", "QUARTERLY", "ANNUAL", "USAGE"];
    if (!validCycles.includes(stream.billingCycle)) {
      factors.push("Invalid billing cycle");
      score -= 15;
    }

    // Activation check
    const ageInDays = (Date.now() - stream.activationDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7 && stream.status === "ACTIVE") {
      factors.push("Stream recently activated (< 7 days)");
      score -= 5;
    }

    return {
      isHealthy: score >= 70,
      score: Math.max(0, Math.min(100, score)),
      factors: factors.length > 0 ? factors : ["Stream health is good"],
    };
  }

  /**
   * Calculate revenue retention rate (month-over-month)
   */
  static calculateRetentionRate(
    workspaceId: string,
    currentMonth: number, // Total revenue in current month
    previousMonth: number // Total revenue in previous month
  ): number {
    if (!workspaceId || previousMonth <= 0) {
      return 0;
    }

    // Retention = (Revenue not lost) / Previous revenue
    // Simplified: currentMonth / previousMonth
    const retention = (currentMonth / previousMonth) * 100;

    // Cap at 200% (could have growth beyond retention)
    return Math.min(200, Math.max(0, retention));
  }

  /**
   * Identify revenue stream performance tier
   */
  static classifyStreamPerformance(
    basePrice: number,
    volume: number = 10
  ): "LOW" | "MEDIUM" | "HIGH" {
    const mrr = basePrice * volume;

    if (mrr < 1000) {
      return "LOW";
    } else if (mrr < 10000) {
      return "MEDIUM";
    } else {
      return "HIGH";
    }
  }
}
