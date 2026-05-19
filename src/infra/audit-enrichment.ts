/**
 * Audit Event Enrichment Helper
 * Automatically enriches audit events with required fields from context
 */

import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import type { AuditEventInput, MutationAuditEventInput } from "@/infra/audit";
import { randomUUID } from "crypto";

/**
 * Enriches mutation audit event with all required fields from context
 */
export function enrichMutationAuditEvent(
  baseEvent: Omit<AuditEventInput, "capability" | "decision" | "requestId"> &
    Partial<Pick<AuditEventInput, "capability" | "decision" | "requestId">>,
  authContext: CanonicalAuthContext,
  capabilityName?: string
): MutationAuditEventInput {
  if (!baseEvent.actorId) {
    baseEvent.actorId = authContext.verifiedActorId;
  }
  if (!baseEvent.workspaceId) {
    baseEvent.workspaceId = authContext.verifiedWorkspaceId;
  }

  const capability = baseEvent.capability || capabilityName || Array.from(authContext.verifiedCapabilities)[0];
  const requestId = baseEvent.requestId || authContext.requestId || authContext.correlationId || randomUUID();
  const decision = baseEvent.decision || "mutation_executed";

  return {
    ...baseEvent,
    actorId: baseEvent.actorId as string,
    workspaceId: baseEvent.workspaceId as string,
    capability: capability as string,
    decision,
    requestId,
    entityType: baseEvent.entityType as string,
    entityId: baseEvent.entityId as string,
  } as MutationAuditEventInput;
}

/**
 * Helper for services: emit mutation audit with context
 */
export async function emitMutationAuditWithContext(
  baseEvent: Omit<AuditEventInput, "capability" | "decision" | "requestId"> &
    Partial<Pick<AuditEventInput, "capability" | "decision" | "requestId">>,
  authContext: CanonicalAuthContext,
  capabilityName?: string
) {
  const { emitMutationAuditEvent } = await import("@/infra/audit");
  const enriched = enrichMutationAuditEvent(baseEvent, authContext, capabilityName);
  return emitMutationAuditEvent(enriched);
}
