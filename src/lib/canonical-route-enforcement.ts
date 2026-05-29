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
import { classifyOperatorError } from "@/lib/operator-error-governance";
import type { SessionInfo, AuthenticatedUser } from "@/services/auth";
import { getSessionFact, getPolicyContextFact } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { buildAuthState, evaluateAuthState, translateAuthDecisionToResponse } from "@/lib/canonical-auth-facts";
import type { AuthDecision } from "@/lib/canonical-auth-facts";
import { CanonicalTelemetryLifecycle } from "@/lib/canonical-telemetry-lifecycle";
import { CanonicalExecutionTraceManager } from "@/lib/canonical-execution-trace";
import { CanonicalVerifiedSessionBuilder } from "@/lib/canonical-verified-session";
import {
  classifyExecution,
  pushExecutionContext,
  popExecutionContext,
  type ReentryClassification,
} from "@/lib/execution-reentry-detector";
import {
  initializeEnforcerForRequest,
  RequestLifecycleStage,
  type RuntimeShadowReadEnforcer,
} from "@/lib/runtime-shadow-read-enforcer";
import { ClassifiedApiError, ensureClassification, hasClassification } from "@/infra/classified-error";

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

  // PHASE D: ROOT CONTAINER - Single execution lineage authority
  // Optional: not required for service layer, only for logging/tracing
  traceId?: string;
  executionTrace?: Readonly<any>;  // Read-only reference to unified trace

  // PHASE E: IMMUTABLE SESSION SNAPSHOT - Single request reality
  verifiedSessionSnapshot: {
    snapshotId: string;
    snapshotTimestamp: Date;
    snapshotHash: string;
    actorId: string;
    workspaceId: string;
    capabilities: readonly string[];
  };

  // Optional: for request tracking (not required for service layer)
  correlationId?: string;
  requestId?: string;

  // Optional: raw NextRequest (not required for service layer or non-request-bound contexts)
  request?: NextRequest;

  // Session info (from auth system)
  session?: SessionInfo;

  // Policy context (from auth system)
  policy?: PolicyContext;
}

/**
 * Service Auth Envelope: Minimal verified auth data for service layer
 *
 * Services receive ONLY verified decisions from routes/wrappers.
 * All fields are readonly to prevent mutation.
 * Services must never construct or modify this object.
 *
 * Pattern: Route creates envelope from CanonicalAuthContext and passes to service.
 * Service reads fields for business decisions.
 * Service NEVER calls auth functions or re-verifies auth.
 */
export interface ServiceAuthEnvelope {
  // Mandatory: Core verified identity and scope
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;

  // Mandatory: Verified capability decision
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;

  // Optional: Actor details for complex cases
  readonly verifiedActor?: Readonly<AuthenticatedUser>;

  // Optional: Policy context for policy-aware services ONLY
  readonly policy?: Readonly<PolicyContext>;
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
    skipReadinessCheck?: boolean;
    errorNamespace?: string;
    operationName?: string;
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const params = await context.params;
    let telemetry: CanonicalTelemetryLifecycle | null = null;
    let traceManager: CanonicalExecutionTraceManager | null = null;
    let shadowReadEnforcer: RuntimeShadowReadEnforcer | null = null;

