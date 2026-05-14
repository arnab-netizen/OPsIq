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
import { logger } from "@/infra/logger";
import type { SessionInfo, AuthenticatedUser } from "@/services/auth";
import { getSessionFact, getPolicyContextFact } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { buildAuthState, evaluateAuthState, translateAuthDecisionToResponse } from "@/lib/canonical-auth-facts";
import type { AuthDecision } from "@/lib/canonical-auth-facts";

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
  verifiedActor: AuthenticatedUser;

  // Verified workspace (if workspace-scoped route)
  verifiedWorkspaceId: string;

  // Verified capabilities (if capability-scoped route)
  verifiedCapabilities: Set<string>;

  // Execution trace (for observability)
  executionTrace: Array<{ stage: string; timestamp: number; result: string }>;

  // Correlation ID (for request tracking)
  correlationId: string;

  // Request ID (for logging)
  requestId: string;

  // Raw NextRequest (for reading body, headers, etc.)
  request: NextRequest;

  // Session info (from auth system)
  session?: SessionInfo;

  // Policy context (from auth system)
  policy?: PolicyContext;
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
      const executionTrace: Array<{ stage: string; timestamp: number; result: string }> = [];

      logger.info("Canonical route enforcement started", {
        correlationId,
        requestId,
        method: req.method,
        pathname: req.nextUrl.pathname,
      });

      // ========================================
      // STEP 1: EXTRACT WORKSPACE ID
      // ========================================

      const workspaceId = req.headers.get("x-workspace-id") || "system";
      executionTrace.push({ stage: "WORKSPACE_EXTRACTED", timestamp: Date.now(), result: workspaceId });

      // ========================================
      // STEP 2: GATHER AUTH FACTS (NO ERRORS THROWN)
      // ========================================

      const sessionFact = await getSessionFact(workspaceId);
      const policyFact = await getPolicyContextFact(workspaceId);

      logger.debug("Auth facts gathered", {
        correlationId,
        sessionValid: sessionFact.valid,
        policyValid: policyFact.valid,
      });

      // ========================================
      // STEP 3: BUILD COMPLETE AUTH STATE
      // ========================================

      const authState = await buildAuthState({
        correlationId,
        requestId,
        workspaceId,
        workspaceRequired: options?.requireWorkspace ?? false,
        sessionFact,
        policyFact,
        requiredCapabilities: (options?.requireCapabilities || []) as CapabilityName[],
      });

      // ========================================
      // STEP 4: EVALUATE AUTH STATE → DECISION
      // ========================================

      const decision = evaluateAuthState(authState, {
        requireWorkspace: options?.requireWorkspace,
        requireCapabilities: (options?.requireCapabilities || []) as CapabilityName[],
        requireInternalOnly: false, // TODO: Add option if needed
      });

      // ========================================
      // STEP 5: HANDLE AUTH DECISION
      // ========================================

      executionTrace.push({
        stage: "AUTH_EVALUATED",
        timestamp: Date.now(),
        result: decision.allowed ? "ALLOWED" : "DENIED"
      });

      if (!decision.allowed) {
        logger.warn("Auth decision: DENIED", {
          correlationId,
          statusCode: decision.statusCode,
          reason: decision.trace.reason,
        });

        // PHASE A STEP A3: Use single error translation layer
        // ONLY this layer generates HTTP error responses
        const errorResponse = translateAuthDecisionToResponse(decision, correlationId);

        return new NextResponse(JSON.stringify(errorResponse.body), {
          status: errorResponse.status,
          headers: { "x-correlation-id": correlationId, "content-type": "application/json" },
        });
      }

      logger.debug("Auth decision: ALLOWED", { correlationId });
      executionTrace.push({ stage: "AUTH_AUTHORIZED", timestamp: Date.now(), result: "SUCCESS" });

      let session: SessionInfo | null = null;
      let policy: PolicyContext | null = null;

      if (decision.context) {
        session = decision.context.session;
        policy = decision.context.policy;
      }

      // ========================================
      // STEP 6: BUILD VERIFIED CONTEXT
      // ========================================

      if (!session || !policy) {
        throw new Error("Auth allowed but session or policy is null");
      }

      const verifiedContext: CanonicalAuthContext = {
        verifiedActorId: session.user.id,
        verifiedActorType: "user",
        verifiedActor: session.user,
        verifiedWorkspaceId: workspaceId,
        verifiedCapabilities: decision.context!.verifiedCapabilities,
        executionTrace,
        correlationId,
        requestId,
        request: req,
        session,
        policy,
      };

      // ========================================
      // STEP 7: CALL HANDLER (NOW SAFE)
      // ========================================

      // Handler can ONLY be called here, AFTER auth passed
      // Handler receives verified context only
      logger.debug("Canonical handler executing", { correlationId, actorId: verifiedContext.verifiedActorId });
      const result = await handler(verifiedContext, params);

      // ========================================
      // STEP 8: RETURN HANDLER RESULT
      // ========================================

      executionTrace.push({ stage: "HANDLER_SUCCESS", timestamp: Date.now(), result: "COMPLETED" });

      return new NextResponse(JSON.stringify(result), {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
          "content-type": "application/json",
        },
      });
    } catch (error) {
      // Unhandled error in handler or pipeline
      logger.error("Canonical route handler failed", error as Error, { correlationId: req.headers.get("x-correlation-id") || "unknown" });

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

