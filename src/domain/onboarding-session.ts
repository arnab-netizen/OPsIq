// OnboardingSession: Quick-start context delivery
// Phase 2: Enable operators to quickly orient to business context and constraints

import { z } from 'zod';

export const OnboardingContextType = z.enum([
  'full_context',
  'constraint_snapshot',
  'kpi_summary',
  'health_digest',
]);
export type OnboardingContextType = z.infer<typeof OnboardingContextType>;

export const OnboardingSessionStatus = z.enum([
  'draft',
  'prepared',
  'delivered',
  'completed',
  'expired',
]);
export type OnboardingSessionStatus = z.infer<typeof OnboardingSessionStatus>;

export const QuickStartContextSchema = z.object({
  businessModelSnapshot: z.object({
    primaryModel: z.string(),
    isDiversified: z.boolean(),
    complexity: z.enum(['simple', 'moderate', 'complex', 'very_complex']),
    maturityState: z.string(),
  }),
  constraintSummary: z.object({
    financialStatus: z.enum(['strong', 'adequate', 'strained', 'critical']).optional(),
    customerHealthStatus: z.enum(['strong', 'healthy', 'at_risk', 'critical']).optional(),
    capacityStatus: z.enum(['adequate', 'constrained', 'critical']).optional(),
    complianceGapCount: z.number().int().optional(),
    totalConstraintCount: z.number().int(),
  }),
  keyMetrics: z.object({
    revenueGrowthTrend: z.string().optional(),
    customerChurnRisk: z.string().optional(),
    teamCapacityUtilization: z.number().optional(),
    budgetUtilizationPercent: z.number().optional(),
  }),
  operatorReadiness: z.object({
    hasRecentHistory: z.boolean(),
    hasAdherenceData: z.boolean(),
    contextFreshnessHours: z.number().optional(),
  }),
});
export type QuickStartContext = z.infer<typeof QuickStartContextSchema>;

export const OnboardingSessionSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  operatorId: z.string().uuid(),
  contextType: OnboardingContextType,
  status: OnboardingSessionStatus,
  quickStartContext: QuickStartContextSchema,
  preparedContext: z.string().nullable().optional(), // HTML/markdown summary
  keyRecommendationPointers: z.array(z.string()).default([]), // Recommendation IDs or topics
  emergencyItems: z.array(z.string()).default([]), // Critical issues to address first
  deliveredAt: z.date().nullable().optional(),
  viewedAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  notes: z.string().max(1024).nullable().optional(),
  preparedBy: z.string().uuid().nullable().optional(),
  preparedAt: z.date().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type OnboardingSession = z.infer<typeof OnboardingSessionSchema>;