    // Generate correlation ID from request headers or create new one
    const correlationId = req.headers.get("x-correlation-id") || `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const requestId = req.headers.get("x-request-id") || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Skip readiness check for auth routes
    const skipReadinessCheck = options?.skipReadinessCheck || false;

    try {
      // ========================================
      // CRITICAL READINESS CHECK (fail-closed, per-request)
      // ========================================
      if (!skipReadinessCheck) {
        try {
          const { ensureCriticalReadiness } = await import("@/infra/critical-readiness");
          const readiness = await ensureCriticalReadiness();

          if (readiness.status === "FAILED_CRITICAL") {
            logger.warn("Critical readiness failed - request blocked", {
              endpoint: req.nextUrl.pathname,
              method: req.method,
              errors: readiness.errors,
              correlationId,
            });
            return new NextResponse(
              JSON.stringify({
                error: "SERVICE_UNAVAILABLE",
                message: "Service critical dependency unavailable",
              }),
              { status: 503 }
            );
          }

          if (readiness.status === "DEGRADED_NON_BLOCKING") {
            logger.warn("Service degraded but continuing", {
              endpoint: req.nextUrl.pathname,
              method: req.method,
              errors: readiness.errors,
              correlationId,
            });
            // Continue - non-critical issues don't block authenticated APIs
          }
        } catch (error) {
          const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
          logger.error("Failed to assess critical readiness", {
            error: governed.operatorMessage,
            endpoint: req.nextUrl.pathname,
            method: req.method,
            correlationId,
          });
          return new NextResponse(
            JSON.stringify({
              error: "SERVICE_UNAVAILABLE",
              message: "Unable to verify service readiness",
            }),
            { status: 503 }
          );
        }
      }

      // ========================================
      // PHASE D: ROOT CONTAINER - Initialize execution trace
      // ========================================
      traceManager = new CanonicalExecutionTraceManager({
        correlationId,
        requestId,
        method: req.method,
        pathname: req.nextUrl.pathname,
        queryString: req.nextUrl.search,
      });

      // ========================================
      // PHASE F: RUNTIME SHADOW READ ENFORCER - Initialize
      // ========================================
      shadowReadEnforcer = initializeEnforcerForRequest(
        correlationId,
        requestId,
        traceManager.getTrace().traceId,
        req.nextUrl.pathname
      );

      // STEP D3.2: Detect reentry/nesting
      const reentryStatus = classifyExecution({
        traceId: traceManager.getTrace().traceId,
        correlationId,
        requestId,
      });

      if (reentryStatus !== "SAFE") {
        throw new Error(
          `EXECUTION REENTRY VIOLATION: ${reentryStatus}. Cannot nest canonical wrapper execution.`
        );
      }

      pushExecutionContext({
        traceId: traceManager.getTrace().traceId,
        correlationId,
        requestId,
      });

      // ========================================
      // TELEMETRY: Initialize lifecycle
      // ========================================
      telemetry = new CanonicalTelemetryLifecycle({
        correlationId,
        requestId,
        method: req.method,
        pathname: req.nextUrl.pathname,
      });

      telemetry.emitPipelineStarted();
      traceManager.recordStage("PIPELINE_STARTED", "success");

      // ========================================
      // STEP 1: EXTRACT WORKSPACE ID
      // ========================================

      const workspaceId: string | undefined = req.headers.get("x-workspace-id") ?? undefined;
      traceManager.recordStage("WORKSPACE_EXTRACTED", "success", workspaceId || "not_specified");

      // ========================================
      // STEP 2: GATHER AUTH FACTS (NO ERRORS THROWN)
      // ========================================

      const sessionFact = await getSessionFact(workspaceId);
      const policyFact = await getPolicyContextFact(workspaceId);

      // TELEMETRY: Facts gathered
      telemetry.emitFactsGathered({
        sessionValid: sessionFact.valid,
        policyValid: policyFact.valid,
      });
      traceManager.recordStage("FACTS_GATHERED", "success");
      traceManager.recordAuthSnapshot({
        sessionValid: sessionFact.valid,
        sessionInvalidReason: sessionFact.invalidReason,
        policyValid: policyFact.valid,
        policyInvalidReason: policyFact.invalidReason,
        workspaceId: workspaceId || undefined,
        workspaceValid: true,
      });

      // ========================================
      // STEP 3: BUILD COMPLETE AUTH STATE
      // ========================================

      const authState = await buildAuthState({
        correlationId,
        requestId,
        workspaceId: workspaceId || null,
        workspaceRequired: options?.requireWorkspace ?? false,
        sessionFact,
        policyFact,
        requiredCapabilities: (options?.requireCapabilities || []) as CapabilityName[],
      });

      // TELEMETRY: State built
      telemetry.emitStateBuilt(authState);
      traceManager.recordStage("AUTH_STATE_BUILT", "success");

      // ========================================
      // STEP 4: EVALUATE AUTH STATE → DECISION
      // ========================================

      const decision = evaluateAuthState(authState, {
        requireWorkspace: options?.requireWorkspace,
        requireCapabilities: (options?.requireCapabilities || []) as CapabilityName[],
        requireInternalOnly: false, // TODO: Add option if needed
      });

      // TELEMETRY: Evaluated
      telemetry.emitEvaluated(decision);
      traceManager.recordStage("AUTH_EVALUATED", decision.allowed ? "success" : "failed");

      // Record decision in trace (immutable after this point)
      if (decision.context) {
        traceManager.recordAuthSnapshot({
          sessionValid: true,
          policyValid: true,
          workspaceId: decision.context.verifiedWorkspaceId,
          workspaceValid: true,
          actorId: decision.context.verifiedActorId,
        });
      }

      traceManager.recordDecision({
        allowed: decision.allowed,
        statusCode: decision.statusCode,
        reason: decision.trace.reason,
        checks: decision.trace.checks,
      });

      // ========================================
      // STEP 5: HANDLE AUTH DECISION
      // ========================================

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
      traceManager.recordStage("AUTH_AUTHORIZED", "success");

      let session: SessionInfo | null = null;
      let policy: PolicyContext | null = null;

      if (decision.context) {
        session = decision.context.session;
        policy = decision.context.policy;
      }

      // ========================================
      // STEP 6: CREATE IMMUTABLE SESSION SNAPSHOT (PHASE E)
      // ========================================

      if (!session || !policy) {
        throw new Error("Auth allowed but session or policy is null");
      }

      // PHASE E: Create immutable snapshot of auth state
      const sessionSnapshotBuilder = new CanonicalVerifiedSessionBuilder({
        traceId: traceManager.getTrace().traceId,
        correlationId,
        sessionInfo: session,
        policyContext: policy,
        workspaceId: decision.context!.verifiedWorkspaceId,
        capabilities: decision.context!.verifiedCapabilities as Set<CapabilityName>,
      });

      const sessionSnapshot = sessionSnapshotBuilder.finalize();

      // Record snapshot in trace (trace now owns it)
      traceManager.recordVerifiedSessionSnapshot({
        snapshotId: sessionSnapshot.snapshotId,
        snapshotTimestamp: sessionSnapshot.snapshotTimestamp,
        snapshotHash: sessionSnapshot.snapshotHash,
        actorId: sessionSnapshot.actor.id,
        workspaceId: sessionSnapshot.workspace.id,
        capabilities: Array.from(sessionSnapshot.capabilities),
      });

      traceManager.recordStage("SESSION_SNAPSHOT_CREATED", "success", sessionSnapshot.snapshotId);

      // PHASE F: Mark snapshot as created
      shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.SNAPSHOT_CREATED);

      // ========================================
      // STEP 7: BUILD VERIFIED CONTEXT
      // ========================================

      const verifiedContext: CanonicalAuthContext = {
        verifiedActorId: session.user.id,
        verifiedActorType: "user",
        verifiedActor: session.user,
        verifiedWorkspaceId: decision.context!.verifiedWorkspaceId,
        verifiedCapabilities: decision.context!.verifiedCapabilities,
        // PHASE D: Trace is ROOT container (read-only)
        traceId: traceManager.getTrace().traceId,
        executionTrace: traceManager.getReadOnlyTrace(),
        // PHASE E: Immutable session snapshot
        verifiedSessionSnapshot: {
          snapshotId: sessionSnapshot.snapshotId,
          snapshotTimestamp: sessionSnapshot.snapshotTimestamp,
          snapshotHash: sessionSnapshot.snapshotHash,
          actorId: sessionSnapshot.actor.id,
          workspaceId: sessionSnapshot.workspace.id,
          capabilities: Array.from(sessionSnapshot.capabilities),
        },
        correlationId,
        requestId,
        request: req,
        session,
        policy,
      };

      // ========================================
      // STEP 8: CALL HANDLER (NOW SAFE)
      // ========================================

      // PHASE F: Mark auth as finalized before handler execution
      // After this point, any auth reads will be blocked (shadow read enforcement)
      shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.AUTH_FINALIZED);

      // Handler can ONLY be called here, AFTER auth passed
      // Handler receives verified context only
      shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.HANDLER_EXECUTING);
      traceManager.recordStage("HANDLER_EXECUTING", "success");
      telemetry.emitHandlerExecuting(verifiedContext.verifiedActorId);
      const result = await handler(verifiedContext, params);

      // ========================================
      // STEP 9: RETURN HANDLER RESULT
      // ========================================

      traceManager.recordStage("HANDLER_SUCCESS", "success");
      telemetry.emitHandlerCompleted();

      // PHASE D: Finalize trace (becomes immutable)
      const finalTrace = traceManager.finalize({
        allowed: true,
        statusCode: 200,
        sessionSnapshotId: session?.sessionId,
      });

      telemetry.emitRequestCompleted();

      // PHASE F: Mark request complete and clear enforcer
      shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.REQUEST_COMPLETE);
      shadowReadEnforcer.clear();

      popExecutionContext(finalTrace.traceId);

      return new NextResponse(JSON.stringify(result), {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
          "x-trace-id": finalTrace.traceId,
          "content-type": "application/json",
        },
      });
    } catch (error) {
      // Ensure error is classified (never undefined classification/stage)
      // Use hasClassification (structural) instead of instanceof to work across module boundaries
      const errorNamespace = options?.errorNamespace;
      const operationName = options?.operationName;

      let classifiedError: ClassifiedApiError;

      if (hasClassification(error)) {
        // Error already has classification/stage, preserve it
        classifiedError = ensureClassification(
          error,
          "handler_invocation",
          "handler_invocation_failed"
        );
      } else {
        // Raw unclassified error - use namespace-specific fallback
        const fallbackClassification = errorNamespace
          ? `${errorNamespace}_handler_invocation_failed`
          : "handler_invocation_failed";
        const fallbackStage = "handler_invocation";

        classifiedError = new ClassifiedApiError(
          error instanceof Error ? error.message : String(error),
          fallbackClassification,
          fallbackStage,
          500,
          error
        );
      }

      try {
        if (traceManager) {
          traceManager.recordStage("HANDLER_FAILED", "failed", String(error));
          const failedTrace = traceManager.finalize({
            allowed: false,
            statusCode: 500,
          });
          popExecutionContext(failedTrace.traceId);
        }

        // PHASE F: Clean up enforcer on error
        if (shadowReadEnforcer) {
          shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.REQUEST_COMPLETE);
          shadowReadEnforcer.clear();
        }
      } catch (traceError) {
        logger.error("Trace finalization error", traceError as Error, { correlationId });
      }

      const telemetryCtx = telemetry?.getContext();
      telemetry?.emitHandlerFailed(error as Error);
      telemetry?.emitRequestCompleted();

      const finalCorrelationId = telemetryCtx?.correlationId || correlationId || "unknown";
      const safErrorName = error instanceof Error ? error.name : typeof error === "object" ? error?.constructor?.name : "unknown";

      logger.error("[WRAPPER_FAILED]", {
        correlationId: finalCorrelationId,
        stage: classifiedError.stage,
        classification: classifiedError.classification,
        errorName: safErrorName,
        errorMessage: error instanceof Error ? error.message : String(error),
        operation: operationName,
      });

      const responseBody: any = {
        error: "Internal server error",
        correlationId: finalCorrelationId,
        classification: classifiedError.classification,
        stage: classifiedError.stage,
      };

      // Include safe error name for diagnostics
      if (safErrorName && safErrorName !== "unknown") {
        responseBody.errorName = safErrorName;
      }

      // Include operation if provided
      if (operationName) {
        responseBody.operation = operationName;
      }

      // Include safe Prisma details if available (allowlisted keys only)
      const safeDetails = (classifiedError as any).safeDetails;
      if (safeDetails && typeof safeDetails === "object") {
        const allowlistedKeys = [
          "prismaCode",
          "safeMessage",
          "failingOperation",
          "engagementsServiceVersion",
          "routeVersion",
          "serviceImportPath",
          "handlerName",
        ];
        for (const key of allowlistedKeys) {
          if (safeDetails[key] !== undefined && safeDetails[key] !== null) {
            responseBody[key] = safeDetails[key];
          }
        }
      }

      return new NextResponse(JSON.stringify(responseBody), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  };
}

/**
 * POLICY-AWARE CANONICAL ROUTE ENFORCEMENT
 *
 * For routes that need policy context validation (internal access, role checks).
 *
 * Layers on top of withCanonicalEnforcement.
 * Policy checks happen after identity/capability checks (fail-closed).
 * Handler only executes if both identity AND policy checks pass.
 *
 * Usage:
 * ```typescript
 * export const GET = withCanonicalPolicyEnforcement(
 *   async (ctx) => {
 *     // ctx.policy is available and verified
 *     const isInternal = ctx.policy ? hasInternalAccess(ctx.policy) : false;
 *     return { isInternal };
 *   },
 *   {
 *     requireInternalAccess: true,  // Route requires internal user
 *     requireCapabilities: ["AUDIT_VIEW"],  // Existing capability checks
 *   }
 * );
 * ```
 */
export function withCanonicalPolicyEnforcement(
  handler: CanonicalHandler,
  options?: {
    requireInternalAccess?: boolean;
    requirePolicyContext?: boolean;
    requireCapabilities?: string[];
    requireActorType?: "user" | "service" | ("user" | "service")[];
    skipReadinessCheck?: boolean;
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const params = await context.params;

    // STEP 1: Use withCanonicalEnforcement to build verified context
    const baseWrapper = withCanonicalEnforcement(
      async (ctx: CanonicalAuthContext, handlerParams: Record<string, string>) => {
        // STEP 2: Apply policy-specific checks (fail-closed)

        if (options?.requireInternalAccess) {
          const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
          if (!internalAccess) {
            return new NextResponse(
              JSON.stringify({ error: "Internal access required" }),
              { status: 403 }
            );
          }
        }

        if (options?.requirePolicyContext) {
          if (!ctx.policy) {
            return new NextResponse(
              JSON.stringify({ error: "Policy context required" }),
              { status: 403 }
            );
          }
        }

        // STEP 3: Call handler (only if all policy checks passed)
        return handler(ctx, handlerParams);
      },
      {
        requireCapabilities: options?.requireCapabilities,
        requireActorType: options?.requireActorType,
        skipReadinessCheck: options?.skipReadinessCheck,
      }
    );

    // STEP 4: Delegate to base wrapper (which handles all auth/policy enforcement)
    return baseWrapper(req, { params: Promise.resolve(params) });
  };
}

