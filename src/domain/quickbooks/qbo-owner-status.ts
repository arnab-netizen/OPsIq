/**
 * QuickBooks Online V1 — owner-facing connection state (pure).
 *
 * Maps persisted facts (connection status, sync state, clock) to ONE truthful owner state plus bounded wording. Nothing here
 * invents status: "connected" means an ACTIVE connection, "fresh" means a recorded successful sync inside the freshness
 * window, and an error is shown only when the sync state records one. Provider bodies and codes never reach the owner —
 * only the closed set of texts below.
 */
import { QBO_STALE_AFTER_HOURS, freshnessOf, type QboFreshness } from "./qbo-report-model";

export const QBO_OWNER_STATES = [
  "NOT_CONNECTED",
  "CONNECTING",
  "IMPORTING",
  "CONNECTED",
  "STALE",
  "SYNC_ERROR",
  "REAUTH_REQUIRED",
  "DISCONNECTED",
] as const;
export type QboOwnerState = (typeof QBO_OWNER_STATES)[number];

export interface QboStatusFacts {
  connection: {
    status: "ACTIVE" | "REAUTH_REQUIRED" | "ERROR" | "DISCONNECTED";
  } | null;
  sync: {
    lifecycle: "NEVER_SYNCED" | "BASELINING" | "SYNCED" | "FAILING";
    lastSuccessAt: Date | null;
    lastErrorCode: string | null;
    consecutiveFailures: number;
  } | null;
  now: Date;
}

export function deriveQboOwnerState(f: QboStatusFacts): { state: QboOwnerState; freshness: QboFreshness } {
  const freshness = freshnessOf(f.sync?.lastSuccessAt ?? null, f.now);
  if (!f.connection) return { state: "NOT_CONNECTED", freshness };
  switch (f.connection.status) {
    case "DISCONNECTED": return { state: "DISCONNECTED", freshness };
    case "REAUTH_REQUIRED": return { state: "REAUTH_REQUIRED", freshness };
    case "ERROR": return { state: "SYNC_ERROR", freshness };
    case "ACTIVE": break;
  }
  const s = f.sync;
  if (!s || (s.lifecycle === "NEVER_SYNCED" && s.lastSuccessAt === null && s.consecutiveFailures === 0)) return { state: "CONNECTING", freshness };
  if (s.consecutiveFailures > 0 || s.lifecycle === "FAILING") return { state: "SYNC_ERROR", freshness };
  if (s.lifecycle === "BASELINING") return { state: "IMPORTING", freshness };
  if (freshness === "STALE") return { state: "STALE", freshness };
  return { state: "CONNECTED", freshness };
}

/** Owner-safe wording for the bounded failure codes the sync records. Unknown codes get the generic sentence. */
export function ownerFailureText(code: string | null): string | null {
  if (!code) return null;
  if (code === "REAUTH_REQUIRED") return "QuickBooks needs you to sign in again.";
  if (code === "RATE_LIMITED" || code === "TRANSIENT_PROVIDER_FAILURE" || code === "TIMEOUT") return "QuickBooks was unavailable. OpsIQ will try again automatically.";
  if (code.startsWith("REPORT_")) return "QuickBooks returned data in a form OpsIQ could not read safely, so nothing was imported. OpsIQ will try again.";
  if (code === "CONFIGURATION_UNAVAILABLE" || code === "CONFIGURATION_ERROR") return "QuickBooks is not set up correctly for this OpsIQ installation.";
  if (code === "NOT_FOUND" || code === "BAD_REQUEST" || code === "MALFORMED_RESPONSE") return "QuickBooks could not provide this company's reports. OpsIQ will try again.";
  return "The last QuickBooks refresh did not complete. OpsIQ will try again.";
}

export const QBO_STALE_NOTICE = `Your QuickBooks figures were last refreshed more than ${QBO_STALE_AFTER_HOURS} hours ago, so they may not reflect your latest books.`;

/** Which actions the owner may take in each state (the UI renders buttons from this; it holds no rules of its own). */
export function ownerActionsFor(state: QboOwnerState): { connect: boolean; reconnect: boolean; disconnect: boolean; refresh: boolean } {
  switch (state) {
    case "NOT_CONNECTED":
    case "DISCONNECTED": return { connect: true, reconnect: false, disconnect: false, refresh: false };
    case "REAUTH_REQUIRED": return { connect: false, reconnect: true, disconnect: true, refresh: false };
    case "CONNECTING":
    case "IMPORTING": return { connect: false, reconnect: false, disconnect: true, refresh: false };
    case "CONNECTED":
    case "STALE":
    case "SYNC_ERROR": return { connect: false, reconnect: false, disconnect: true, refresh: true };
  }
}
