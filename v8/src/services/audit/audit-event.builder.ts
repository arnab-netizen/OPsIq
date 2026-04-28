import type { ISODateTime, UUID } from "@/domain/diagnosis-v2/types";

export type AuditEventName =
  | "diagnosis.v2.started"
  | "diagnosis.v2.completed"
  | "diagnosis.v2.needs_input"
  | "business_state.snapshot_computed"
  | "variables.snapshot_computed"
  | "triggers.evaluated"
  | "action_plan.generated"
  | "policy.evaluated";

export interface AuditEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: UUID;
  name: AuditEventName;
  tenantId?: UUID;
  businessId?: UUID;
  engagementId?: UUID;
  actorUserId?: UUID;
  correlationId?: string;
  payload: TPayload;
  occurredAt: ISODateTime;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildAuditEvent<TPayload extends Record<string, unknown>>(input: {
  name: AuditEventName;
  tenantId?: UUID;
  businessId?: UUID;
  engagementId?: UUID;
  actorUserId?: UUID;
  correlationId?: string;
  payload: TPayload;
  occurredAt: ISODateTime;
}): AuditEventEnvelope<TPayload> {
  const canonical = JSON.stringify({ name: input.name, tenantId: input.tenantId, businessId: input.businessId, engagementId: input.engagementId, actorUserId: input.actorUserId, correlationId: input.correlationId, payload: input.payload, occurredAt: input.occurredAt });
  return {
    id: `audit_${stableHash(canonical)}`,
    name: input.name,
    tenantId: input.tenantId,
    businessId: input.businessId,
    engagementId: input.engagementId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    payload: input.payload,
    occurredAt: input.occurredAt,
  };
}
