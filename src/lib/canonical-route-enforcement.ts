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
import { type VerifiedWorkspaceId, asVerifiedWorkspaceId } from "@/lib/workspace-identity";
import type { SessionInfo, AuthenticatedUser } from "@/services/auth";
import { getSessionFact, getPolicyContextFact } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import { hasInternalAccess } from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { buildAuthState, evaluateAuthState, translateAuthDecisionToResponse } from "@/lib/canonical-auth-facts";
import { CanonicalTelemetryLifecycle } from "@/lib/canonical-telemetry-lifecycle";
import { CanonicalExecutionTraceManager } from "@/lib/canonical-execution-trace";
import { CanonicalVerifiedSessionBuilder } from "@/lib/canonical-verified-session";
import {
  classifyExecution,
  pushExecutionContext,
  popExecutionContext,
} from "@/lib/execution-reentry-detector";
import {
  initializeEnforcerForRequest,
  RequestLifecycleStage,
  type RuntimeShadowReadEnforcer,
} from "@/lib/runtime-shadow-read-enforcer";
import { ClassifiedApiError, ensureClassification, hasClassification } from "@/infra/classified-error";
import { isCanonicalJsonResponse, stringifyRouteResponse } from "@/lib/canonical-json-response";
import { db } from "@/lib/db";
import { verifyDiagnosticKey } from "@/lib/security/diagnostic-key";

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

  // Verified workspace (if workspace-scoped route) — VerifiedWorkspaceId brand proves DB membership proof
  verifiedWorkspaceId: VerifiedWorkspaceId;

  // Verified capabilities (if capability-scoped route)
  verifiedCapabilities: Set<string>;

  // PHASE D: ROOT CONTAINER - Single execution lineage authority
  // Optional: not required for service layer, only for logging/tracing
  traceId?: string;
  executionTrace?: Readonly<unknown>;  // Read-only reference to unified trace

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
 * Real workspace/membership facts for the verified-session snapshot (M1 honesty fix).
 *
 * The session snapshot previously hardcoded `workspace.isActive: true`, the workspace id as its name, and a `now`
 * join date. This reads the REAL values from the DB via a single indexed lookup so the "verified" snapshot no
 * longer asserts workspace/membership facts it never checked. Exported so it is unit/DB-testable in isolation.
 */
export interface WorkspaceSnapshotFacts {
  workspaceName: string;
  workspaceIsActive: boolean;
  membershipIsActive: boolean;
  membershipJoinedAt: Date;
}

