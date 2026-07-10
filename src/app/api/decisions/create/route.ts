import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NextRequest } from "next/server";
import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
  type VerifiedDecisionInput,
} from "@/services/decisions/decision-creation-service";
import { logger } from "@/infra/logger";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError, UnauthorizedError, ForbiddenError, ValidationError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth();

  // Validate workspace membership (fail-closed)
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new UnauthorizedError("Workspace ID is required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  // Check entitlement: decision_create (plan-based quota enforcement)
  const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new ValidationError("idempotency-key header is required");
  }

  const contentType = request.headers.get("content-type") || "";
  const userId = session.user.id;

  // Handle JSON request (single decision or bulk)
  if (contentType.includes("application/json")) {
    const body = await request.json();

    if (body.decisions && Array.isArray(body.decisions)) {
      // Bulk creation via JSON
      const decisions = body.decisions.map((d: any) => ({
        ...d,
        verifiedWorkspaceId: workspaceId,  // Verified at route level (enforcement)
        verifiedActorId: userId,  // Verified at route level (session)
      }));

      const idempotencyCheck = await checkIdempotencyKey({
        idempotencyKey,
        operationName: "createDecisionsBulk",
        actorId: userId,
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

        logger.info("Bulk decisions created via API", {
          workspaceId,
          userId,
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
        actorId: userId,
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
        // Construct verified input with explicit auth boundary
        const verifiedInput: VerifiedDecisionInput = {
          title,
          type,
          impact,
          confidence,
          verifiedActorId: userId,  // Verified at route level (session)
          verifiedWorkspaceId: workspaceId,  // Verified at route level (enforcement)
          problemType,
          expectedOutcome,
        };

        const decision = await createDecision(verifiedInput);

        logger.info("Decision created via API", {
          decisionId: decision.id,
          workspaceId,
          userId,
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

  // Handle FormData request (CSV upload)
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new UnauthorizedError("CSV file is required");
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "importDecisionsCSV",
      actorId: userId,
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
      // parseCSV expects legacy format - convert to verified format after parsing
      const parsedDecisions = parseCSV(csvContent, workspaceId, userId);
      const verifiedDecisions = parsedDecisions.map((d: any) => ({
        ...d,
        verifiedWorkspaceId: workspaceId,  // Verified at route level (enforcement)
        verifiedActorId: userId,  // Verified at route level (session)
      }));
      const result = await createDecisionsBulk({ decisions: verifiedDecisions });

      logger.info("Bulk decisions created via CSV upload", {
        workspaceId,
        userId,
        fileName: file.name,
        count: result.summary.succeeded,
      });

      const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      await recordIdempotencyResponse(idempotencyKey, 200, serialized, workspaceId);
      return result;
    } catch (parseError) {
      const governed = classifyOperatorError(parseError instanceof Error ? parseError : new Error(String(parseError)), { context: 'action' });
      const wrappedError = new UnauthorizedError(governed.operatorMessage);
      await recordIdempotencyError(idempotencyKey, wrappedError, workspaceId);
      throw wrappedError;
    }
  }

  throw new UnauthorizedError("Unsupported content type");
});
