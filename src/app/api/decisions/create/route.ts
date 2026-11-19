import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
  bulkPlanLimitRefusal,
  type VerifiedDecisionInput,
} from "@/services/decisions/decision-creation-service";
import { logger } from "@/infra/logger";
import { PlanLimitError, UnauthorizedError, ValidationError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    // Plan quota: decision:create is checked and recorded atomically with each decision insert
    // (createDecision), after the idempotency claim, so a replayed key returns its cached response and
    // never consumes or is refused for a unit it already used.
    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const contentType = ctx.request?.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = ctx.request ? await ctx.request.json() : {};

      if (body.decisions && Array.isArray(body.decisions)) {
        // Bulk creation via JSON
        const decisions = body.decisions.map((d: VerifiedDecisionInput) => ({
          ...d,
          verifiedWorkspaceId: workspaceId,
          verifiedActorId: actorId,
        }));

        const idempotencyCheck = await checkIdempotencyKey({
          idempotencyKey,
          operationName: "createDecisionsBulk",
          actorId,
          workspaceId,
          payload: { workspaceId, decisionCount: decisions.length },
        });

        if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
          return idempotencyCheck.cachedResponse.body;
        }
        if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
          throw idempotencyCheck.cachedError;
        }

        try {
          const result = await createDecisionsBulk({ decisions });
          // The plan refused every item: the whole request is a 402, as it was before usage was recorded.
          const refusal = bulkPlanLimitRefusal(result);
          if (refusal) throw refusal;

          logger.info("Bulk decisions created via API", {
            workspaceId,
            userId: actorId,
            count: result.summary.succeeded,
          });

          const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
          await recordIdempotencyResponse(idempotencyKey, 200, serialized, workspaceId);
          return result;
        } catch (error) {
          await recordIdempotencyError(
            idempotencyKey,
            error instanceof Error ? error : new Error(String(error)),
            workspaceId
          );
          throw error;
        }
      } else {
        // Single decision creation
        const { title, type, impact, confidence, problemType, expectedOutcome } = body;

        const idempotencyCheck = await checkIdempotencyKey({
          idempotencyKey,
          operationName: "createDecision",
          actorId,
          workspaceId,
          payload: { title: title || null, type: type || null, workspaceId },
        });

        if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
          return idempotencyCheck.cachedResponse.body;
        }
        if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
          throw idempotencyCheck.cachedError;
        }

        try {
          const verifiedInput: VerifiedDecisionInput = {
            title,
            type,
            impact,
            confidence,
            verifiedActorId: actorId,
            verifiedWorkspaceId: workspaceId,
            problemType,
            expectedOutcome,
          };

          const decision = await createDecision(verifiedInput);

          logger.info("Decision created via API", {
            decisionId: decision.id,
            workspaceId,
            userId: actorId,
          });

          const serialized = JSON.parse(JSON.stringify(decision)) as Record<string, unknown>;
          await recordIdempotencyResponse(idempotencyKey, 200, serialized, workspaceId);
          return decision;
        } catch (error) {
          await recordIdempotencyError(
            idempotencyKey,
            error instanceof Error ? error : new Error(String(error)),
            workspaceId
          );
          throw error;
        }
      }
    }

    if (contentType.includes("multipart/form-data")) {
      const formData = ctx.request ? await ctx.request.formData() : new FormData();
      const file = formData.get("file") as File;

      if (!file) {
        throw new UnauthorizedError("CSV file is required");
      }

      const idempotencyCheck = await checkIdempotencyKey({
        idempotencyKey,
        operationName: "importDecisionsCSV",
        actorId,
        workspaceId,
        payload: { workspaceId, fileName: file.name },
      });

      if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
        return idempotencyCheck.cachedResponse.body;
      }
      if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
        throw idempotencyCheck.cachedError;
      }

      const csvContent = await file.text();

      try {
        const parsedDecisions = parseCSV(csvContent, workspaceId, actorId);
        const verifiedDecisions = parsedDecisions.map((d) => ({
          ...d,
          verifiedWorkspaceId: workspaceId,
          verifiedActorId: actorId,
        }));
        const result = await createDecisionsBulk({ decisions: verifiedDecisions });
        // The plan refused every item: the whole request is a 402, as it was before usage was recorded.
        const refusal = bulkPlanLimitRefusal(result);
        if (refusal) throw refusal;

        logger.info("Bulk decisions created via CSV upload", {
          workspaceId,
          userId: actorId,
          fileName: file.name,
          count: result.summary.succeeded,
        });

        const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
        await recordIdempotencyResponse(idempotencyKey, 200, serialized, workspaceId);
        return result;
      } catch (parseError) {
        if (parseError instanceof PlanLimitError) {
          await recordIdempotencyError(idempotencyKey, parseError, workspaceId);
          throw parseError;
        }
        const governed = classifyOperatorError(parseError instanceof Error ? parseError : new Error(String(parseError)), { context: 'action' });
        const wrappedError = new UnauthorizedError(governed.operatorMessage);
        await recordIdempotencyError(idempotencyKey, wrappedError, workspaceId);
        throw wrappedError;
      }
    }

    throw new UnauthorizedError("Unsupported content type");
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.DECISION_CREATE] }
);