export async function resolveWorkspaceSnapshotFacts(
  workspaceId: string,
  userId: string
): Promise<WorkspaceSnapshotFacts> {
  const membership = await db.workspaceMembership.findFirst({
    where: { workspaceId, userId },
    select: {
      isActive: true,
      addedAt: true,
      workspace: { select: { name: true, isActive: true } },
    },
  });
  if (!membership) {
    // The wrapper already proved an active membership derived this workspaceId (STEP 1.5); a missing row here is a
    // real integrity fault, surfaced honestly rather than papered over with fabricated defaults.
    throw new ClassifiedApiError(
      "Workspace membership not found while building verified session snapshot",
      "workspace_context_invalid",
      "workspace_snapshot_facts_lookup",
      403
    );
  }
  return {
    workspaceName: membership.workspace.name,
    workspaceIsActive: membership.workspace.isActive,
    membershipIsActive: membership.isActive,
    membershipJoinedAt: membership.addedAt,
  };
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
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<unknown>;

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
    routeVersion?: string;
    serviceImportPath?: string;
    handlerName?: string;
    serviceVersion?: string;
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
      // STEP 1: GATHER AUTH FACTS (NO ERRORS THROWN)
      // ========================================

      // Workspace ID extraction deferred until after session validation
      // to ensure it can only be derived from authenticated user's membership
      const sessionFact = await getSessionFact(undefined);
      const policyFact = await getPolicyContextFact(undefined);

      // ========================================
      // STEP 1.5: RESOLVE WORKSPACE ID FROM MEMBERSHIP (FAIL-CLOSED)
      // ========================================

      let workspaceId: VerifiedWorkspaceId | undefined = undefined;

      // Workspace ID MUST be server-derived from authenticated user's workspace membership
      // It is NEVER trusted from request headers
      if (sessionFact.valid && sessionFact.session?.user) {
        try {
          const membership = await db.workspaceMembership.findFirst({
            where: {
              userId: sessionFact.session.user.id,
              isActive: true,
            },
            // M6: deterministic multi-workspace resolution. Without an explicit order a user with more
            // than one active membership got a non-deterministic workspace here — and one that could
            // disagree with the workspace `getPolicyContext` resolved capabilities for (auth.ts also
            // orders by addedAt). Order identically (earliest membership, workspaceId tiebreaker) so the
            // verified workspace and the policy context always agree.
            orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
            select: {
              workspaceId: true,
            },
          });

          if (!membership) {
            throw new ClassifiedApiError(
              "No active workspace membership found for user",
              "workspace_context_invalid",
              "workspace_membership_lookup",
              403
            );
          }

          if (!membership.workspaceId) {
            throw new ClassifiedApiError(
              "Workspace membership workspaceId is null or empty",
              "workspace_context_invalid",
              "workspace_membership_validation",
              403
            );
          }

          // Validate workspace ID is UUID-like format
          const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
          if (!uuidRegex.test(membership.workspaceId)) {
            throw new ClassifiedApiError(
              "Workspace membership workspaceId is not a valid UUID format",
              "workspace_context_invalid",
              "workspace_id_format_validation",
              403
            );
          }

          workspaceId = asVerifiedWorkspaceId(membership.workspaceId);
          traceManager.recordStage("WORKSPACE_EXTRACTED", "success", workspaceId);
        } catch (error) {
          // If error is already ClassifiedApiError, throw it
          if (error instanceof ClassifiedApiError) {
            throw error;
          }
          // Wrap unexpected errors as workspace context invalid
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new ClassifiedApiError(
            `Failed to derive verified workspace ID from membership: ${errorMsg}`,
            "workspace_context_invalid",
            "workspace_derivation_error",
            500,
            error
          );
        }
      } else if (!sessionFact.valid) {
        // Workspace resolution depends on valid session
        // If session is invalid, workspace context is invalid
        traceManager.recordStage("WORKSPACE_EXTRACTED", "failed", "no_valid_session");
        // Continue to auth evaluation which will reject due to invalid session
      } else {
        throw new ClassifiedApiError(
          "Session valid but user context missing",
          "workspace_context_invalid",
          "session_user_missing",
          500
        );
      }

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

        // Add safe diagnostic details if diagnostic key is valid and status is 403
        const hasDiagnosticAccess = verifyDiagnosticKey(
          req.headers.get("x-opsiq-diagnostic-key")
        );

        if (hasDiagnosticAccess && errorResponse.status === 403) {
          const requiredCaps = options?.requireCapabilities || [];
          const verifiedCapArray = decision.context?.verifiedCapabilities
            ? Array.from(decision.context.verifiedCapabilities)
            : [];

          const missingCapabilities: string[] = [];
          for (const cap of requiredCaps) {
            if (!verifiedCapArray.includes(cap)) {
              missingCapabilities.push(cap);
            }
          }

          const policyRoles = decision.context?.policy?.roles?.map((r) => r.role) || [];
          const policyCapabilities: string[] = [];
          if (decision.context?.policy?.roles) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- pre-existing synchronous load on the denial path
            const { getCapabilitiesForRole } = require("@/policies/capability-check");
            for (const role of decision.context.policy.roles) {
              const caps = getCapabilitiesForRole(role.role);
              policyCapabilities.push(...caps);
            }
          }

          const workspaceId = decision.context?.verifiedWorkspaceId;
          const workspaceIdSample = workspaceId
            ? workspaceId.length < 8
              ? "***"
              : `${workspaceId.substring(0, 4)}...${workspaceId.substring(workspaceId.length - 4)}`
            : undefined;

          (errorResponse.body as Record<string, unknown>) = {
            ...errorResponse.body,
            classification: "canonical_permission_denied",
            stage: "authorization",
            requiredCapabilities: requiredCaps,
            policyRoles,
            policyCapabilities: Array.from(new Set(policyCapabilities)),
            missingCapabilities,
            membershipFound: !!decision.context?.policy,
            roleAssignmentFound:
              (decision.context?.policy?.roles?.length || 0) > 0,
            verifiedWorkspaceIdShape: {
              present: !!workspaceId,
              uuidLike: workspaceId
                ? /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(workspaceId)
                : false,
              sample: workspaceIdSample,
            },
            capabilityDecisionSource: "withCanonicalEnforcement",
          };
        }

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

      // PHASE E: Create immutable snapshot of auth state. Fetch the REAL workspace/membership facts first (M1) so
      // the snapshot records verified state instead of hardcoded `isActive: true` / a fabricated name+join date.
      const workspaceFacts = await resolveWorkspaceSnapshotFacts(
        decision.context!.verifiedWorkspaceId,
        session.user.id
      );
      const sessionSnapshotBuilder = new CanonicalVerifiedSessionBuilder({
        traceId: traceManager.getTrace().traceId,
        correlationId,
        sessionInfo: session,
        policyContext: policy,
        workspaceId: decision.context!.verifiedWorkspaceId,
        capabilities: decision.context!.verifiedCapabilities as Set<CapabilityName>,
        workspaceName: workspaceFacts.workspaceName,
        workspaceIsActive: workspaceFacts.workspaceIsActive,
        membershipIsActive: workspaceFacts.membershipIsActive,
        membershipJoinedAt: workspaceFacts.membershipJoinedAt,
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

      // Extract status and headers from result if it's a canonical JSON response envelope
      let responseBody = result;
      let responseStatus = 200;
      let responseHeaders: Record<string, string> = {};

      if (isCanonicalJsonResponse(result)) {
        responseBody = result.body;
        responseStatus = result.status;
        if (result.headers) {
          responseHeaders = { ...result.headers };
        }
      }

      // PHASE D: Finalize trace (becomes immutable)
      const finalTrace = traceManager.finalize({
        allowed: true,
        statusCode: responseStatus,
        sessionSnapshotId: session?.sessionId,
      });

      telemetry.emitRequestCompleted();

      // PHASE F: Mark request complete and clear enforcer
      shadowReadEnforcer.setLifecycleStage(RequestLifecycleStage.REQUEST_COMPLETE);
      shadowReadEnforcer.clear();

      popExecutionContext(finalTrace.traceId);

      return new NextResponse(stringifyRouteResponse(responseBody), {
        status: responseStatus,
        headers: {
          ...responseHeaders,
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
      // Only true for a genuine AppError subclass (ValidationError,
      // NotFoundError, ForbiddenError, etc. -- see src/infra/errors.ts)
      // reporting a 4xx status: those are deliberately thrown, by
      // construction carry an owner-safe message (never a stack trace, SQL,
      // or provider payload), and exist specifically so the real reason for
      // a rejected request can be shown. A 5xx AppError (e.g.
      // ServiceUnavailableError) and any unclassified/raw exception keep
      // the generic message below -- this flag intentionally does not
      // widen to those cases.
      let isKnownSafeClientError = false;

      if (hasClassification(error)) {
        // Error already has classification/stage, preserve it
        classifiedError = ensureClassification(
          error,
          "handler_invocation",
          "handler_invocation_failed"
        );
      } else if (error && typeof error === "object" && "statusCode" in error && "code" in error) {
        // AppError subclass (NotFoundError, ForbiddenError, etc.)
        // Has statusCode and code properties - convert to ClassifiedApiError
        const appError = error as { statusCode?: unknown; code?: unknown };
        const statusCode = typeof appError.statusCode === "number" ? appError.statusCode : 500;
        const errorCode = typeof appError.code === "string" ? appError.code : "INTERNAL_ERROR";
        const errorMessage = error instanceof Error ? error.message : String(error);

        classifiedError = new ClassifiedApiError(
          errorMessage,
          `handler_invocation_${errorCode.toLowerCase()}`,
          "handler_invocation",
          statusCode,
          error
        );
        isKnownSafeClientError = statusCode >= 400 && statusCode < 500;
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

        // Extract safe details from raw error (may be Prisma or other)
        const { extractSafeKnownError } = await import("@/infra/classified-error");
        const safeDetails = extractSafeKnownError(error);

        // Add route context
        if (options?.routeVersion) {
          safeDetails.routeVersion = options.routeVersion;
        }
        if (options?.serviceImportPath) {
          safeDetails.serviceImportPath = options.serviceImportPath;
        }
        if (options?.handlerName) {
          safeDetails.handlerName = options.handlerName;
        }
        if (options?.serviceVersion) {
          safeDetails.engagementsServiceVersion = options.serviceVersion;
        }

        // Mark the failing operation
        if (safeDetails.prismaCode) {
          safeDetails.failingOperation = "handler_invocation_raw_prisma";
        } else {
          safeDetails.failingOperation = "handler_invocation_unknown";
        }

        classifiedError.safeDetails = safeDetails;
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

      const responseBody: Record<string, unknown> = {
        // A known, owner-safe 4xx AppError (e.g. ValidationError) exposes
        // its real message so the client can act on it; any 5xx or
        // unclassified/raw exception keeps a generic message -- never
        // exposes a stack, SQL, provider payload, or other internal detail.
        //
        // A real human usability test found that the PREVIOUS fallback text
        // here -- the literal phrase "Internal server error" -- was itself
        // the raw, alarming, unowned-by-anyone error text owners reported
        // seeing verbatim across the app (business save, start work, page
        // loads). It contained no Prisma/SQL/stack details, so it passed
        // every existing "no technical leakage" scanner, but it reads
        // exactly like a raw backend error to a lay owner and gives no
        // indication whether their data/action was affected. This generic
        // string is deliberately calm, admits nothing technical, and states
        // the one fact every failed write in this wrapper can honestly
        // guarantee: since the handler threw before responding, nothing was
        // saved. Page-/action-specific callers may still show a more
        // specific owner-safe message by classifying the response body
        // themselves (see src/lib/operator-error-governance.ts); this is
        // only the last-resort fallback when no more specific message exists.
        error: isKnownSafeClientError ? classifiedError.message : "Something went wrong on our side. Nothing was saved. Please try again.",
        correlationId: finalCorrelationId,
        classification: classifiedError.classification,
        stage: classifiedError.stage,
      };

      // Field-level validation issues (owner-safe 4xx only): lets a form mark
      // the exact field instead of showing a generic banner. Only the
      // {path, message} pairs produced by the validation layer are exposed.
      if (isKnownSafeClientError) {
        const fieldErrors = extractSafeFieldErrors(error);
        if (fieldErrors.length > 0) {
          responseBody.fieldErrors = fieldErrors;
        }
      }

      // Include safe error name for diagnostics
      if (safErrorName && safErrorName !== "unknown") {
        responseBody.errorName = safErrorName;
      }

      // Include operation if provided
      if (operationName) {
        responseBody.operation = operationName;
      }

      // Include safe Prisma details if available (allowlisted keys only)
      const safeDetails = (classifiedError as { safeDetails?: Record<string, unknown> }).safeDetails;
      if (safeDetails && typeof safeDetails === "object") {
        const allowlistedKeys = [
          "prismaCode",
          "safeMessage",
          "safeMetaKeys",
          "prismaClientVersion",
          "driverAdapterErrorName",
          "driverAdapterErrorCode",
          "driverAdapterErrorMessage",
          "errorName",
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

      return new NextResponse(stringifyRouteResponse(responseBody), {
        status: classifiedError.statusCode,
        headers: {
          "x-correlation-id": finalCorrelationId,
          "content-type": "application/json",
        },
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

/**
 * Extract `{path, message}` field issues from a 4xx AppError's details.
 * Anything that is not a short string pair is dropped, so no internal detail
 * can leak through this channel.
 */
export function extractSafeFieldErrors(error: unknown): Array<{ path: string; message: string }> {
  const details = (error as { details?: { fieldErrors?: unknown } } | null)?.details;
  const raw = details?.fieldErrors;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ path: string; message: string }> = [];
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const { path, message } = item as { path?: unknown; message?: unknown };
    if (typeof path !== "string" || typeof message !== "string") continue;
    out.push({ path: path.slice(0, 200), message: message.slice(0, 300) });
  }
  return out;
}
