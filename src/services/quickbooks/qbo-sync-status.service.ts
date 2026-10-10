/**
 * QuickBooks Online — owner-visible, token-free sync status DTO.
 *
 * Maps the persistence view onto a serializable shape. It deliberately has no realm id, no token or ciphertext fields,
 * no OAuth state and no provider payload: the type itself cannot carry them.
 */
import type { QboSyncFailureCode } from "@/domain/quickbooks/qbo-sync-model";
import type { QboPersistenceDeps } from "./qbo-connection.service";
import { readSyncStatusForBusiness } from "./qbo-sync-store.service";

export interface QboSyncStatusDto {
  connected: boolean;
  connectionId: string | null;
  environment: "sandbox" | "production" | null;
  connectionStatus: "ACTIVE" | "REAUTH_REQUIRED" | "ERROR" | "DISCONNECTED" | null;
  reauthorizationRequired: boolean;
  syncRunning: boolean;
  /** A large sync stopped at a checkpoint and continues automatically (not a failure). */
  syncContinuing: boolean;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastOutcome: "SUCCEEDED" | "PARTIAL" | "FAILED" | null;
  lastErrorCode: QboSyncFailureCode | null;
  nextAttemptNotBefore: string | null;
  consecutiveFailures: number;
  recordCounts: Record<string, number>;
  reportObservationCount: number;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getQboSyncStatus(input: { workspaceId: string; businessId: string }, deps?: QboPersistenceDeps): Promise<QboSyncStatusDto> {
  const v = await readSyncStatusForBusiness(input, deps);
  return {
    connected: v.connected,
    connectionId: v.connectionId,
    environment: v.environment,
    connectionStatus: v.connectionStatus,
    reauthorizationRequired: v.reauthorizationRequired,
    syncRunning: v.syncRunning,
    syncContinuing: v.syncContinuing,
    lastAttemptedAt: iso(v.lastAttemptedAt),
    lastSucceededAt: iso(v.lastSucceededAt),
    lastOutcome: v.lastOutcome,
    lastErrorCode: v.lastErrorCode,
    nextAttemptNotBefore: iso(v.nextAttemptNotBefore),
    consecutiveFailures: v.consecutiveFailures,
    recordCounts: v.recordCounts,
    reportObservationCount: v.reportObservationCount,
  };
}
