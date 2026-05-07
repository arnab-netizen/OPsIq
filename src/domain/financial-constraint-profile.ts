// Domain model for engagement-level financial constraints
// Phase 2: Captures cash flow, debt, capital, and working capital constraints

import { z } from 'zod';

export const FinancialHealthStatus = z.enum(['strong', 'adequate', 'strained', 'critical']);
export type FinancialHealthStatus = z.infer<typeof FinancialHealthStatus>;

export const CashFlowTiming = z.enum(['daily', 'weekly', 'monthly', 'quarterly']);
export type CashFlowTiming = z.infer<typeof CashFlowTiming>;

export const FinancialConstraintProfileSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  monthlyBurnRate: z.number().int().nonnegative().nullable().optional(),
  monthlyRecurringRevenue: z.number().int().nonnegative().nullable().optional(),
  cashRunwayMonths: z.number().int().nonnegative().nullable().optional(),
  totalDebt: z.number().int().nonnegative().nullable().optional(),
  debtServiceMonthly: z.number().int().nonnegative().nullable().optional(),
  debtMaturityMonths: z.number().int().nonnegative().nullable().optional(),
  equityAvailable: z.number().int().nonnegative().nullable().optional(),
  workingCapitalDaysOfPayables: z.number().int().nonnegative().nullable().optional(),
  workingCapitalDaysOfReceivables: z.number().int().nonnegative().nullable().optional(),
  seasonalityPattern: z.string().nullable().optional(), // e.g., "Q4 peak", "summer decline"
  restrictedCash: z.number().int().nonnegative().nullable().optional(),
  contingencyReserveMonths: z.number().int().nonnegative().nullable().optional(),
  majorCapexNeeded: z.boolean().default(false),
  capexEstimatedAmount: z.number().int().nonnegative().nullable().optional(),
  capexTimelineMonths: z.number().int().nonnegative().nullable().optional(),
  loanCovenantsPresent: z.boolean().default(false),
  covenantDetails: z.string().nullable().optional(),
  investorDilutionThreshold: z.number().min(0).max(1).nullable().optional(), // 0.0-1.0
  profitabilityTargetMonths: z.number().int().nonnegative().nullable().optional(),
  financialHealthStatus: FinancialHealthStatus.default('adequate'),
  cashFlowTiming: CashFlowTiming.default('monthly'),
  assessedBy: z.string().uuid().nullable().optional(),
  assessedAt: z.date().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FinancialConstraintProfile = z.infer<typeof FinancialConstraintProfileSchema>;

export const CreateFinancialConstraintProfileRequestSchema = z.object({
  engagementId: z.string().uuid(),
  monthlyBurnRate: z.number().int().nonnegative().optional(),
  monthlyRecurringRevenue: z.number().int().nonnegative().optional(),
  cashRunwayMonths: z.number().int().nonnegative().optional(),
  totalDebt: z.number().int().nonnegative().optional(),
  debtServiceMonthly: z.number().int().nonnegative().optional(),
  debtMaturityMonths: z.number().int().nonnegative().optional(),
  equityAvailable: z.number().int().nonnegative().optional(),
  workingCapitalDaysOfPayables: z.number().int().nonnegative().optional(),
  workingCapitalDaysOfReceivables: z.number().int().nonnegative().optional(),
  seasonalityPattern: z.string().optional(),
  restrictedCash: z.number().int().nonnegative().optional(),
  contingencyReserveMonths: z.number().int().nonnegative().optional(),
  majorCapexNeeded: z.boolean().optional(),
  capexEstimatedAmount: z.number().int().nonnegative().optional(),
  capexTimelineMonths: z.number().int().nonnegative().optional(),
  loanCovenantsPresent: z.boolean().optional(),
  covenantDetails: z.string().optional(),
  investorDilutionThreshold: z.number().min(0).max(1).optional(),
  profitabilityTargetMonths: z.number().int().nonnegative().optional(),
  financialHealthStatus: FinancialHealthStatus.optional().default('adequate'),
  cashFlowTiming: CashFlowTiming.optional().default('monthly'),
  assessedBy: z.string().uuid().optional(),
});

export type CreateFinancialConstraintProfileRequest = z.infer<
  typeof CreateFinancialConstraintProfileRequestSchema
>;
