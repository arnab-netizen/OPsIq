/**
 * Bundle 5.3 — Integration Event Ingestion Service
 *
 * Validates incoming integration events, determines if they warrant a BCP
 * re-evaluation, and fires the re-evaluation asynchronously (fire-and-forget).
 *
 * Pipeline:
 *   1. Validate event with IntegrationEventSchema (Zod)
 *   2. Verify connector belongs to workspace (workspace isolation)
 *   3. Emit INTEGRATION_EVENT_INGESTED audit event
 *   4. Check mapIntegrationEventToBcpTrigger → if non-null and businessId present:
 *      fire evaluateConditionProfile (dynamic import, fire-and-forget)
 *      emit INTEGRATION_EVENT_BCP_TRIGGERED audit event
 *
 * No DB model for events in this slice — events are validated and routed;
 * persistence is deferred to a future DB-available slice.
 *
 * Workspace-scoped throughout. Connector ownership verified before processing.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError, NotFoundError } from "@/infra/errors";
import {
  IntegrationEventSchema,
  mapIntegrationEventToBcpTrigger,
  type IntegrationEvent,
} from "@/domain/integration-fabric/integration-contracts";

// ─── Ingest result ────────────────────────────────────────────────────────────

export interface IngestResult {
  eventId: string;
  workspaceId: string;
  connectorId: string;
  provider: string;
  kind: string;
  bcpTriggered: boolean;
  bcpTriggerType: string | null;
}

// ─── Ingest event ─────────────────────────────────────────────────────────────

export async function ingestIntegrationEvent(
  rawEvent: unknown,
  actorId: string
): Promise<IngestResult> {
  // Step 1: Schema validation
  const parsed = IntegrationEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    throw new ValidationError(
      `Integration event validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`
    );
  }
  const event: IntegrationEvent = parsed.data;

  // Step 2: Verify connector belongs to workspace (workspace isolation)
  const connector = await db.ownerConnector.findFirst({
    where: { id: event.connectorId, workspaceId: event.workspaceId },
    select: { id: true, provider: true, status: true },
  });
  if (!connector) {
    throw new NotFoundError("OwnerConnector", event.connectorId);
  }

  // Step 3: Emit ingestion audit event
  await emitAuditEvent({
    workspaceId: event.workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.INTEGRATION_EVENT_INGESTED,
    entityType: "IntegrationEvent",
    entityId: event.id,
    payload: {
      connectorId: event.connectorId,
      provider: event.provider,
      kind: event.kind,
      businessId: event.businessId ?? null,
    },
  });

  // Step 4: Determine BCP trigger
  const bcpMapping = mapIntegrationEventToBcpTrigger(event.kind);
  const businessId = event.businessId ?? null;
  const shouldTriggerBcp = bcpMapping !== null && businessId !== null;

  if (shouldTriggerBcp) {
    // Fire-and-forget BCP re-evaluation — errors never propagate to caller
    void fireBcpReEvaluation(event, actorId, bcpMapping!.triggerType, bcpMapping!.triggerDescription);
  }

  return {
    eventId: event.id,
    workspaceId: event.workspaceId,
    connectorId: event.connectorId,
    provider: event.provider,
    kind: event.kind,
    bcpTriggered: shouldTriggerBcp,
    bcpTriggerType: shouldTriggerBcp ? bcpMapping!.triggerType : null,
  };
}

// ─── Fire BCP re-evaluation (fire-and-forget) ─────────────────────────────────
// Dynamic import prevents circular dependencies.
// I4: failures emit INTEGRATION_EVENT_BCP_TRIGGER_FAILED audit event.
// I12: on success, active consulting engagement health is updated for the workspace.

async function fireBcpReEvaluation(
  event: IntegrationEvent,
  actorId: string,
  triggerType: string,
  triggerDescription: string
): Promise<void> {
  try {
    const { getCurrentConditionProfile } = await import(
      "@/services/owner-mode/owner-bcp.service"
    );
    const current = await getCurrentConditionProfile({
      workspaceId: event.workspaceId,
      businessId: event.businessId!,
    });

    if (!current) {
      // No existing BCP — cannot re-evaluate without baseline facts
      return;
    }

    const { evaluateConditionProfile } = await import(
      "@/services/owner-mode/owner-bcp.service"
    );
    await evaluateConditionProfile({
      workspaceId: event.workspaceId,
      actorId,
      businessId: event.businessId!,
      facts: {
        financialHealthScore: current.financialHealthScore,
        operationalHealthScore: current.operationalHealthScore,
        salesHealthScore: current.salesHealthScore,
        sopHealthScore: current.sopHealthScore,
        humanExecutionRisk: current.humanExecutionRisk as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      },
      triggerType,
      triggerDescription,
      sourceReassessmentEventId: undefined,
    });

    await emitAuditEvent({
      workspaceId: event.workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.INTEGRATION_EVENT_BCP_TRIGGERED,
      entityType: "IntegrationEvent",
      entityId: event.id,
      payload: {
        businessId: event.businessId,
        triggerType,
        connectorId: event.connectorId,
        kind: event.kind,
      },
    });

    // I12: propagate BCP condition change to active consulting engagement health
    try {
      const activeEngagements = await db.engagement.findMany({
        where: { workspaceId: event.workspaceId, status: "ACTIVE", engagementMode: "consulting" },
        select: { id: true },
      });
      if (activeEngagements.length > 0) {
        const { updateConsultingEngagementHealth } = await import(
          "@/services/consulting/consulting-engagement.service"
        );
        for (const eng of activeEngagements) {
          await updateConsultingEngagementHealth(
            { engagementId: eng.id, workspaceId: event.workspaceId },
            actorId
          );
        }
      }
    } catch {
      // consulting health update is best-effort post-BCP; BCP trigger is already recorded
    }
  } catch (err) {
    // I4: record failure so it is not silently lost
    await emitAuditEvent({
      workspaceId: event.workspaceId,
      actorId,
      eventName: AUDIT_EVENTS.INTEGRATION_EVENT_BCP_TRIGGER_FAILED,
      entityType: "IntegrationEvent",
      entityId: event.id,
      payload: {
        businessId: event.businessId ?? null,
        connectorId: event.connectorId,
        kind: event.kind,
        errorKind: err instanceof Error ? err.name : "UnknownError",
      },
    }).catch(() => {/* last-resort: audit emit cannot propagate to ingest caller */});
  }
}
