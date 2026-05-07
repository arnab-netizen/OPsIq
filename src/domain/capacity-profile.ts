// Domain model for engagement-level operational capacity constraints
// Phase 2: Captures team, infrastructure, and execution capacity

import { z } from 'zod';

export const CapacityHealthStatus = z.enum(['abundant', 'adequate', 'constrained', 'critical']);
export type CapacityHealthStatus = z.infer<typeof CapacityHealthStatus>;

export const CapacityProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  totalTeamSize: z.number().int().nonnegative().nullable().optional(),
  keyPersonCount: z.number().int().nonnegative().nullable().optional(),
  averageExperienceYears: z.number().nonnegative().nullable().optional(),
  turnoverRateAnnual: z.number().min(0).max(1).nullable().optional(), // 0.0-1.0
  managerialCapacityLevel: z.enum(['low', 'adequate', 'strong']).nullable().optional(),
  trainingCapacityLevel: z.enum(['low', 'adequate', 'strong']).nullable().optional(),
  systemsAvailableCapacity: z.number().int().nonnegative().nullable().optional(), // % spare capacity
  infrastructureAgeYears: z.number().int().nonnegative().nullable().optional(),
  hardwareRefreshCycleMonths: z.number().int().nonnegative().nullable().optional(),
  cloudVsOnPremisePercentage: z.number().min(0).max(100).nullable().optional(),
  uptime99Count: z.number().int().nonnegative().nullable().optional(), // number of 9s
  dataCenterRedundancyLevel: z.enum(['none', 'partial', 'full']).nullable().optional(),
  apiRateLimitHeadroom: z.number().min(0).max(1).nullable().optional(), // 0.0-1.0
  securityComplianceGaps: z.number().int().nonnegative().nullable().optional(), // count
  capabilityGapsIdentified: z.number().int().nonnegative().nullable().optional(), // count
  projectCapacityUtilization: z.number().min(0).max(100).nullable().optional(), // % utilization
  overallCapacityStatus: CapacityHealthStatus.default('adequate'),
  criticalCapacityBottleneck: z.string().nullable().optional(),
  assessedBy: z.string().uuid().nullable().optional(),
  assessedAt: z.date().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CapacityProfile = z.infer<typeof CapacityProfileSchema>;

export const CreateCapacityProfileRequestSchema = z.object({
  engagementId: z.string().uuid(),
  totalTeamSize: z.number().int().nonnegative().optional(),
  keyPersonCount: z.number().int().nonnegative().optional(),
  averageExperienceYears: z.number().nonnegative().optional(),
  turnoverRateAnnual: z.number().min(0).max(1).optional(),
  managerialCapacityLevel: z.enum(['low', 'adequate', 'strong']).optional(),
  trainingCapacityLevel: z.enum(['low', 'adequate', 'strong']).optional(),
  systemsAvailableCapacity: z.number().int().nonnegative().optional(),
  infrastructureAgeYears: z.number().int().nonnegative().optional(),
  hardwareRefreshCycleMonths: z.number().int().nonnegative().optional(),
  cloudVsOnPremisePercentage: z.number().min(0).max(100).optional(),
  uptime99Count: z.number().int().nonnegative().optional(),
  dataCenterRedundancyLevel: z.enum(['none', 'partial', 'full']).optional(),
  apiRateLimitHeadroom: z.number().min(0).max(1).optional(),
  securityComplianceGaps: z.number().int().nonnegative().optional(),
  capabilityGapsIdentified: z.number().int().nonnegative().optional(),
  projectCapacityUtilization: z.number().min(0).max(100).optional(),
  overallCapacityStatus: CapacityHealthStatus.optional().default('adequate'),
  criticalCapacityBottleneck: z.string().optional(),
  assessedBy: z.string().uuid().optional(),
});

export type CreateCapacityProfileRequest = z.infer<typeof CreateCapacityProfileRequestSchema>;
