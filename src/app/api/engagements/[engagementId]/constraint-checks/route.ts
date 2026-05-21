import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ConstraintEnforcer } from "@/services/decision-core/constraint-enforcer";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const body = await request.json();
    const validated = constraintCheckSchema.parse(body);

    // Instantiate constraint enforcer
    const enforcer = new ConstraintEnforcer();

    // Run all constraint gates
    const result = await enforcer.enforceAllGates(
      validated.diagnosticData || {},
      validated.capacityInput,
      validated.cashInput,
      validated.complianceInput || {}
    );

    const failureReason = result.firstFailure || null;

    return Response.json(
      {
        engagementId: validated.engagementId,
        workspaceId,
        passed: result.allPassed,
        failureReason,
        gateResults: result.gateResults,
        message: result.allPassed
          ? "All constraint checks passed"
          : `Constraint check failed: ${failureReason}`,
      },
      { status: result.allPassed ? 200 : 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: governed.operatorMessage }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * GET /api/engagements/[engagementId]/constraint-checks
 *
 * Retrieve last constraint check result
 */
export const GET = withEnforcementFull(async (request) => {
  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  // TODO: Implement persistent constraint check history when schema added
  return Response.json({
    note: "Constraint check history not yet persisted",
    lastCheck: null,
  });
});
