// Domain model for engagement-level business context
// Captures business model, maturity, constraints needed for recommendation evaluation

import { z } from 'zod';

export const BusinessMaturityState = z.enum(['SURVIVAL', 'STABILIZE', 'GROWTH', 'SCALE']);
export type BusinessMaturityState = z.infer<typeof BusinessMaturityState>;

export const EngagementBusinessProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  businessName: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  businessModelType: z.string().nullable().optional(),
  maturityState: BusinessMaturityState,
  annualRevenue: z.number().int().positive().nullable().optional(),
  foundingYear: z.number().int().min(1900).max(2100).nullable().optional(),
  employeeCount: z.number().int().nonnegative().nullable().optional(),
  geoFocus: z.string().nullable().optional(),
  primaryServiceOrProduct: z.string().nullable().optional(),
  secondaryServicesOrProducts: z.string().nullable().optional(),
  revenueRecurringPercent: z.number().int().min(0).max(100).nullable().optional(),
  marginHealthAssessment: z.enum(['healthy', 'declining', 'at_risk']).nullable().optional(),
  customerConcentrationLevel: z.enum(['low', 'medium', 'high']).nullable().optional(),
  operationalMaturityLevel: z.enum(['low', 'medium', 'high']).nullable().optional(),
  keyContext: z.string().nullable().optional(),
  contextProvidedAt: z.date().nullable().optional(),
  contextProvidedBy: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EngagementBusinessProfile = z.infer<typeof EngagementBusinessProfileSchema>;

export const CreateEngagementBusinessProfileRequestSchema = z.object({
  engagementId: z.string().uuid(),
  businessName: z.string().optional(),
  industry: z.string().optional(),
  businessModelType: z.string().optional(),
  maturityState: BusinessMaturityState.optional().default('STABILIZE'),
  annualRevenue: z.number().int().positive().optional(),
  foundingYear: z.number().int().min(1900).max(2100).optional(),
  employeeCount: z.number().int().nonnegative().optional(),
  geoFocus: z.string().optional(),
  primaryServiceOrProduct: z.string().optional(),
  secondaryServicesOrProducts: z.string().optional(),
  revenueRecurringPercent: z.number().int().min(0).max(100).optional(),
  marginHealthAssessment: z.enum(['healthy', 'declining', 'at_risk']).optional(),
  customerConcentrationLevel: z.enum(['low', 'medium', 'high']).optional(),
  operationalMaturityLevel: z.enum(['low', 'medium', 'high']).optional(),
  keyContext: z.string().optional(),
  contextProvidedBy: z.string().uuid().optional(),
});

export type CreateEngagementBusinessProfileRequest = z.infer<typeof CreateEngagementBusinessProfileRequestSchema>;
