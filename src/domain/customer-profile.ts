// Domain model for engagement-level customer constraints
// Phase 2: Captures customer concentration, concentration risk, and customer health

import { z } from 'zod';

export const CustomerHealthStatus = z.enum(['strong', 'healthy', 'at_risk', 'critical']);
export type CustomerHealthStatus = z.infer<typeof CustomerHealthStatus>;

export const ConcentrationRiskLevel = z.enum(['low', 'medium', 'high', 'critical']);
export type ConcentrationRiskLevel = z.infer<typeof ConcentrationRiskLevel>;

export const CustomerProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  totalCustomers: z.number().int().nonnegative().nullable().optional(),
  activeCustomers: z.number().int().nonnegative().nullable().optional(),
  topCustomerPercentOfRevenue: z.number().min(0).max(100).nullable().optional(),
  top3CustomersPercentOfRevenue: z.number().min(0).max(100).nullable().optional(),
  top10CustomersPercentOfRevenue: z.number().min(0).max(100).nullable().optional(),
  customerConcentrationRisk: ConcentrationRiskLevel.default('medium'),
  averageCustomerLifetimeMonths: z.number().int().nonnegative().nullable().optional(),
  averageCustomerLTV: z.number().int().nonnegative().nullable().optional(),
  customerChurnRateMonthly: z.number().min(0).max(1).nullable().optional(), // 0.0-1.0
  customerAcquisitionCostMonths: z.number().int().nonnegative().nullable().optional(), // months to recoup CAC
  customerSatisfactionScore: z.number().min(0).max(100).nullable().optional(),
  npsScore: z.number().min(-100).max(100).nullable().optional(),
  customerHealthStatus: CustomerHealthStatus.default('healthy'),
  highRiskCustomerCount: z.number().int().nonnegative().nullable().optional(),
  contractualCommitmentMonths: z.number().int().nonnegative().nullable().optional(),
  recurringVsOneTimePercentage: z.number().min(0).max(100).nullable().optional(),
  keyCustomerDependency: z.boolean().default(false),
  keyCustomerNames: z.string().nullable().optional(), // CSV list
  customerSegmentationPresent: z.boolean().default(false),
  assessedBy: z.string().uuid().nullable().optional(),
  assessedAt: z.date().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CustomerProfile = z.infer<typeof CustomerProfileSchema>;

export const CreateCustomerProfileRequestSchema = z.object({
  engagementId: z.string().uuid(),
  totalCustomers: z.number().int().nonnegative().optional(),
  activeCustomers: z.number().int().nonnegative().optional(),
  topCustomerPercentOfRevenue: z.number().min(0).max(100).optional(),
  top3CustomersPercentOfRevenue: z.number().min(0).max(100).optional(),
  top10CustomersPercentOfRevenue: z.number().min(0).max(100).optional(),
  customerConcentrationRisk: ConcentrationRiskLevel.optional().default('medium'),
  averageCustomerLifetimeMonths: z.number().int().nonnegative().optional(),
  averageCustomerLTV: z.number().int().nonnegative().optional(),
  customerChurnRateMonthly: z.number().min(0).max(1).optional(),
  customerAcquisitionCostMonths: z.number().int().nonnegative().optional(),
  customerSatisfactionScore: z.number().min(0).max(100).optional(),
  npsScore: z.number().min(-100).max(100).optional(),
  customerHealthStatus: CustomerHealthStatus.optional().default('healthy'),
  highRiskCustomerCount: z.number().int().nonnegative().optional(),
  contractualCommitmentMonths: z.number().int().nonnegative().optional(),
  recurringVsOneTimePercentage: z.number().min(0).max(100).optional(),
  keyCustomerDependency: z.boolean().optional(),
  keyCustomerNames: z.string().optional(),
  customerSegmentationPresent: z.boolean().optional(),
  assessedBy: z.string().uuid().optional(),
});

export type CreateCustomerProfileRequest = z.infer<typeof CreateCustomerProfileRequestSchema>;
