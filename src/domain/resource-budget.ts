// Resource Budget: Enforce resource allocation constraints
// Phase 2: Track and enforce budgets for team, infrastructure, and financial resources

import { z } from 'zod';

export const ResourceType = z.enum([
  'team_hours',
  'consultant_hours',
  'infrastructure_spend',
  'training_budget',
  'tooling_budget',
  'contingency_reserve',
]);
export type ResourceType = z.infer<typeof ResourceType>;

export const BudgetStatus = z.enum(['available', 'allocated', 'committed', 'exhausted']);
export type BudgetStatus = z.infer<typeof BudgetStatus>;

export const ResourceBudgetSchema = z.object({
  id: z.string().uuid(),
  engagementId: z.string().uuid(),
  resourceType: ResourceType,
  description: z.string().max(255).nullable().optional(),
  totalBudget: z.number().positive(), // e.g., hours or dollars
  allocatedAmount: z.number().nonnegative().default(0),
  committedAmount: z.number().nonnegative().default(0),
  consumedAmount: z.number().nonnegative().default(0),
  unit: z.string().min(1).max(20), // "hours", "dollars", "days"
  warningThreshold: z.number().nonnegative(), // Alert when consumed > X% of budget
  status: BudgetStatus.default('available'),
  isBlocking: z.boolean().default(false), // If true, recommendations cannot proceed when exhausted
  notes: z.string().max(1024).nullable().optional(),
  reviewedAt: z.date().nullable().optional(),
  reviewedBy: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ResourceBudget = z.infer<typeof ResourceBudgetSchema>;

export const CreateResourceBudgetRequestSchema = z.object({
  engagementId: z.string().uuid(),
  resourceType: ResourceType,
  description: z.string().max(255).optional(),
  totalBudget: z.number().positive(),
  unit: z.string().min(1).max(20),
  warningThreshold: z.number().nonnegative().optional().default(80), // Default: warn at 80% consumed
  isBlocking: z.boolean().optional().default(false),
  notes: z.string().max(1024).optional(),
});

export type CreateResourceBudgetRequest = z.infer<typeof CreateResourceBudgetRequestSchema>;

// Utility type for budget tracking
export interface BudgetAllocation {
  actionId: string;
  resourceType: ResourceType;
  amount: number;
}
