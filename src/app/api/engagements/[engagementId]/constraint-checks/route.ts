import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ConstraintEnforcer } from "@/services/decision-core/constraint-enforcer";
import { ValidationError } from "@/infra/errors";
import { z } from "zod/v4";

const constraintCheckSchema = z.object({
  engagementId: z.string().uuid(),
  diagnosticData: z.record(z.string(), z.unknown()).optional(),
  capacityInput: z.object({
    availableCapacity: z.number().nonnegative(),
    requiredCapacity: z.number().nonnegative(),
    bufferPercentage: z.number().min(0).max(100).optional(),
  }),
  cashInput: z.object({
    monthlyBurn: z.number().nonnegative(),
    currentCash: z.number().nonnegative(),
    minRunwayMonths: z.number().nonnegative().optional(),
  }),
  complianceInput: z.object({
    riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
    requiresApproval: z.boolean().optional(),
    approvalStatus: z.enum(["pending", "approved", "denied"]).optional(),
  }).optional(),
});

/**
 * POST /api/engagements/[engagementId]/constraint-checks
 *
 * Validate execution constraints (capacity, cash, compliance)
 * Wire: ConstraintEnforcer.enforceAllGates()
 * Validates: data sufficiency, contradictions, capacity, cash runway, legal/compliance
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = constraintCheckSchema.parse(body);

    const enforcer = new ConstraintEnforcer();

    const result = await enforcer.enforceAllGates(
      validated.diagnosticData || {},
      validated.capacityInput,
      validated.cashInput,
      validated.complianceInput || {}
    );

    const failureReason = result.firstFailure || null;

    return {
      engagementId: validated.engagementId,
      workspaceId,
      passed: result.allPassed,
      failureReason,
      gateResults: result.gateResults,
      message: result.allPassed
        ? "All constraint checks passed"
        : `Constraint check failed: ${failureReason}`,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

/**
 * GET /api/engagements/[engagementId]/constraint-checks
 *
 * Retrieve last constraint check result
 */
export const GET = withCanonicalEnforcement(
  async (_ctx: CanonicalAuthContext) => {
    // Constraint check history not yet persisted
    return {
      note: "Constraint check history not yet persisted",
      lastCheck: null,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);
