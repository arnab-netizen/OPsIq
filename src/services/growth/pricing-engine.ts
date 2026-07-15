/**
 * Growth: Pricing Engine Service
 *
 * Workspace-scoped pricing strategy, tier management, and optimization.
 * Price tiers are persisted to `growth_price_tiers` (DB-backed).
 * All writes are workspace-scoped and audit-tracked.
 *
 * Schema includes: currency, unit of measure, effective dates, version history
 * (append-only via supersededById), variable/allocated costs, customer segment,
 * channel, quantity breaks, discount structure, approval status (owner-approved
 * before operational use), provenance.
 * Derived margin is computed at read time — NOT stored.
 *
 * Pure-function methods (optimizePrice, analyzeGaps, estimateMarginImpact,
 * recommendStrategy, calculateBundleValue) have no side effects and operate
 * on caller-supplied data.
 * Only createPriceTier and listTiers touch the DB.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  PriceTier,
  PricingStrategy,
  validatePriceTier,
} from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

export interface CreatePriceTierInput {
  name: string;
  currency?: string;
  unitOfMeasure?: string;
  entryPrice: number;
  maxPrice: number;
  variableCost?: number;
  allocatedCost?: number;
  customerSegment?: string;
  channel?: string;
  quantityBreaks?: Array<{ minQty: number; price: number }>;
  discountStructure?: Array<{ type: string; value: number }>;
  features?: string[];
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  approvalStatus?: "draft" | "pending_approval" | "approved" | "archived";
  provenance?: string;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
}

export interface GrowthPriceTierRecord {
  id: string;
  workspaceId: string;
  name: string;
  currency: string;
  unitOfMeasure: string;
  entryPrice: number;
  maxPrice: number;
  variableCost: number | null;
  allocatedCost: number | null;
  customerSegment: string | null;
  channel: string | null;
  quantityBreaks: Array<{ minQty: number; price: number }> | null;
  discountStructure: Array<{ type: string; value: number }> | null;
  features: string[];
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  approvalStatus: "draft" | "pending_approval" | "approved" | "archived";
  approvedBy: string | null;
  approvedAt: Date | null;
  provenance: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  version: number;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Gross margin fraction (0–1) computed at read time from entryPrice, variableCost, allocatedCost.
   *  Null when neither cost field is present (margin unknown, not fabricated). */
  computedMargin: number | null;
}

type PriceTierRow = {
  id: string; workspaceId: string; name: string; currency: string;
  unitOfMeasure: string; entryPrice: number; maxPrice: number;
  variableCost: number | null; allocatedCost: number | null;
  customerSegment: string | null; channel: string | null;
  quantityBreaks: unknown; discountStructure: unknown; features: unknown;
  status: string; approvalStatus: string; approvedBy: string | null;
  approvedAt: Date | null; provenance: string | null;
  effectiveFrom: Date | null; effectiveTo: Date | null;
  version: number; supersededById: string | null;
  createdAt: Date; updatedAt: Date;
};

function computeMargin(entryPrice: number, variableCost: number | null, allocatedCost: number | null): number | null {
  if (entryPrice <= 0) return null;
  if (variableCost === null && allocatedCost === null) return null;
  const totalCost = (variableCost ?? 0) + (allocatedCost ?? 0);
  return Math.max(0, Math.min(1, (entryPrice - totalCost) / entryPrice));
}

function mapRow(r: PriceTierRow): GrowthPriceTierRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    currency: r.currency,
    unitOfMeasure: r.unitOfMeasure,
    entryPrice: r.entryPrice,
    maxPrice: r.maxPrice,
    variableCost: r.variableCost,
    allocatedCost: r.allocatedCost,
    customerSegment: r.customerSegment,
    channel: r.channel,
    quantityBreaks: r.quantityBreaks as GrowthPriceTierRecord["quantityBreaks"],
    discountStructure: r.discountStructure as GrowthPriceTierRecord["discountStructure"],
    features: r.features as string[],
    status: r.status as GrowthPriceTierRecord["status"],
    approvalStatus: r.approvalStatus as GrowthPriceTierRecord["approvalStatus"],
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    provenance: r.provenance,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    version: r.version,
    supersededById: r.supersededById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    computedMargin: computeMargin(r.entryPrice, r.variableCost, r.allocatedCost),
  };
}

