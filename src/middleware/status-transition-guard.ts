import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { isValidTransition } from "@/services/decision/status-management";

/**
 * Middleware to validate decision status transitions
 * Ensures only valid state changes are allowed
 */
export async function validateStatusTransition(
  request: NextRequest,
  decisionId: string,
  currentStatus: string,
  requestedStatus: string
): Promise<{ valid: boolean; error?: string }> {
  // Allow non-status updates
  if (!requestedStatus) {
    return { valid: true };
  }

  // Validate transition
  if (!isValidTransition(currentStatus, requestedStatus)) {
    return {
      valid: false,
      error: `Invalid status transition: ${currentStatus} → ${requestedStatus}`,
    };
  }

  return { valid: true };
}

/**
 * Guard middleware wrapper for route handlers
 */
export async function statusTransitionGuard(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    try {
      return await handler(request);
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      const message = governed.operatorMessage;

      // Check if it's a transition error
      if (message.includes("Invalid status transition")) {
        return NextResponse.json(
          {
            error: message,
            code: "INVALID_TRANSITION",
          },
          { status: 400 }
        );
      }

      throw error;
    }
  };
}
