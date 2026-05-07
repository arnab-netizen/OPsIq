// Financial health state machine for survival intelligence
// Phase 4 Slice 1: Health status definition and gating logic

import { z } from 'zod';

export const FINANCIAL_HEALTH_STATES = [
  'SURVIVAL_CRITICAL',
  'SURVIVAL_RISK',
  'STABILIZE_FIRST',
  'GROWTH_ALLOWED',
  'SCALE_READY',
] as const;

export type FinancialHealthState = (typeof FINANCIAL_HEALTH_STATES)[number];

export const FinancialHealthStateSchema = z.object({
  state: z.enum(FINANCIAL_HEALTH_STATES),
  runwayDays: z.number().int().positive(),
  monthlyBurn: z.number().positive(),
  currentCash: z.number().nonnegative(),
  debtToRevenueRatio: z.number().nonnegative(),
  marginPercent: z.number().min(-100).max(100),
  revenueConcentration: z.number().min(0).max(100),
  operatorLoadPercent: z.number().min(0).max(100),
  organizationalFrictionScore: z.number().min(0).max(100),
  determinedAt: z.date(),
  expiresAt: z.date(),
  reason: z.string(),
});

export type FinancialHealthState_Type = z.infer<typeof FinancialHealthStateSchema>;

// State transition rules
export const STATE_TRANSITION_RULES: Record<
  FinancialHealthState,
  {
    blocksGrowth: boolean;
    downgradePriority: boolean;
    requiresStabilization: boolean;
    escalationNeeded: boolean;
    description: string;
  }
> = {
  SURVIVAL_CRITICAL: {
    blocksGrowth: true,
    downgradePriority: true,
    requiresStabilization: true,
    escalationNeeded: true,
    description:
      'Immediate survival risk. Less than 30 days runway or monthly burn exceeds 50% of current cash.',
  },
  SURVIVAL_RISK: {
    blocksGrowth: true,
    downgradePriority: true,
    requiresStabilization: true,
    escalationNeeded: false,
    description:
      'Elevated risk. Runway 30-90 days or debt-to-revenue > 2.0 or margin < 10%.',
  },
  STABILIZE_FIRST: {
    blocksGrowth: false,
    downgradePriority: true,
    requiresStabilization: true,
    escalationNeeded: false,
    description:
      'Operational risk present. Operator overload > 80% or revenue concentration > 50%.',
  },
  GROWTH_ALLOWED: {
    blocksGrowth: false,
    downgradePriority: false,
    requiresStabilization: false,
    escalationNeeded: false,
    description:
      'Stable foundation. Runway > 120 days, healthy margins, low debt, distributed revenue.',
  },
  SCALE_READY: {
    blocksGrowth: false,
    downgradePriority: false,
    requiresStabilization: false,
    escalationNeeded: false,
    description:
      'Optimized for scale. Runway > 180 days, margins > 25%, debt < 1.0x revenue, low friction.',
  },
};

// Determination criteria
export interface HealthDeterminationInput {
  runwayDays: number;
  monthlyBurn: number;
  currentCash: number;
  debtToRevenueRatio: number;
  marginPercent: number;
  revenueConcentration: number;
  operatorLoadPercent: number;
  organizationalFrictionScore: number;
}

export interface HealthDeterminationResult {
  state: FinancialHealthState;
  reasoning: string[];
  confidencePercent: number;
}
