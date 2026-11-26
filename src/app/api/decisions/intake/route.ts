import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ValidationError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { buildIntakeOperatorItemData } from "./intake-data";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { z } from "zod";
import { resolveAiProvider } from "@/services/ai/resolve-provider";
import { runIntakeExtract } from "@/services/ai/tasks";
import type { AiContext } from "@/services/ai/provider";

const IntakeSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  risk: z.enum(["low", "medium", "high"]).optional().default("medium"),
  recommendationId: z.string().uuid().optional(),
});

/**
 * POST /api/decisions/intake
 *
 * Simple decision intake endpoint.
 * Accepts minimal fields and auto-creates pending decision.
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const input = IntakeSchema.parse(body);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "intakeDecision",
      actorId,
      workspaceId,
      payload: { title: input.title, workspaceId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    try {
      const decision = await db.operatorItem.create({
        data: buildIntakeOperatorItemData(input, workspaceId, actorId),
      });

      await emitAuditEvent({
        eventName: AUDIT_EVENTS.DECISION_INTAKE,
        entityType: "Decision",
        entityId: decision.id,
        actorId,
        actorType: "user",
        workspaceId,
        payload: {
          after: {
            id: decision.id,
            status: "pending",
            title: input.title,
          },
          action: "intake_decision",
          source: "api",
          confidence: input.confidence,
          risk: input.risk,
          createdAt: new Date().toISOString(),
        },
      });

      const responseBody = {
        decisionId: decision.id,
        status: "pending" as const,
        createdAt: decision.createdAt instanceof Date
          ? decision.createdAt.toISOString()
          : decision.createdAt,
      };

      // AI advisory — non-blocking. Never gates the deterministic path.
      let aiAdvisory: { status: string; output: unknown } | null = null;
      try {
        const provider = resolveAiProvider();
        const context: AiContext = {
          workspaceId,
          taskType: "INTAKE_EXTRACT",
          riskLevel: "LOW_CONTENT",
          items: [
            { kind: "owner_note", label: "Problem statement", value: input.title, trusted: false },
            { kind: "owner_note", label: "Description", value: input.description || "", trusted: false },
          ],
          allowedEvidenceIds: [],
          gates: { requiresOwnerApproval: false },
        };
        const result = await runIntakeExtract(provider, context, { timeoutMs: 10000, maxRetries: 0 });
        aiAdvisory = { status: result.status, output: result.output ?? null };
      } catch {
        // AI failure must never surface to caller or block deterministic response
      }

      // Cache only the deterministic response (AI advisory excluded from idempotency cache)
      await recordIdempotencyResponse(idempotencyKey, 200, responseBody, workspaceId);
      return { ...responseBody, aiAdvisory };
    } catch (error) {
      await recordIdempotencyError(
        idempotencyKey,
        error instanceof Error ? error : new Error(String(error)),
        workspaceId
      );
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.DECISION_CREATE] }
);
