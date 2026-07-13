/**
 * Owner Finance — Pricing Analysis request validation (Zod).
 * Covers per-order economics, minimum viable price, discount safety check,
 * and optional two-segment comparison. workspaceId NEVER comes from the body.
 */
import { z } from "zod/v4";

const orderEconomicsSchema = z.strictObject({
  revenue: z.number(),
  labourCost: z.number().optional(),
  materialCost: z.number().optional(),
  deliveryCost: z.number().optional(),
  reworkCost: z.number().optional(),
  refundCost: z.number().optional(),
  otherDirectCost: z.number().optional(),
});

const resourceUsageSchema = z.strictObject({
  labourHours: z.number().optional(),
  machineHours: z.number().optional(),
  deliveryKm: z.number().optional(),
});

const segmentOrdersSchema = z.strictObject({
  name: z.string().min(1),
  orders: z.array(orderEconomicsSchema).min(1),
});

export const pricingAnalysisRequestSchema = z.strictObject({
  /** The primary order/service being analysed. */
  order: orderEconomicsSchema,
  /** Optional resource-usage context for per-resource profitability. */
  resourceUsage: resourceUsageSchema.optional(),
  /**
   * Target contribution-margin fraction (0–1) to compute minimum viable price.
   * Defaults to 0.20 (20%) when omitted.
   */
  targetMarginPct: z.number().min(0).max(0.99).optional(),
  /**
   * Proposed (discounted) price — used to evaluate discount safety.
   * Omit to skip discount-safety check.
   */
  proposedPrice: z.number().optional(),
  /**
   * Two segments to compare profitability (e.g. B2B vs retail).
   * Each must have at least one order. Omit to skip comparison.
   */
  segments: z.tuple([segmentOrdersSchema, segmentOrdersSchema]).optional(),
});

export type PricingAnalysisRequest = z.infer<typeof pricingAnalysisRequestSchema>;
