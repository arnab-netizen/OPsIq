/**
 * Bundle 5.2 — Owner Connector Registry Service
 *
 * Governs connector lifecycle for the owner-mode integration fabric:
 * - registerConnector (idempotent — returns existing if same workspace+provider)
 * - disconnectConnector (status → DISCONNECTED, audit event)
 * - listConnectors (workspace-scoped, returns public DTOs only)
 * - getConnector (by id + workspace)
 * - markRefreshFailed (sets REFRESH_FAILED status + failure message, audit event)
 *
 * Token values (accessToken, refreshToken) are NEVER returned by this service.
 * Token storage is in OwnerConnectorToken (separate model, separate service).
 * Workspace-scoped throughout. Audit events emitted on all material mutations.
 */

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import {
  CONNECTOR_PROVIDERS,
  CONNECTOR_STATUSES,
  deriveConnectorHealthSeverity,
  buildConnectorHealthIssues,
  type ConnectorPublicDTO,
  type ConnectorProvider,
  type ConnectorStatus,
  type ConnectorHealthReport,
} from "@/domain/integration-fabric/integration-contracts";

// ─── Internal select (no token join) ─────────────────────────────────────────
// registeredBy is excluded from the public DTO.

const connectorSelect = {
  id: true,
  workspaceId: true,
  businessId: true,
  provider: true,
  status: true,
  connectedAt: true,
  lastSyncAt: true,
  lastSyncRecords: true,
  tokenExpiresAt: true,
  syncFailureMessage: true,
  createdAt: true,
  updatedAt: true,
  // registeredBy: intentionally excluded (internal-only)
  // token: intentionally excluded (never join into public responses)
} as const;

type ConnectorRow = {
  id: string;
  workspaceId: string;
  businessId: string | null;
  provider: string;
  status: string;
  connectedAt: Date;
  lastSyncAt: Date | null;
  lastSyncRecords: number | null;
  tokenExpiresAt: Date | null;
  syncFailureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Validation guards ────────────────────────────────────────────────────────

function assertProvider(p: string): asserts p is ConnectorProvider {
  if (!(CONNECTOR_PROVIDERS as readonly string[]).includes(p)) {
    throw new ConflictError(`Invalid provider: ${p}. Must be one of: ${CONNECTOR_PROVIDERS.join(" | ")}`);
  }
}

export function assertConnectorStatus(s: string): asserts s is ConnectorStatus {
  if (!(CONNECTOR_STATUSES as readonly string[]).includes(s)) {
    throw new ConflictError(`Invalid status: ${s}. Must be one of: ${CONNECTOR_STATUSES.join(" | ")}`);
  }
}

// ─── DTO boundary ─────────────────────────────────────────────────────────────
// registeredBy never appears in output. Token model never joined.

function toPublicDTO(row: ConnectorRow): ConnectorPublicDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider as ConnectorProvider,
    status: row.status as ConnectorStatus,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncRecords: row.lastSyncRecords,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    syncFailureMessage: row.syncFailureMessage,
    createdAt: row.createdAt.toISOString(),
    // registeredBy: INTENTIONALLY EXCLUDED
    // token: NEVER JOINED
  };
}

// ─── Register connector (idempotent) ─────────────────────────────────────────

export interface RegisterConnectorInput {
  workspaceId: string;
  actorId: string;
  provider: string;
  businessId?: string;
  tokenExpiresAt?: Date;
}

export async function registerConnector(
  input: RegisterConnectorInput
): Promise<ConnectorPublicDTO> {
  const { workspaceId, actorId, provider, businessId, tokenExpiresAt } = input;
  assertProvider(provider);

  // Idempotent: return existing active connector for same workspace+provider
  const existing = await db.ownerConnector.findFirst({
    where: { workspaceId, provider },
    select: connectorSelect,
  });
  if (existing) return toPublicDTO(existing as ConnectorRow);

  const row = await db.ownerConnector.create({
    data: {
      workspaceId,
      provider,
      businessId: businessId ?? null,
      status: "PENDING_AUTH",
      tokenExpiresAt: tokenExpiresAt ?? null,
      registeredBy: actorId,
    },
    select: connectorSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.CONNECTOR_REGISTERED,
    entityType: "OwnerConnector",
    entityId: row.id,
    payload: { provider, businessId: businessId ?? null },
  });

  return toPublicDTO(row as ConnectorRow);
}

// ─── Disconnect connector ─────────────────────────────────────────────────────

export interface DisconnectConnectorInput {
  workspaceId: string;
  actorId: string;
  connectorId: string;
}

