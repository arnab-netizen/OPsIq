import type { UUID } from "@/domain/diagnosis-v2/types";

export interface RequestContext {
  requestId: string;
  correlationId: string;
  actorUserId?: UUID;
  tenantId?: UUID;
  organizationId?: UUID;
  businessId?: UUID;
  startedAtIso: string;
}

type GlobalWithCounter = typeof globalThis & { __opsiqRequestCounter?: number };

function fallbackId(prefix: string): string {
  const globalWithCounter = globalThis as GlobalWithCounter;
  const counter = globalWithCounter.__opsiqRequestCounter ?? 0;
  globalWithCounter.__opsiqRequestCounter = counter + 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function safeRequestId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return fallbackId(prefix);
}

export function createRequestContext(headers?: Headers): RequestContext {
  const requestId = headers?.get("x-request-id") ?? safeRequestId("req");
  const correlationId = headers?.get("x-correlation-id") ?? requestId;
  return { requestId, correlationId, startedAtIso: new Date().toISOString() };
}
