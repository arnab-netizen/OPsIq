import { z } from "zod/v4";

export const decisionRequestContractSchema = z.object({
  engagementId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  requestType: z.enum(["DECISION", "ANALYSIS", "RECOMMENDATION"]),
  businessCondition: z.object({
    financialHealth: z.enum(["STRONG", "STABLE", "CONCERNING", "CRITICAL"]),
    revenueRun: z.number().nonnegative(),
    keyMetrics: z.record(z.string(), z.number()).optional(),
  }),
  constraints: z
    .object({
      budgetLimit: z.number().positive().optional(),
      timelineConstraint: z.string().optional(),
      complianceRequirements: z.array(z.string()).optional(),
    })
    .optional(),
  context: z
    .object({
      ownerEngagementLevel: z.enum(["ACTIVE", "MINIMAL", "NONE"]).optional(),
      previousDecisions: z.array(z.string().uuid()).optional(),
      urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    })
    .optional(),
});

export type DecisionRequestContract = z.infer<
  typeof decisionRequestContractSchema
>;

export interface ValidationContractResult {
  isValid: boolean;
  contractId: string;
  errors: ValidationError[];
  warnings: string[];
  validatedAt: Date;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: "ERROR" | "WARNING";
}
