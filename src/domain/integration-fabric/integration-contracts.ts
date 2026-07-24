/**
 * Bundle 5.1 — Integration Fabric Contracts
 *
 * Defines:
 * - ConnectorPublicDTO (no token values — tokens never leave the server)
 * - Integration event Zod schemas (validated before any processing)
 * - Event → BCP trigger mapping (pure function, no DB)
 * - Connector health status contracts
 *
 * No DB access. Pure data contracts and domain logic.
 */

import { z } from "zod";

// ─── Connector type constants ─────────────────────────────────────────────────

export const CONNECTOR_PROVIDERS = [
  "HUBSPOT",
  "QUICKBOOKS",
  "GOOGLE_SHEETS",
  "SLACK",
  "XERO",
  "SALESFORCE",
  "PIPEDRIVE",
  "SHOPIFY",
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export const CONNECTOR_STATUSES = [
  "ACTIVE",
  "DISCONNECTED",
  "EXPIRED",
  "REFRESH_FAILED",
  "PENDING_AUTH",
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

// ─── Connector public DTO ─────────────────────────────────────────────────────
// Token fields are NEVER included. This is enforced by the type — not by runtime filtering.

export interface ConnectorPublicDTO {
  id: string;
  workspaceId: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  connectedAt: string;
  lastSyncAt: string | null;
  lastSyncRecords: number | null;
  tokenExpiresAt: string | null;
  syncFailureMessage: string | null;
  createdAt: string;
  // accessToken: NEVER PRESENT
  // refreshToken: NEVER PRESENT
  // encryptedAccessToken: NEVER PRESENT
}

// ─── Integration event kinds ──────────────────────────────────────────────────

export const INTEGRATION_EVENT_KINDS = [
  "CRM_DEAL_UPDATED",
  "CRM_CONTACT_UPDATED",
  "ACCOUNTING_REVENUE_UPDATED",
  "ACCOUNTING_EXPENSE_UPDATED",
  "ACCOUNTING_PL_SYNCED",
  "COMMUNICATION_CHANNEL_CONNECTED",
  "COMMUNICATION_CHANNEL_DISCONNECTED",
  "SHEET_DATA_SYNCED",
  "CONNECTOR_SYNC_COMPLETED",
  "CONNECTOR_SYNC_FAILED",
] as const;

export type IntegrationEventKind = (typeof INTEGRATION_EVENT_KINDS)[number];

// ─── Integration event Zod schema ─────────────────────────────────────────────

export const IntegrationEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  connectorId: z.string().uuid(),
  provider: z.enum(CONNECTOR_PROVIDERS),
  kind: z.enum(INTEGRATION_EVENT_KINDS),
  businessId: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
});

export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;

// ─── BCP trigger mapping ──────────────────────────────────────────────────────
// Pure function: integration event kind → BCP trigger type.
// Returns null when the event does not warrant a BCP re-evaluation.

export type BcpTriggerType =
  | "EVIDENCE_UPDATE"
  | "KPI_CHANGE"
  | "BLOCKER_EVENT"
  | "SHOCK_EVENT"
  | "SIGNAL_REASSESSMENT";

export interface BcpTriggerMapping {
  triggerType: BcpTriggerType;
  triggerDescription: string;
}

