/**
 * PHASE 6: CANONICAL ROUTE ENFORCEMENT WRAPPER
 *
 * CRITICAL SECURITY LAYER
 *
 * Every protected route MUST use this wrapper.
 * Handler logic is impossible to execute before auth passes.
 * Telemetry/audit emission is automatic.
 * Execution traces are mandatory.
 * Pre-auth mutations are impossible.
 *
 * NO route should import auth libraries directly.
 * NO route should fetch session/policy.
 * NO route should validate workspace/capabilities.
 * NO route should return auth errors.
 *
 * ALL of that is handled by this wrapper.
 */

import { NextRequest, NextResponse } from "next/server";
import type { AuthState } from "@/services/auth/state-engine";
import { executeAuthPipeline, type AuthPipelineResult, type AuthExecutionStage } from "@/services/auth/pipeline-executor";
import { emitTelemetry } from "@/infra/errors";
import { getAuditPersistenceQueue } from "@/infra/flood-protection-audit-isolation";
import { getAdaptiveSamplingController } from "@/infra/flood-protection-sampling";
import { classifyAuditEvent, shouldPersistAuditEvent } from "@/infra/flood-protection-tiers";
import { logger } from "@/infra/logger";

/**
 * Verified context passed to handler
 *
 * Handler receives ONLY verified data.
 * All auth logic is complete before handler receives context.
 * Handler is IMPOSSIBLE to execute if auth failed.
 */
export interface CanonicalAuthContext {
  // Verified actor (always present if handler is called)
  verifiedActorId: string;
  verifiedActorType: "user" | "service";

  // Verified workspace (if workspace-scoped route)
  verifiedWorkspaceId?: string;

  // Verified capabilities (if capability-scoped route)
  verifiedCapabilities: Set<string>;

  // Execution trace (for observability)
  executionTrace: AuthExecutionStage[];

  // Correlation ID (for request tracking)
  correlationId: string;

  // Request ID (for logging)
  requestId: string;

  // Raw NextRequest (for reading body, headers, etc.)
  request: NextRequest;
}

/**
 * Route handler signature
 *
 * Handler receives verified context, never auth data.
 * Handler is impossible to execute if auth failed.
 */
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;

/**
 * CANONICAL ROUTE WRAPPER
 *
 * Enforces auth pipeline for all protected routes.
 *
 * Usage:
 * ```typescript
 * export const GET = withCanonicalEnforcement(
 *   async (ctx) => {
 *     // ctx.verifiedActorId, ctx.verifiedWorkspaceId, etc.
 *     // Business logic only
 *     return { data: result };
 *   },
 *   {
 *     requireWorkspace: true,  // Require workspace scope
 *     requireCapabilities: ["AUDIT_READ"],  // Require specific capabilities
 *   }
 * );
 * ```
 */
