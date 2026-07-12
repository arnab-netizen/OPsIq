import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";
import { runSystem } from "@/services/system/run";
import { createBaseline } from "@/services/onboarding/basic";
import { generateOperatorItems } from "@/services/operator/generate";
import { addItems, addBlockedDecision } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { canEdit, resolveApprovalGrant } from "@/services/auth/access";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { createDecisionResult } from "@/services/explanation/generate";
import { createIntegrityPayload } from "@/services/integrity/hash";
import { createSignaturePayload } from "@/services/integrity/sign";
import { classifyProblem } from "@/services/problem/classifier";
import { calculateBaselineMetrics } from "@/services/baseline/calculator";
import { DecisionResult } from "@/domain/decision/types";
import { createEventLogger } from "@/lib/observability/log";
import { emitWebhookAsync } from "@/lib/integrations/webhook";
import { normalizeDecisionInput, validateNormalizedMetrics } from "@/lib/decision/run";
import { evaluateDecisionGate, gateResultToPayload } from "@/services/control/decision-gate";
import { evaluateGuardrails, formatGuardrailViolations, HIGH_IMPACT_APPROVAL_THRESHOLD } from "@/services/control/guardrails";
import { validateDependencies } from "@/services/control/variable-registry";
import { enforceControlLayer } from "@/services/control/enforcement";
import { recordLifecycleStage } from "@/services/lifecycle/decision-lifecycle";
import { checkRateLimit, isDuplicateRequest, getRequestHash } from "@/services/production/safety-config";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function addIntegrity(
  result: DecisionResult,
  inputsSnapshot?: Record<string, unknown>
): DecisionResult {
  const integrity = createIntegrityPayload(result);
  const signature = createSignaturePayload(integrity.decisionHash);

  return {
    ...result,
    workspaceId: result.workspaceId,
    ...integrity,
    ...signature,
    inputsSnapshot,
  };
}

