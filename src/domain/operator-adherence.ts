// Operator Adherence Profile: Track adherence using observable operational signals
// Phase 2: Measure operator follow-through on recommendations using only observable actions (no subjective assessment)

import { z } from 'zod';

export const AdherenceSignalType = z.enum([
  'action_started', // Action status changed from draft to in_progress
  'action_completed', // Action status changed to completed
  'action_verified', // Action was verified/validated
  'recommendation_accepted', // Operator explicitly accepted recommendation
  'recommendation_acted_on', // Recommendation transitioned to action
  'meeting_scheduled', // Evidence of engagement/commitment
  'documentation_provided', // Evidence of follow-through
  'milestone_reached', // Measurable progress on action
  'deadline_met', // Completion within committed timeframe
  'deadline_missed', // Completion after deadline
]);
export type AdherenceSignalType = z.infer<typeof AdherenceSignalType>;

export const OperatorAdherenceProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  operatorId: z.string().uuid(),
  // Counters based on observable signals only
  totalRecommendations: z.number().nonnegative().default(0),
  recommendationsAccepted: z.number().nonnegative().default(0),
  recommendationsActedOn: z.number().nonnegative().default(0),
  actionsStarted: z.number().nonnegative().default(0),
  actionsCompleted: z.number().nonnegative().default(0),
  actionsVerified: z.number().nonnegative().default(0),
  milestonesReached: z.number().nonnegative().default(0),
  deadlinesMet: z.number().nonnegative().default(0),
  deadlinesMissed: z.number().nonnegative().default(0),
  // Derived metrics
  acceptanceRate: z.number().min(0).max(100).nullable().optional(), // %
  completionRate: z.number().min(0).max(100).nullable().optional(), // %
  onTimeRate: z.number().min(0).max(100).nullable().optional(), // %
  adherenceScore: z.number().min(0).max(100).nullable().optional(), // Overall 0-100
  adherenceStatus: z.enum(['excellent', 'good', 'fair', 'poor', 'new']).default('new'),
  lastSignalAt: z.date().nullable().optional(),
  lastSignalType: z.string().nullable().optional(),
  reviewNotes: z.string().max(1024).nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type OperatorAdherenceProfile = z.infer<typeof OperatorAdherenceProfileSchema>;

export const CreateOperatorAdherenceRequestSchema = z.object({
  engagementId: z.string().uuid(),
  operatorId: z.string().uuid(),
});

export type CreateOperatorAdherenceRequest = z.infer<
  typeof CreateOperatorAdherenceRequestSchema
>;

export const RecordAdherenceSignalRequestSchema = z.object({
  adherenceId: z.string().uuid(),
  signalType: AdherenceSignalType,
  referencedEntityId: z.string().uuid().optional(), // action or recommendation ID
  notes: z.string().max(500).optional(),
});

export type RecordAdherenceSignalRequest = z.infer<
  typeof RecordAdherenceSignalRequestSchema
>;
