// Recommendation Lifecycle: Expiration policy and state transitions
// Phase 2: Ensure recommendations don't persist when underlying assumptions become stale

import { z } from 'zod';

export const RecommendationStatus = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'accepted',
  'in_progress',
  'completed',
  'expired',
  'cancelled',
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatus>;

export const RecommendationExpiryReason = z.enum([
  'explicit_expiration',
  'stale_evidence',
  'assumption_changed',
  'context_changed',
  'manual_cancellation',
  'action_superseded',
]);
export type RecommendationExpiryReason = z.infer<typeof RecommendationExpiryReason>;

export const RecommendationLifecycleSchema = z.object({
  id: z.string().uuid(),
  recommendationId: z.string().uuid(),
  engagementId: z.string().uuid(),
  status: RecommendationStatus.default('pending_review'),
  createdAt: z.date(),
  expiresAt: z.date().nullable().optional(), // When this recommendation becomes non-actionable
  expiredAt: z.date().nullable().optional(), // When expiration was triggered
  expiryReason: RecommendationExpiryReason.nullable().optional(),
  approvedAt: z.date().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  rejectedAt: z.date().nullable().optional(),
  rejectedBy: z.string().uuid().nullable().optional(),
  rejectionReason: z.string().max(1024).nullable().optional(),
  acceptedAt: z.date().nullable().optional(),
  acceptedBy: z.string().uuid().nullable().optional(),
  activatedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  completedBy: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true), // false if expired, cancelled, or superseded
  version: z.number().int().positive(),
  updatedAt: z.date(),
});

export type RecommendationLifecycle = z.infer<typeof RecommendationLifecycleSchema>;

export const CreateRecommendationLifecycleRequestSchema = z.object({
  recommendationId: z.string().uuid(),
  engagementId: z.string().uuid(),
  expiresAt: z.date().optional(), // Optional explicit expiration date
});

export type CreateRecommendationLifecycleRequest = z.infer<
  typeof CreateRecommendationLifecycleRequestSchema
>;

// Default expiration windows based on evidence quality and stability
export const EXPIRATION_DEFAULTS = {
  HIGH_CONFIDENCE_STABLE: 90, // days - strong evidence, stable context
  MEDIUM_CONFIDENCE: 30, // days - decent evidence, moderate risk
  LOW_CONFIDENCE: 7, // days - weak evidence, high change risk
  EMERGENCY_ACTION: 14, // days - survival-critical, reevaluate quickly
  CONTINGENCY: 365, // days - long-term planning, rare updates
} as const;