export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  let decisionResult: DecisionResult | null = null;
  let workspace;
  let userId: string | null = null;
  let logger: ReturnType<typeof createEventLogger> | null = null;
  const startTime = Date.now();

  // Track execution of control layer validations for bypass prevention
  const executedValidations: string[] = ["variable_registry"];

  // Get workspace context from canonical auth
  workspace = { workspaceId: ctx.verifiedWorkspaceId };

    // Initialize logger once workspace is available
    logger = createEventLogger("api_run", workspace.workspaceId);

    // Check rate limit per workspace
    if (!checkRateLimit(workspace.workspaceId)) {
      throw new Error("Rate limit exceeded");
    }

    // Record RECEIVED stage
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      stage: "RECEIVED",
      status: "success",
      durationMs: Date.now() - startTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    // Get user identity from canonical auth
    userId = ctx.verifiedActorId;

    // Enforce server-side auth
    const role = await resolveServerRole();
    if (!role) {
      // Log AUTH_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.AUTH_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorType: "user",
        workspaceId: workspace?.workspaceId,
        payload: {
          reason: "Session not found or invalid",
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new UnauthorizedError("Unauthorized");
    }

    if (!canEdit(role)) {
      // Log PERMISSION_DENIED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.PERMISSION_DENIED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          reason: "User role lacks edit permission",
          role,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new Error("Insufficient permissions");
    }

    // Record VALIDATED stage (auth and permissions passed)
    const validatedTime = Date.now();
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      actorId: userId,
      stage: "VALIDATED",
      status: "success",
      durationMs: validatedTime - startTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    // 1. Parse body
    const body = await ctx.request!.json();
    const { revenue, cost, currency, confidence, revenueChange, costChange, fxRates, recommendationId } = body;

    // Capture inputs snapshot for replay
    const inputsSnapshot = {
      revenue,
      cost,
      currency: currency || "INR",
      confidence,
      revenueChange,
      costChange,
      recommendationId,
      timestamp: new Date().toISOString(),
    };

    // 1a. FAIL-CLOSED: Validate all required financial inputs
    if (typeof revenue !== "number" || typeof cost !== "number") {
      const baseResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        "INVALID_INPUT"
      );
      decisionResult = addIntegrity(
        {
          ...baseResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log INPUT_VALIDATION_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INPUT_VALIDATION_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          reason: "Missing or invalid financial inputs",
          expectedFields: ["revenue", "cost"],
          providedFields: {
            revenue: typeof revenue,
            cost: typeof cost,
          },
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new Error("Missing or invalid required fields: revenue and cost must be numbers");
    }

    // 1b. FAIL-CLOSED: Require confidence to be explicitly provided
    if (typeof confidence !== "number") {
      const baseResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        "INVALID_INPUT"
      );
      decisionResult = addIntegrity(
        {
          ...baseResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log INPUT_VALIDATION_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INPUT_VALIDATION_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          reason: "Missing or invalid confidence value",
          expectedFields: ["confidence"],
          providedType: typeof confidence,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new Error("Missing required field: confidence must be a number between 0 and 1");
    }

    // 1c. FAIL-CLOSED: Require revenue/cost changes to be explicitly provided
    if (typeof revenueChange !== "number" || typeof costChange !== "number") {
      const baseResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        "INVALID_INPUT"
      );
      decisionResult = addIntegrity(
        {
          ...baseResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log INPUT_VALIDATION_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INPUT_VALIDATION_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          reason: "Missing or invalid revenue/cost change values",
          expectedFields: ["revenueChange", "costChange"],
          providedFields: {
            revenueChange: typeof revenueChange,
            costChange: typeof costChange,
          },
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new Error("Missing required fields: revenueChange and costChange must be numbers");
    }

    // 2. Normalize financial inputs before any calculations
    const inputCurrency = currency || "INR";

    // 2a. FAIL-CLOSED: Require FX rates for non-base currencies
    let fxRatesInput = fxRates || {};
    if (inputCurrency !== "INR" && !fxRatesInput[inputCurrency]) {
      const baseResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        "INVALID_INPUT"
      );
      decisionResult = addIntegrity(
        {
          ...baseResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log INPUT_VALIDATION_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INPUT_VALIDATION_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          reason: "Missing FX rate for non-base currency",
          currency: inputCurrency,
          baseCurrency: "INR",
          providedFxRates: Object.keys(fxRatesInput),
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      throw new Error(`Missing FX rate for currency ${inputCurrency}. Provide fxRates: { "${inputCurrency}": rate }`);
    }

    let normalizedMetrics;
    try {
      normalizedMetrics = normalizeDecisionInput(
        {
          revenue,
          cost,
          revenueChange,
          costChange,
          currency: inputCurrency,
          baseCurrency: "INR",
          confidence,
        },
        fxRatesInput
      );

      // Validate normalized metrics
      validateNormalizedMetrics(normalizedMetrics);
    } catch (normalizationError) {
      const governed = classifyOperatorError(normalizationError instanceof Error ? normalizationError : new Error(String(normalizationError)), { context: "load" });
      const errorMsg = governed.operatorMessage;

      const normErrResult = createDecisionResult(
        {
          baselineRevenue: 0,
          baselineCost: 0,
          deltaRevenue: 0,
          deltaCost: 0,
          confidence: 0,
          expectedImpact: 0,
        },
        false,
        errorMsg as "INVALID_INPUT" | "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT"
      );
      decisionResult = addIntegrity(
        {
          ...normErrResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log INPUT_VALIDATION_FAILED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.INPUT_VALIDATION_FAILED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          reason: "Input normalization/validation failed",
          errorMessage: errorMsg,
          inputCurrency,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      // Record ERRORED stage for normalization failure
      await recordLifecycleStage({
        workspaceId: workspace.workspaceId,
        actorId: userId,
        stage: "NORMALIZED",
        status: "error",
        reason: errorMsg,
        durationMs: Date.now() - validatedTime,
      }).catch(() => {
        // Ignore lifecycle recording errors - observability only
      });

      throw new Error(errorMsg);
    }

    // Record NORMALIZED stage (input normalization successful)
    const normalizedTime = Date.now();
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      actorId: userId,
      stage: "NORMALIZED",
      status: "success",
      durationMs: normalizedTime - validatedTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    // 3. Create baseline using normalized values (all in INR/base currency)
    const baseline = createBaseline(
      normalizedMetrics.baselineRevenue,
      normalizedMetrics.baselineCost
    );

    // 4. Build inputMetrics using normalized values (baseAmount)
    const inputMetrics: Record<string, number> = {
      baselineRevenue: normalizedMetrics.baselineRevenue,
      baselineCost: normalizedMetrics.baselineCost,
      revenueChange: normalizedMetrics.revenueChange,
      costChange: normalizedMetrics.costChange,
      confidence: normalizedMetrics.confidence,
    };

    // 4a. CONTROL LAYER: Validate variable dependencies (fail-closed)
    const depValidation = validateDependencies(inputMetrics);
    if (!depValidation.valid && depValidation.error) {
      const expectedImpact = normalizedMetrics.revenueChange - normalizedMetrics.costChange;

      // PERSISTENCE: Record blocked decision in database
      try {
        await addBlockedDecision({
          workspaceId: workspace.workspaceId,
          createdBy: userId || "system",
          ownerUserId: userId || "system",
          problem: "Decision blocked by dependency validation",
          action: "None - decision rejected",
          blockStage: "dependency_validation",
          blockReason: depValidation.error.details,
          expectedImpact,
          confidence: normalizedMetrics.confidence,
          inputsSnapshot: inputsSnapshot as Record<string, unknown>,
          controlLayerViolations: {
            variable: depValidation.error.variable,
            missingDependencies: depValidation.error.missingDependencies,
          },
        });
      } catch (persistError) {
        if (logger) {
          const governed = classifyOperatorError(persistError instanceof Error ? persistError : new Error(String(persistError)), { context: "load" });
          logger.error(`Failed to persist blocked decision: ${governed.operatorMessage}`);
        }
      }

      const depErrResult = createDecisionResult(
        {
          baselineRevenue: normalizedMetrics.baselineRevenue,
          baselineCost: normalizedMetrics.baselineCost,
          deltaRevenue: normalizedMetrics.revenueChange,
          deltaCost: normalizedMetrics.costChange,
          confidence: normalizedMetrics.confidence,
          expectedImpact,
        },
        false,
        "INVALID_INPUT"
      );
      decisionResult = addIntegrity(
        {
          ...depErrResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log DEPENDENCY_VALIDATION_BLOCKED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DEPENDENCY_VALIDATION_BLOCKED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          blockStage: "dependency_validation",
          blockReason: depValidation.error.details,
          variable: depValidation.error.variable,
          missingDependencies: depValidation.error.missingDependencies,
          expectedImpact,
          confidence: normalizedMetrics.confidence,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      if (logger) {
        logger.success({
          dependencyStatus: "blocked",
          variable: depValidation.error.variable,
          missingDependencies: depValidation.error.missingDependencies,
        });
      }

      // Record BLOCKED stage (dependency validation)
      await recordLifecycleStage({
        workspaceId: workspace.workspaceId,
        actorId: userId,
        stage: "BLOCKED",
        status: "blocked",
        reason: depValidation.error.details,
        durationMs: Date.now() - normalizedTime,
      }).catch(() => {
        // Ignore lifecycle recording errors - observability only
      });

      throw new Error(depValidation.error.details);
    }

    // Dependency validation passed
    executedValidations.push("dependency_validation");

    // 5. CONTROL LAYER: Decision Gate - Block unsafe decisions before execution
    const gateResult = evaluateDecisionGate({
      variables: inputMetrics,
      confidence: normalizedMetrics.confidence,
    });

    if (!gateResult.allowed) {
      const expectedImpact = normalizedMetrics.revenueChange - normalizedMetrics.costChange;

      // PERSISTENCE: Record blocked decision in database
      try {
        await addBlockedDecision({
          workspaceId: workspace.workspaceId,
          createdBy: userId || "system",
          ownerUserId: userId || "system",
          problem: "Decision blocked by decision gate",
          action: "None - decision rejected",
          blockStage: "decision_gate",
          blockReason: gateResult.reason || "Decision gate validation failed",
          expectedImpact,
          confidence: normalizedMetrics.confidence,
          inputsSnapshot: inputsSnapshot as Record<string, unknown>,
          gateResult: {
            reason: gateResult.reason,
            missingVariables: gateResult.missingVariables,
            lowConfidenceVariables: gateResult.lowConfidenceVariables,
            staleVariables: gateResult.staleVariables,
          },
        });
      } catch (persistError) {
        if (logger) {
          const governed = classifyOperatorError(persistError instanceof Error ? persistError : new Error(String(persistError)), { context: "load" });
          logger.error(`Failed to persist blocked decision: ${governed.operatorMessage}`);
        }
      }

      // Return 422 Unprocessable Entity - decision blocked by gate
      const gateBlockResult = createDecisionResult(
        {
          baselineRevenue: normalizedMetrics.baselineRevenue,
          baselineCost: normalizedMetrics.baselineCost,
          deltaRevenue: normalizedMetrics.revenueChange,
          deltaCost: normalizedMetrics.costChange,
          confidence: normalizedMetrics.confidence,
          expectedImpact,
        },
        false,
        "INVALID_INPUT"
      );

      decisionResult = addIntegrity(
        {
          ...gateBlockResult,
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log DECISION_GATE_BLOCKED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DECISION_GATE_BLOCKED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          blockStage: "decision_gate",
          blockReason: gateResult.reason || "Decision gate validation failed",
          missingVariables: gateResult.missingVariables,
          lowConfidenceVariables: gateResult.lowConfidenceVariables,
          staleVariables: gateResult.staleVariables,
          expectedImpact,
          confidence: normalizedMetrics.confidence,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      // Log gate rejection
      if (logger) {
        logger.success({
          gateStatus: "blocked",
          reason: gateResult.reason,
          missingVariables: gateResult.missingVariables,
          lowConfidenceVariables: gateResult.lowConfidenceVariables,
        });
      }

      // Record BLOCKED stage (decision gate)
      await recordLifecycleStage({
        workspaceId: workspace.workspaceId,
        actorId: userId,
        stage: "BLOCKED",
        status: "blocked",
        reason: gateResult.reason || "Decision gate validation failed",
        durationMs: Date.now() - normalizedTime,
      }).catch(() => {
        // Ignore lifecycle recording errors - observability only
      });

      throw new Error(gateResult.reason || "Decision gate validation failed");
    }

    // Decision gate passed - record GATED stage
    const gatedTime = Date.now();
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      actorId: userId,
      stage: "GATED",
      status: "success",
      durationMs: gatedTime - normalizedTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    executedValidations.push("decision_gate");

    // 6. Call runSystem with error handling for decision validation
    // runSystem enforces scenario-first execution (fail-closed if scenarios fail)
    // It includes data_sufficiency validation internally
    let result;
    try {
      result = runSystem(inputMetrics);
      // System executed successfully - data sufficiency was validated
      executedValidations.push("data_sufficiency");
    } catch (systemError) {
      const governed = classifyOperatorError(systemError instanceof Error ? systemError : new Error(String(systemError)), { context: "load" });
      const errorMsg = governed.operatorMessage;

      if (errorMsg === "LOW_CONFIDENCE_BLOCKED") {
        const lowConfResult = createDecisionResult(
          {
            baselineRevenue: normalizedMetrics.baselineRevenue,
            baselineCost: normalizedMetrics.baselineCost,
            deltaRevenue: normalizedMetrics.revenueChange,
            deltaCost: normalizedMetrics.costChange,
            confidence: normalizedMetrics.confidence,
            expectedImpact: normalizedMetrics.revenueChange - normalizedMetrics.costChange,
          },
          false,
          "LOW_CONFIDENCE"
        );
        decisionResult = addIntegrity(
          {
            ...lowConfResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      } else if (errorMsg === "NON_POSITIVE_IMPACT_BLOCKED") {
        const nonPosResult = createDecisionResult(
          {
            baselineRevenue: normalizedMetrics.baselineRevenue,
            baselineCost: normalizedMetrics.baselineCost,
            deltaRevenue: normalizedMetrics.revenueChange,
            deltaCost: normalizedMetrics.costChange,
            confidence: normalizedMetrics.confidence,
            expectedImpact: normalizedMetrics.revenueChange - normalizedMetrics.costChange,
          },
          false,
          "NON_POSITIVE_IMPACT"
        );
        decisionResult = addIntegrity(
          {
            ...nonPosResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      } else if (errorMsg.startsWith("SCENARIO_GENERATION_FAILED")) {
        const scenarioErrResult = createDecisionResult(
          {
            baselineRevenue: normalizedMetrics.baselineRevenue,
            baselineCost: normalizedMetrics.baselineCost,
            deltaRevenue: normalizedMetrics.revenueChange,
            deltaCost: normalizedMetrics.costChange,
            confidence: normalizedMetrics.confidence,
            expectedImpact: normalizedMetrics.revenueChange - normalizedMetrics.costChange,
          },
          false,
          "INVALID_INPUT"
        );
        decisionResult = addIntegrity(
          {
            ...scenarioErrResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      } else {
        const unknownErrResult = createDecisionResult(
          {
            baselineRevenue: normalizedMetrics.baselineRevenue,
            baselineCost: normalizedMetrics.baselineCost,
            deltaRevenue: normalizedMetrics.revenueChange,
            deltaCost: normalizedMetrics.costChange,
            confidence: normalizedMetrics.confidence,
            expectedImpact: normalizedMetrics.revenueChange - normalizedMetrics.costChange,
          },
          false,
          "INVALID_INPUT"
        );
        decisionResult = addIntegrity(
          {
            ...unknownErrResult,
            workspaceId: workspace.workspaceId,
            ownerUserId: userId || undefined,
            createdBy: userId || undefined,
          },
          inputsSnapshot
        );
      }

      // Record ERRORED stage (system error during gating)
      await recordLifecycleStage({
        workspaceId: workspace.workspaceId,
        actorId: userId,
        stage: "ERRORED",
        status: "error",
        reason: errorMsg,
        durationMs: Date.now() - gatedTime,
      }).catch(() => {
        // Ignore lifecycle recording errors - observability only
      });

      throw new Error(errorMsg);
    }

    // 7. Classify problem type based on normalized financial impact
    const problemType = classifyProblem({
      baselineRevenue: normalizedMetrics.baselineRevenue,
      baselineCost: normalizedMetrics.baselineCost,
      revenueChange: normalizedMetrics.revenueChange,
      costChange: normalizedMetrics.costChange,
      expectedImpact: result.impact.impactExpected,
    });

    // 8. Calculate baseline impact metrics using normalized values
    const baselineMetrics = calculateBaselineMetrics({
      baselineRevenue: normalizedMetrics.baselineRevenue,
      baselineCost: normalizedMetrics.baselineCost,
      revenueChange: normalizedMetrics.revenueChange,
      costChange: normalizedMetrics.costChange,
      expectedImpact: result.impact.impactExpected,
    });

    // 9. Create approved decision result with user-provided values (not defaults)
    const approvedResult = createDecisionResult(
      {
        baselineRevenue: normalizedMetrics.baselineRevenue,
        baselineCost: normalizedMetrics.baselineCost,
        deltaRevenue: normalizedMetrics.revenueChange,
        deltaCost: normalizedMetrics.costChange,
        confidence: normalizedMetrics.confidence,
        expectedImpact: result.impact.impactExpected,
      },
      true
    );
    decisionResult = addIntegrity(
      {
        ...approvedResult,
        workspaceId: workspace.workspaceId,
        ownerUserId: userId || undefined,
        createdBy: userId || undefined,
        problemType,
        baselineValue: baselineMetrics.baselineValue,
        projectedWithoutAction: baselineMetrics.projectedWithoutAction,
      },
      inputsSnapshot
    );

    // 9a. CONTROL LAYER: Evaluate Guardrails - Check visible policy constraints
    // SECURITY: `approvalFlag` is client-supplied but a high-impact financial
    // block must never be self-granted. Honor the flag ONLY when the
    // server-verified role is authorized to approve (canApprove → admin). An
    // operator/viewer cannot bypass HIGH_IMPACT_APPROVAL by sending
    // approvalFlag:true. See RELIABILITY/proof-integrity audit (GAP-FIN-01).
    const approvalRequested = body.approvalFlag === true;
    const approverAuthorized = resolveApprovalGrant(role, body.approvalFlag);
    const isHighImpact =
      result.impact.impactExpected > HIGH_IMPACT_APPROVAL_THRESHOLD;

    // Audit trail: no financial-block override without a record of who granted
    // it, and a record of any unauthorized self-approval attempt that was denied.
    if (isHighImpact && approvalRequested) {
      await emitAuditEvent({
        eventName: approverAuthorized
          ? AUDIT_EVENTS.HIGH_IMPACT_APPROVAL_GRANTED
          : AUDIT_EVENTS.HIGH_IMPACT_APPROVAL_DENIED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: {
            expectedImpact: result.impact.impactExpected,
            threshold: HIGH_IMPACT_APPROVAL_THRESHOLD,
            approverAuthorized,
          },
          reason: approverAuthorized
            ? "High-impact decision approved by an authorized approver"
            : "High-impact approval flag ignored: actor role is not authorized to approve",
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(
            auditError instanceof Error ? auditError : new Error(String(auditError)),
            { context: "load" },
          );
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });
    }

    const guardrailsResult = evaluateGuardrails({
      expectedImpact: result.impact.impactExpected,
      confidence: normalizedMetrics.confidence,
      approvalFlag: approverAuthorized,
    });

    if (guardrailsResult.blocked) {
      // PERSISTENCE: Record blocked decision in database
      try {
        const blockReason = guardrailsResult.violations
          .map((v) => v.message)
          .join("; ");

        await addBlockedDecision({
          workspaceId: workspace.workspaceId,
          createdBy: userId || "system",
          ownerUserId: userId || "system",
          problem: "Decision blocked by guardrails",
          action: "None - decision rejected",
          blockStage: "guardrails",
          blockReason,
          expectedImpact: result.impact.impactExpected,
          confidence: normalizedMetrics.confidence,
          inputsSnapshot: inputsSnapshot as Record<string, unknown>,
          guardrailResult: {
            violations: guardrailsResult.violations,
            warnings: guardrailsResult.warnings,
          },
        });
      } catch (persistError) {
        if (logger) {
          const governed = classifyOperatorError(persistError instanceof Error ? persistError : new Error(String(persistError)), { context: "load" });
          logger.error(`Failed to persist blocked decision: ${governed.operatorMessage}`);
        }
      }

      // Decision blocked by guardrails - return with explanation
      decisionResult = addIntegrity(
        {
          ...createDecisionResult(
            {
              baselineRevenue: normalizedMetrics.baselineRevenue,
              baselineCost: normalizedMetrics.baselineCost,
              deltaRevenue: normalizedMetrics.revenueChange,
              deltaCost: normalizedMetrics.costChange,
              confidence: normalizedMetrics.confidence,
              expectedImpact: result.impact.impactExpected,
            },
            false,
            "INVALID_INPUT"
          ),
          workspaceId: workspace.workspaceId,
          ownerUserId: userId || undefined,
          createdBy: userId || undefined,
        },
        inputsSnapshot
      );

      // Log GUARDRAILS_BLOCKED audit event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.GUARDRAILS_BLOCKED,
        entityType: "Decision",
        entityId: "system-run",
        actorId: userId || undefined,
        actorType: "user",
        workspaceId: workspace.workspaceId,
        payload: {
          role,
          after: decisionResult,
          blockStage: "guardrails",
          blockReason: guardrailsResult.violations.map((v) => v.message).join("; "),
          violations: guardrailsResult.violations.map((v) => ({
            ruleId: v.ruleId,
            severity: v.severity,
            message: v.message,
            threshold: v.threshold,
            actual: v.actual,
            overrideAllowed: v.overrideAllowed,
          })),
          warnings: guardrailsResult.warnings,
          expectedImpact: result.impact.impactExpected,
          confidence: normalizedMetrics.confidence,
        },
      }).catch((auditError) => {
        if (logger) {
          const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
          logger.error(`Audit logging failed: ${governed.operatorMessage}`);
        }
      });

      if (logger) {
        logger.success({
          guardrailStatus: "blocked",
          violations: guardrailsResult.violations.length,
          warnings: guardrailsResult.warnings.length,
        });
      }

      // Record BLOCKED stage (guardrails)
      await recordLifecycleStage({
        workspaceId: workspace.workspaceId,
        actorId: userId,
        stage: "BLOCKED",
        status: "blocked",
        reason: guardrailsResult.violations.map((v) => v.message).join("; "),
        durationMs: Date.now() - gatedTime,
      }).catch(() => {
        // Ignore lifecycle recording errors - observability only
      });

      throw new Error(guardrailsResult.violations.map((v) => v.message).join("; "));
    }

    // Record GUARDRAIL_CHECKED stage
    const guardrailCheckedTime = Date.now();
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      actorId: userId,
      stage: "GUARDRAIL_CHECKED",
      status: "success",
      durationMs: guardrailCheckedTime - gatedTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    // Guardrails validation passed
    executedValidations.push("guardrails");

    if (!userId) {
      throw new Error("User identity required");
    }

    // 10. Generate operator items and store them
    const operatorItems = generateOperatorItems(
      result.decisions,
      result.impact,
      workspace.workspaceId,
      userId,
      userId,
      problemType,
      baselineMetrics,
      recommendationId
    );
    await addItems(operatorItems);

    // Get first operator item ID for lifecycle tracking
    const firstOperatorItemId = operatorItems.length > 0 ? operatorItems[0].id : undefined;

    // Get actor ID for audit
    const actorId = userId;

    // 11. Log audit event for run execution (fail-closed)
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RUN_APPROVED,
      entityType: "Decision",
      entityId: "system-run",
      actorId,
      actorType: "user",
      workspaceId: workspace.workspaceId,
      payload: {
        role,
        after: decisionResult,
        inputRevenue: revenue,
        inputCost: cost,
        inputCurrency: inputCurrency,
        expectedImpact: result.impact.impactExpected,
        confidence: normalizedMetrics.confidence,
        problemType,
      },
    }).catch((auditError) => {
      if (logger) logger.error(`Audit logging failed: ${auditError}`);
      throw auditError;
    });

    // Record APPROVED stage
    await recordLifecycleStage({
      workspaceId: workspace.workspaceId,
      decisionId: firstOperatorItemId,
      actorId: userId,
      stage: "APPROVED",
      status: "success",
      durationMs: Date.now() - startTime,
    }).catch(() => {
      // Ignore lifecycle recording errors - observability only
    });

    // 12. Emit webhook for decision creation (non-blocking)
    emitWebhookAsync(`${process.env.WEBHOOK_URL || ""}`, {
      event: "decision_created",
      timestamp: new Date().toISOString(),
      workspaceId: workspace.workspaceId,
      data: {
        decision: decisionResult.decision,
        expectedImpact: decisionResult.expectedImpact,
        confidence: decisionResult.confidence,
        problemType: decisionResult.problemType,
      },
    }).catch(() => {
      // Intentionally swallow errors - webhook failures should not block the request
    });

    // 13. CONTROL LAYER: Verify all validations were executed (bypass prevention)
    try {
      enforceControlLayer("/api/run", executedValidations);
    } catch (enforceError: any) {
      // Control layer bypass detected - log and throw
      const governed = classifyOperatorError(enforceError instanceof Error ? enforceError : new Error(String(enforceError.reason || enforceError)), { context: "load" });
      const bypasMsg = `CONTROL_LAYER_BYPASS: ${governed.operatorMessage}`;
      if (logger) {
        logger.error(bypasMsg, {
          skippedValidations: enforceError.skippedValidations,
          requiredValidations: enforceError.requiredValidations,
        });
      }
      throw new Error(`Control layer validation incomplete: ${governed.operatorMessage}`);
    }

    // Return decision result with explanation (including guardrails status)
    if (logger) {
      logger.success({
        decision: decisionResult?.decision,
        problemType: decisionResult?.problemType,
        guardrailWarnings: guardrailsResult.warnings.length,
      });
    }

    const responsePayload: Record<string, unknown> = {
      decision: decisionResult,
      scenarios: {
        baseline: result.scenarios.baseline,
        recommended: result.scenarios.recommended,
        alternatives: result.scenarios.alternatives,
      },
    };

    // Include guardrails warnings if any
    if (guardrailsResult.warnings.length > 0) {
      responsePayload.guardrails = {
        blocked: false,
        violations: guardrailsResult.violations.filter((v) => v.severity === "warn"),
        warnings: guardrailsResult.warnings,
      };
    }

  return responsePayload;
}, { requireWorkspace: true });