export function mapIntegrationEventToBcpTrigger(
  kind: IntegrationEventKind
): BcpTriggerMapping | null {
  switch (kind) {
    case "ACCOUNTING_REVENUE_UPDATED":
      return {
        triggerType: "KPI_CHANGE",
        triggerDescription: "Accounting revenue data updated via connector sync",
      };
    case "ACCOUNTING_EXPENSE_UPDATED":
      return {
        triggerType: "KPI_CHANGE",
        triggerDescription: "Accounting expense data updated via connector sync",
      };
    case "ACCOUNTING_PL_SYNCED":
      return {
        triggerType: "KPI_CHANGE",
        triggerDescription: "Profit & Loss statement synced from accounting connector",
      };
    case "CRM_DEAL_UPDATED":
      return {
        triggerType: "EVIDENCE_UPDATE",
        triggerDescription: "CRM deal pipeline updated via connector sync",
      };
    case "CRM_CONTACT_UPDATED":
      return {
        triggerType: "EVIDENCE_UPDATE",
        triggerDescription: "CRM contact data updated via connector sync",
      };
    case "CONNECTOR_SYNC_FAILED":
      return {
        triggerType: "BLOCKER_EVENT",
        triggerDescription: "Connector sync failed — data freshness may be impacted",
      };
    case "SHEET_DATA_SYNCED":
      return {
        triggerType: "EVIDENCE_UPDATE",
        triggerDescription: "Google Sheets data synced via connector",
      };
    // These events do not warrant BCP re-evaluation
    case "COMMUNICATION_CHANNEL_CONNECTED":
    case "COMMUNICATION_CHANNEL_DISCONNECTED":
    case "CONNECTOR_SYNC_COMPLETED":
      return null;
  }
}

// ─── Connector health severity ────────────────────────────────────────────────

export type ConnectorHealthSeverity = "OK" | "WARNING" | "CRITICAL";

export interface ConnectorHealthReport {
  connectorId: string;
  workspaceId: string;
  provider: ConnectorProvider;
  severity: ConnectorHealthSeverity;
  issues: ConnectorHealthIssue[];
}

export interface ConnectorHealthIssue {
  code: ConnectorHealthIssueCode;
  message: string;
}

export type ConnectorHealthIssueCode =
  | "TOKEN_EXPIRED"
  | "REFRESH_FAILED"
  | "SYNC_STALE"       // last sync > 24h ago
  | "SYNC_ERROR"       // last sync had error
  | "NOT_CONNECTED";   // never connected

export function deriveConnectorHealthSeverity(
  status: ConnectorStatus,
  lastSyncAt: Date | null,
  syncFailureMessage: string | null
): ConnectorHealthReport["severity"] {
  if (status === "DISCONNECTED" || status === "REFRESH_FAILED") return "CRITICAL";
  if (status === "EXPIRED") return "WARNING";
  if (syncFailureMessage) return "WARNING";
  if (lastSyncAt) {
    const hoursSinceSync = (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > 24) return "WARNING";
  }
  return "OK";
}

export function buildConnectorHealthIssues(
  status: ConnectorStatus,
  lastSyncAt: Date | null,
  syncFailureMessage: string | null,
  tokenExpiresAt: Date | null
): ConnectorHealthIssue[] {
  const issues: ConnectorHealthIssue[] = [];

  if (status === "PENDING_AUTH" || status === "DISCONNECTED") {
    issues.push({ code: "NOT_CONNECTED", message: "Connector is not authenticated." });
    return issues;
  }

  if (status === "REFRESH_FAILED") {
    issues.push({ code: "REFRESH_FAILED", message: "OAuth token refresh failed. Re-authentication required." });
  }

  if (status === "EXPIRED" || (tokenExpiresAt && tokenExpiresAt < new Date())) {
    issues.push({ code: "TOKEN_EXPIRED", message: "OAuth token has expired. Re-authentication required." });
  }

  if (syncFailureMessage) {
    issues.push({ code: "SYNC_ERROR", message: syncFailureMessage });
  }

  if (lastSyncAt) {
    const hoursSinceSync = (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > 24) {
      issues.push({ code: "SYNC_STALE", message: `Last sync was ${Math.floor(hoursSinceSync)} hours ago.` });
    }
  }

  return issues;
}

// ─── Token field guard ────────────────────────────────────────────────────────
// Utility to verify at the type level that no token fields are in a DTO.
// Used in DTO construction to make accidental token inclusion a compile error.

export type NoTokenFields<T> = T extends {
  accessToken?: unknown;
  refreshToken?: unknown;
  encryptedAccessToken?: unknown;
  encryptedRefreshToken?: unknown;
}
  ? never
  : T;

export function assertNoTokenFields<T>(dto: NoTokenFields<T>): NoTokenFields<T> {
  return dto;
}
