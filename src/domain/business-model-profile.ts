// Business Model Profile: Support hybrid business model configurations
// Phase 2: Model how businesses combine different business models, revenue streams, and delivery modes

import { z } from 'zod';

export const BusinessModelType = z.enum([
  'saas',
  'marketplace',
  'subscription',
  'freemium',
  'licensing',
  'services',
  'product_sales',
  'hybrid',
  'other',
]);
export type BusinessModelType = z.infer<typeof BusinessModelType>;

export const DeliveryMode = z.enum([
  'self_service',
  'managed_service',
  'professional_services',
  'hybrid',
]);
export type DeliveryMode = z.infer<typeof DeliveryMode>;

export const BusinessMaturityState = z.enum(['SURVIVAL', 'STABILIZE', 'GROWTH', 'SCALE']);
export type BusinessMaturityState = z.infer<typeof BusinessMaturityState>;

export const BusinessModelProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  primaryModel: BusinessModelType,
  secondaryModels: z.array(BusinessModelType).default([]),
  description: z.string().max(1024).nullable().optional(),
  // Revenue composition (percentages, should sum to ~100)
  revenueMix: z.object({
    subscription: z.number().min(0).max(100).default(0),
    oneTime: z.number().min(0).max(100).default(0),
    services: z.number().min(0).max(100).default(0),
    other: z.number().min(0).max(100).default(0),
  }),
  // Margin composition by stream
  marginMix: z.object({
    subscription: z.number().min(0).max(100).nullable().optional(), // %
    oneTime: z.number().min(0).max(100).nullable().optional(),
    services: z.number().min(0).max(100).nullable().optional(),
  }),
  // How customers access product/service
  deliveryModes: z.array(DeliveryMode).default(['self_service']),
  // Ratio of recurring vs one-time revenue
  recurringVsOneTimePercentage: z.number().min(0).max(100).nullable().optional(),
  // Business model complexity (1-10)
  operationalComplexityScore: z.number().min(1).max(10).default(5),
  // Maturity state of the business
  maturityState: BusinessMaturityState.default('SURVIVAL'),
  notes: z.string().max(1024).nullable().optional(),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BusinessModelProfile = z.infer<typeof BusinessModelProfileSchema>;

export const CreateBusinessModelRequestSchema = z.object({
  engagementId: z.string().uuid(),
  primaryModel: BusinessModelType,
  secondaryModels: z.array(BusinessModelType).optional(),
  description: z.string().max(1024).optional(),
  revenueMix: z.object({
    subscription: z.number().min(0).max(100).optional(),
    oneTime: z.number().min(0).max(100).optional(),
    services: z.number().min(0).max(100).optional(),
    other: z.number().min(0).max(100).optional(),
  }).optional(),
  marginMix: z.object({
    subscription: z.number().min(0).max(100).optional(),
    oneTime: z.number().min(0).max(100).optional(),
    services: z.number().min(0).max(100).optional(),
  }).optional(),
  deliveryModes: z.array(DeliveryMode).optional(),
  recurringVsOneTimePercentage: z.number().min(0).max(100).optional(),
  operationalComplexityScore: z.number().min(1).max(10).optional(),
  maturityState: BusinessMaturityState.optional(),
  notes: z.string().max(1024).optional(),
});

export type CreateBusinessModelRequest = z.infer<typeof CreateBusinessModelRequestSchema>;