export class PricingEngine {
  /**
   * Persist a new price tier (workspace-scoped, DB-backed).
   * Throws ValidationError on invalid data or missing workspaceId.
   * Emits PRICE_TIER_CREATED audit event.
   * Approval is required before a tier is operationally used (approvalStatus defaults to pending_approval).
   */
  static async createPriceTier(
    workspaceId: string,
    actorId: string,
    data: CreatePriceTierInput
  ): Promise<GrowthPriceTierRecord> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required for price tier creation");
    }

    const validation = validatePriceTier({
      name: data.name,
      entryPrice: data.entryPrice,
      maxPrice: data.maxPrice,
      targetMargin: 0.5, // not stored — pass placeholder to satisfy validator
      features: data.features ?? [],
    });
    if (!validation.valid) {
      throw new ValidationError(
        `Price tier validation failed: ${validation.errors.join("; ")}`
      );
    }

    const id = randomUUID();
    const row = await db.growthPriceTier.create({
      data: {
        id,
        workspaceId,
        name: data.name,
        currency: data.currency ?? "USD",
        unitOfMeasure: data.unitOfMeasure ?? "seat",
        entryPrice: data.entryPrice,
        maxPrice: data.maxPrice,
        variableCost: data.variableCost ?? null,
        allocatedCost: data.allocatedCost ?? null,
        customerSegment: data.customerSegment ?? null,
        channel: data.channel ?? null,
        quantityBreaks: data.quantityBreaks ? (data.quantityBreaks as object) : undefined,
        discountStructure: data.discountStructure ? (data.discountStructure as object) : undefined,
        features: (data.features ?? []) as object,
        status: data.status ?? "DRAFT",
        approvalStatus: data.approvalStatus ?? "pending_approval",
        provenance: data.provenance ?? null,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        version: 1,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PRICE_TIER_CREATED,
      actorId,
      entityType: "growth_price_tier",
      entityId: id,
      workspaceId,
      payload: {
        name: data.name,
        entryPrice: data.entryPrice,
        maxPrice: data.maxPrice,
        currency: data.currency ?? "USD",
        approvalStatus: data.approvalStatus ?? "pending_approval",
      },
      visibility: "internal",
    });

    return mapRow(row);
  }

  /**
   * List persisted price tiers for a workspace (workspace-scoped read).
   * Optionally filter by status.
   */
  static async listTiers(
    workspaceId: string,
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED"
  ): Promise<GrowthPriceTierRecord[]> {
    if (!workspaceId) return [];

    const rows = await db.growthPriceTier.findMany({
      where: { workspaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r: typeof rows[number]) => mapRow(r));
  }

  /**
   * Approve a price tier for operational use (workspace-scoped write).
   * Sets approvalStatus=approved, records approvedBy/approvedAt, emits audit event.
   * Throws ValidationError if tier not found in workspace.
   */
  static async approveTier(
    workspaceId: string,
    tierId: string,
    actorId: string
  ): Promise<GrowthPriceTierRecord> {
    if (!workspaceId) throw new ValidationError("Workspace ID is required");
    if (!tierId) throw new ValidationError("Tier ID is required");

    const existing = await db.growthPriceTier.findFirst({ where: { id: tierId, workspaceId } });
    if (!existing) throw new ValidationError("Price tier not found in this workspace");

    const row = await db.growthPriceTier.update({
      where: { id: tierId },
      data: { approvalStatus: "approved", approvedBy: actorId, approvedAt: new Date() },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PRICE_TIER_APPROVED,
      actorId,
      entityType: "growth_price_tier",
      entityId: tierId,
      workspaceId,
      payload: { approvedBy: actorId, name: existing.name },
      visibility: "internal",
    });

    return mapRow(row);
  }

  /**
   * Create a new version of an existing tier (append-only versioning).
   * Archives the old tier (status=ARCHIVED, supersededById=newId) and creates a new one.
   * The new tier starts as DRAFT/pending_approval.
   * Atomic: both mutations execute in a single DB transaction.
   * Throws ValidationError if the old tier is not found in this workspace.
   */
  static async supersedeTier(
    workspaceId: string,
    oldTierId: string,
    actorId: string,
    data: CreatePriceTierInput
  ): Promise<GrowthPriceTierRecord> {
    if (!workspaceId) throw new ValidationError("Workspace ID is required");
    if (!oldTierId) throw new ValidationError("Old tier ID is required");

    const validation = validatePriceTier({
      name: data.name,
      entryPrice: data.entryPrice,
      maxPrice: data.maxPrice,
      targetMargin: 0.5,
      features: data.features ?? [],
    });
    if (!validation.valid) {
      throw new ValidationError(`Price tier validation failed: ${validation.errors.join("; ")}`);
    }

    const oldTier = await db.growthPriceTier.findFirst({ where: { id: oldTierId, workspaceId } });
    if (!oldTier) throw new ValidationError("Price tier not found in this workspace");

    const newId = randomUUID();
    const newVersion = (oldTier.version ?? 1) + 1;

    const [newRow] = await db.$transaction([
      db.growthPriceTier.create({
        data: {
          id: newId,
          workspaceId,
          name: data.name,
          currency: data.currency ?? (oldTier.currency as string),
          unitOfMeasure: data.unitOfMeasure ?? (oldTier.unitOfMeasure as string),
          entryPrice: data.entryPrice,
          maxPrice: data.maxPrice,
          variableCost: data.variableCost ?? null,
          allocatedCost: data.allocatedCost ?? null,
          customerSegment: data.customerSegment ?? null,
          channel: data.channel ?? null,
          quantityBreaks: data.quantityBreaks ? (data.quantityBreaks as object) : undefined,
          discountStructure: data.discountStructure ? (data.discountStructure as object) : undefined,
          features: (data.features ?? []) as object,
          status: "DRAFT",
          approvalStatus: "pending_approval",
          provenance: data.provenance ?? null,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
          version: newVersion,
        },
      }),
      db.growthPriceTier.update({
        where: { id: oldTierId },
        data: { status: "ARCHIVED", supersededById: newId },
      }),
    ]);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PRICE_TIER_SUPERSEDED,
      actorId,
      entityType: "growth_price_tier",
      entityId: oldTierId,
      workspaceId,
      payload: { newTierId: newId, newVersion, oldVersion: oldTier.version, name: oldTier.name },
      visibility: "internal",
    });

    return mapRow(newRow as PriceTierRow);
  }

  /**
   * Calculate optimal price for a tier based on elasticity.
   * Pure function — no DB access.
   */
  static optimizePrice(
    workspaceId: string,
    tier: PriceTier,
    currentPrice: number,
    elasticity: number = -0.5
  ): { recommendedPrice: number; confidence: number } {
    if (!workspaceId || tier.workspaceId !== workspaceId) {
      return { recommendedPrice: currentPrice, confidence: 0 };
    }

    const volumeImpact = elasticity * 5;
    const revenueImpact = (5 + volumeImpact) / 100;

    let recommendedPrice = currentPrice;
    let confidence = 0.5;

    if (revenueImpact > 0) {
      recommendedPrice = currentPrice * (1 + revenueImpact / 100);
      confidence = Math.min(0.9, 0.5 + Math.abs(elasticity) * 0.5);
    } else if (revenueImpact <= 0 && Math.abs(elasticity) > 0.8) {
      recommendedPrice = currentPrice * 0.95;
      confidence = Math.min(0.9, 0.5 + Math.abs(elasticity) * 0.1);
    } else if (revenueImpact < -0.02) {
      recommendedPrice = currentPrice * 0.95;
      confidence = 0.6;
    }

    recommendedPrice = Math.max(tier.entryPrice, Math.min(tier.maxPrice, recommendedPrice));
    return { recommendedPrice, confidence };
  }

  /**
   * Compare pricing across tiers to detect gaps and overlaps.
   * Pure function — no DB access.
   * Only analyzes ACTIVE tiers belonging to the given workspace.
   */
  static analyzeGaps(
    workspaceId: string,
    tiers: PriceTier[]
  ): {
    gaps: Array<{ name: string; minPrice: number; maxPrice: number }>;
    overlaps: Array<{ tier1: string; tier2: string }>;
  } {
    if (!workspaceId) return { gaps: [], overlaps: [] };

    const scopedTiers = tiers
      .filter((t) => t.workspaceId === workspaceId && t.status === "ACTIVE")
      .sort((a, b) => a.entryPrice - b.entryPrice);

    const gaps: Array<{ name: string; minPrice: number; maxPrice: number }> = [];
    const overlaps: Array<{ tier1: string; tier2: string }> = [];

    for (let i = 0; i < scopedTiers.length - 1; i++) {
      const current = scopedTiers[i];
      const next = scopedTiers[i + 1];

      if (next.entryPrice > current.maxPrice + 1) {
        gaps.push({
          name: `Gap between ${current.name} and ${next.name}`,
          minPrice: current.maxPrice,
          maxPrice: next.entryPrice,
        });
      } else if (next.entryPrice < current.maxPrice) {
        overlaps.push({ tier1: current.name, tier2: next.name });
      }
    }

    return { gaps, overlaps };
  }

  /**
   * Estimate margin impact of a price change.
   * Pure function — no DB access.
   * Margin = (price - costOfGoods) / price (computed at call time, not stored).
   * If tier.workspaceId doesn't match workspaceId, returns fail-closed zeros.
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

    const currentMargin = tier.entryPrice > 0
      ? (tier.entryPrice - costOfGoods) / tier.entryPrice
      : 0;
    const newMargin = newPrice > 0 ? (newPrice - costOfGoods) / newPrice : 0;

    return {
      currentMargin: Math.max(0, Math.min(1, currentMargin)),
      newMargin: Math.max(0, Math.min(1, newMargin)),
      marginChange: newMargin - currentMargin,
    };
  }

  /**
   * Recommend pricing strategy based on market position.
   * Pure function — no DB access.
   */
  static recommendStrategy(
    workspaceId: string,
    competitorAvgPrice: number,
    targetMargin: number,
    costOfGoods: number
  ): PricingStrategy {
    if (!workspaceId) return PricingStrategy.COMPETITIVE;

    const costPlusMin = costOfGoods * (1 + targetMargin);
    if (costPlusMin > competitorAvgPrice * 1.1) return PricingStrategy.PENETRATION;
    if (competitorAvgPrice > costOfGoods * 3 && targetMargin < 0.6) return PricingStrategy.SKIMMING;
    if (targetMargin >= 0.5) return PricingStrategy.VALUE_BASED;
    return PricingStrategy.COMPETITIVE;
  }

  /**
   * Calculate bundled tier value (sum of feature prices).
   * Pure function — no DB access.
   */
  static calculateBundleValue(
    tier: PriceTier,
    featurePrices: Record<string, number>
  ): {
    bundledValue: number;
    discount: number;
  } {
    if (!tier.features || tier.features.length === 0) {
      return { bundledValue: 0, discount: 0 };
    }

    const totalFeatureValue = tier.features.reduce(
      (sum, feature) => sum + (featurePrices[feature] ?? 0),
      0
    );
    const discount = totalFeatureValue > 0
      ? ((totalFeatureValue - tier.entryPrice) / totalFeatureValue) * 100
      : 0;

    return { bundledValue: totalFeatureValue, discount: Math.max(0, discount) };
  }
}