export function withCanonicalEnforcement(
  handler: CanonicalHandler,
  options?: {
    requireWorkspace?: boolean;
    requireCapabilities?: string[];
    requireActorType?: "user" | "service" | ("user" | "service")[];
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const params = await context.params;

    try {
      // Generate correlation ID from request headers or create new one
      const correlationId = req.headers.get("x-correlation-id") || `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const requestId = req.headers.get("x-request-id") || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      logger.info("Canonical route enforcement started", {
        correlationId,
        requestId,
        method: req.method,
        pathname: req.nextUrl.pathname,
      });

      // ========================================
      // STEP 1: BUILD AUTH STATE FROM REQUEST
      // ========================================

      // Extract credentials from request (bearer token, session cookie, etc.)
      const authHeader = req.headers.get("authorization") || "";
      const sessionCookie = req.cookies.get("session")?.value || "";
      const workspaceIdHeader = req.headers.get("x-workspace-id") || "";

      // Build auth state for evaluation
      // This is a simplified version - real implementation would parse credentials
      const authState: AuthState = parseAuthStateFromRequest(authHeader, sessionCookie, workspaceIdHeader);

      // ========================================
      // STEP 2: EXECUTE CANONICAL PIPELINE
      // ========================================

      const pipelineResult = await executeAuthPipeline(authState, {
        correlationId,
        emitTelemetry: true, // Telemetry automatic
        emitAudit: true, // Audit automatic
      });

      // ========================================
      // STEP 3: GUARANTEE HANDLER NEVER EXECUTES IF AUTH FAILED
      // ========================================

      if (!pipelineResult.allowed) {
        // Auth failed - handler is NOT called
        const error = pipelineResult.error || new Error("Auth pipeline failed");

        // Emit telemetry for failure
        try {
          await emitTelemetry(pipelineResult.finalDecision.telemetryClass, {
            state: pipelineResult.finalState,
            correlationId,
            httpStatus: pipelineResult.finalDecision.httpStatus,
          });
        } catch {
          // Telemetry failure doesn't affect response
        }

        // Return standardized error response
        return new NextResponse(
          JSON.stringify({
            error: pipelineResult.finalDecision.errorMessage,
            correlationId,
          }),
          {
            status: pipelineResult.finalDecision.httpStatus,
            headers: {
              "x-correlation-id": correlationId,
              "content-type": "application/json",
            },
          }
        );
      }

      // ========================================
      // STEP 4: VERIFY HANDLER PRECONDITIONS
      // ========================================

      // Check handler requirements
      if (options?.requireWorkspace && !authState.workspaceId) {
        throw new Error("Route requires workspace scope but none provided");
      }

      if (options?.requireCapabilities && options.requireCapabilities.length > 0) {
        const actor = extractActorFromState(authState);
        if (!actor || !hasCapabilities(actor, options.requireCapabilities)) {
          const error = new Error("Missing required capabilities");
          return new NextResponse(JSON.stringify({ error: error.message, correlationId }), {
            status: 403,
            headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
          });
        }
      }

      if (options?.requireActorType) {
        const actor = extractActorFromState(authState);
        const requiredTypes = Array.isArray(options.requireActorType) ? options.requireActorType : [options.requireActorType];
        if (!actor || !requiredTypes.includes(actor.type)) {
          const error = new Error("Invalid actor type for this route");
          return new NextResponse(JSON.stringify({ error: error.message, correlationId }), {
            status: 403,
            headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
          });
        }
      }

      // ========================================
      // STEP 5: BUILD VERIFIED CONTEXT
      // ========================================

      const actor = extractActorFromState(authState);
      if (!actor) {
        throw new Error("Auth passed but actor not found");
      }

      const verifiedContext: CanonicalAuthContext = {
        verifiedActorId: actor.id,
        verifiedActorType: actor.type,
        verifiedWorkspaceId: authState.workspaceId,
        verifiedCapabilities: new Set(actor.capabilities || []),
        executionTrace: pipelineResult.executionTrace,
        correlationId,
        requestId,
        request: req,
      };

      // ========================================
      // STEP 6: CALL HANDLER (NOW SAFE)
      // ========================================

      // Handler can ONLY be called here, AFTER auth passed
      // Handler receives verified context only
      const result = await handler(verifiedContext, params);

      // ========================================
      // STEP 7: EMIT SUCCESS TELEMETRY
      // ========================================

      try {
        await emitTelemetry("AUTH_SUCCESS", {
          correlationId,
          actorId: verifiedContext.verifiedActorId,
          workspaceId: verifiedContext.verifiedWorkspaceId,
        });
      } catch {
        // Telemetry failure doesn't affect success response
      }

      // ========================================
      // STEP 8: RETURN HANDLER RESULT
      // ========================================

      // Serialize result to JSON response
      return new NextResponse(JSON.stringify(result), {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
          "content-type": "application/json",
        },
      });
    } catch (error) {
      // Unhandled error in handler or pipeline
      logger.error("Canonical route handler failed", error as Error, {
        reason: "Unhandled error in canonical wrapper",
      });

      return new NextResponse(
        JSON.stringify({
          error: "Internal server error",
          correlationId: req.headers.get("x-correlation-id") || "unknown",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }
  };
}

/**
 * Helper: Parse auth state from request
 * (Simplified - real implementation would parse JWT, sessions, etc.)
 */
function parseAuthStateFromRequest(authHeader: string, sessionCookie: string, workspaceId: string): AuthState {
  // TODO: Parse credentials and build auth state
  // For now, return placeholder
  return "SESSION_INVALID";
}

/**
 * Helper: Extract actor from auth state
 */
function extractActorFromState(state: AuthState): { id: string; type: "user" | "service"; capabilities?: string[] } | null {
  // TODO: Extract actor from auth state
  // For now, return placeholder
  return null;
}

/**
 * Helper: Check if actor has required capabilities
 */
function hasCapabilities(actor: { capabilities?: string[] }, required: string[]): boolean {
  const actorCaps = new Set(actor.capabilities || []);
  return required.every((cap) => actorCaps.has(cap));
}

/**
 * Type guard: Verify context shape at compile time
 */
export function isCanonicalAuthContext(obj: unknown): obj is CanonicalAuthContext {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.verifiedActorId === "string" &&
    (o.verifiedActorType === "user" || o.verifiedActorType === "service") &&
    o.verifiedCapabilities instanceof Set &&
    Array.isArray(o.executionTrace) &&
    typeof o.correlationId === "string" &&
    typeof o.requestId === "string"
  );
}