export async function disconnectConnector(
  input: DisconnectConnectorInput
): Promise<ConnectorPublicDTO> {
  const { workspaceId, actorId, connectorId } = input;

  const existing = await db.ownerConnector.findFirst({
    where: { id: connectorId, workspaceId },
    select: { id: true, provider: true },
  });
  if (!existing) throw new NotFoundError("OwnerConnector", connectorId);

  const row = await db.ownerConnector.update({
    where: { id: connectorId, workspaceId },
    data: { status: "DISCONNECTED", syncFailureMessage: null },
    select: connectorSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.CONNECTOR_DISCONNECTED,
    entityType: "OwnerConnector",
    entityId: connectorId,
    payload: { provider: existing.provider },
  });

  return toPublicDTO(row as ConnectorRow);
}

// ─── Mark refresh failed ──────────────────────────────────────────────────────

export interface MarkRefreshFailedInput {
  workspaceId: string;
  actorId: string;
  connectorId: string;
  failureMessage: string;
}

export async function markConnectorRefreshFailed(
  input: MarkRefreshFailedInput
): Promise<ConnectorPublicDTO> {
  const { workspaceId, actorId, connectorId, failureMessage } = input;

  const existing = await db.ownerConnector.findFirst({
    where: { id: connectorId, workspaceId },
    select: { id: true, provider: true },
  });
  if (!existing) throw new NotFoundError("OwnerConnector", connectorId);

  const row = await db.ownerConnector.update({
    where: { id: connectorId, workspaceId },
    data: { status: "REFRESH_FAILED", syncFailureMessage: failureMessage },
    select: connectorSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.CONNECTOR_REFRESH_FAILED,
    entityType: "OwnerConnector",
    entityId: connectorId,
    payload: { provider: existing.provider, failureMessage },
  });

  return toPublicDTO(row as ConnectorRow);
}

// ─── List connectors ──────────────────────────────────────────────────────────

export async function listConnectors(input: {
  workspaceId: string;
  status?: ConnectorStatus;
}): Promise<ConnectorPublicDTO[]> {
  const rows = await db.ownerConnector.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.status ? { status: input.status } : {}),
    },
    select: connectorSelect,
    orderBy: { connectedAt: "desc" },
  });
  return (rows as ConnectorRow[]).map(toPublicDTO);
}

// ─── Get connector ────────────────────────────────────────────────────────────

export async function getConnector(input: {
  workspaceId: string;
  connectorId: string;
}): Promise<ConnectorPublicDTO> {
  const row = await db.ownerConnector.findFirst({
    where: { id: input.connectorId, workspaceId: input.workspaceId },
    select: connectorSelect,
  });
  if (!row) throw new NotFoundError("OwnerConnector", input.connectorId);
  return toPublicDTO(row as ConnectorRow);
}

// ─── Get connector health ─────────────────────────────────────────────────────

export async function getConnectorHealth(input: {
  workspaceId: string;
  connectorId: string;
}): Promise<ConnectorHealthReport> {
  const row = await db.ownerConnector.findFirst({
    where: { id: input.connectorId, workspaceId: input.workspaceId },
    select: connectorSelect,
  });
  if (!row) throw new NotFoundError("OwnerConnector", input.connectorId);

  const r = row as ConnectorRow;
  const status = r.status as ConnectorStatus;
  const severity = deriveConnectorHealthSeverity(status, r.lastSyncAt, r.syncFailureMessage);
  const issues = buildConnectorHealthIssues(
    status,
    r.lastSyncAt,
    r.syncFailureMessage,
    r.tokenExpiresAt
  );

  return {
    connectorId: r.id,
    workspaceId: r.workspaceId,
    provider: r.provider as ConnectorProvider,
    severity,
    issues,
  };
}

// ─── Activate connector (after OAuth completes) ───────────────────────────────

export interface ActivateConnectorInput {
  workspaceId: string;
  actorId: string;
  connectorId: string;
  tokenExpiresAt?: Date;
}

export async function activateConnector(
  input: ActivateConnectorInput
): Promise<ConnectorPublicDTO> {
  const { workspaceId, actorId, connectorId, tokenExpiresAt } = input;

  const existing = await db.ownerConnector.findFirst({
    where: { id: connectorId, workspaceId },
    select: { id: true, provider: true },
  });
  if (!existing) throw new NotFoundError("OwnerConnector", connectorId);

  const row = await db.ownerConnector.update({
    where: { id: connectorId, workspaceId },
    data: {
      status: "ACTIVE",
      syncFailureMessage: null,
      connectedAt: new Date(),
      tokenExpiresAt: tokenExpiresAt ?? null,
    },
    select: connectorSelect,
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.CONNECTOR_TOKEN_REFRESHED,
    entityType: "OwnerConnector",
    entityId: connectorId,
    payload: { provider: existing.provider },
  });

  return toPublicDTO(row as ConnectorRow);
}
