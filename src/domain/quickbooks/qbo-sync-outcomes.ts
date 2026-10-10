/**
 * QuickBooks Online — owner-facing outcomes of a manual sync request (pure: no DB, no network).
 *
 * Every body is built from this table and from the typed outcome only. Provider text, realm ids, tokens, run internals
 * and other tenants' identifiers can never reach it.
 */
import type { QboSyncFailureCode, QboSyncOutcome } from "./qbo-sync-model";

type Retry = "NONE" | "LATER" | "RECONNECT" | "CHECK_CONFIGURATION";

const FAILURE_TABLE: Record<QboSyncFailureCode, { http: number; message: string; retry: Retry }> = {
  CONFIGURATION_UNAVAILABLE: { http: 503, message: "QuickBooks is not available in this OpsIQ deployment.", retry: "CHECK_CONFIGURATION" },
  ENVIRONMENT_MISMATCH: { http: 409, message: "This QuickBooks connection belongs to a different environment than this deployment.", retry: "CHECK_CONFIGURATION" },
  CONNECTION_NOT_FOUND: { http: 404, message: "No QuickBooks connection was found for this business.", retry: "NONE" },
  CONNECTION_NOT_ACTIVE: { http: 409, message: "The QuickBooks connection for this business is not active.", retry: "NONE" },
  REAUTH_REQUIRED: { http: 409, message: "QuickBooks needs to be reconnected before data can be read.", retry: "RECONNECT" },
  PROVIDER_FORBIDDEN: { http: 502, message: "QuickBooks did not allow access to this company's data.", retry: "RECONNECT" },
  PROVIDER_RATE_LIMITED: { http: 503, message: "QuickBooks is receiving too many requests. It will be retried later.", retry: "LATER" },
  PROVIDER_UNAVAILABLE: { http: 502, message: "QuickBooks is temporarily unavailable. It will be retried later.", retry: "LATER" },
  PROVIDER_TIMEOUT: { http: 504, message: "QuickBooks did not respond in time. It will be retried later.", retry: "LATER" },
  PROVIDER_MALFORMED: { http: 502, message: "QuickBooks returned data in an unexpected form. Data already read was kept, the sync position was not advanced past it, and it will retry.", retry: "LATER" },
  PROVIDER_REJECTED: { http: 502, message: "QuickBooks could not process the read request. Data already read was kept and the sync will retry.", retry: "LATER" },
  PROVIDER_INCOMPLETE: { http: 502, message: "QuickBooks data could not be confirmed complete. The sync did not advance past unconfirmed data; it will be retried later.", retry: "LATER" },
  COMPANY_MISMATCH: { http: 409, message: "The QuickBooks company did not match this connection. Nothing was changed.", retry: "RECONNECT" },
  LEASE_LOST: { http: 409, message: "Another QuickBooks sync took over. Nothing was overwritten.", retry: "LATER" },
  CANCELLED: { http: 503, message: "The QuickBooks sync was cancelled. It will be retried later.", retry: "LATER" },
  INTERNAL_ERROR: { http: 500, message: "The QuickBooks sync could not be completed.", retry: "LATER" },
};

export interface PublicSyncBody {
  status: "SUCCEEDED" | "CONTINUING" | "ALREADY_COMPLETED" | "BUSY" | "NOT_DUE" | "FAILED";
  runId?: string;
  mode?: "FULL" | "INCREMENTAL";
  changed?: boolean;
  summary?: { inserted: number; updated: number; unchanged: number; skipped: number; reportsStored: number; reportsChanged: number; pages: number; unresolved: number };
  runStatus?: string;
  code?: QboSyncFailureCode;
  message?: string;
  retry?: Retry;
  nextAttemptNotBefore?: string | null;
}

export function mapSyncOutcome(outcome: QboSyncOutcome): { httpStatus: number; body: PublicSyncBody } {
  switch (outcome.status) {
    case "SUCCEEDED":
    case "CONTINUING": {
      const c = outcome.counts;
      return {
        httpStatus: outcome.status === "SUCCEEDED" ? 200 : 202,
        body: {
          status: outcome.status, runId: outcome.runId, mode: outcome.mode, changed: outcome.changed,
          summary: { inserted: c.inserted, updated: c.updated, unchanged: c.unchanged, skipped: c.skipped, reportsStored: c.reportsStored, reportsChanged: c.reportsChanged, pages: c.pages, unresolved: c.unresolved },
          ...(outcome.status === "CONTINUING" ? { message: "A large QuickBooks sync is partly done and will continue automatically. Nothing has failed.", retry: "LATER" as const } : {}),
        },
      };
    }
    case "ALREADY_COMPLETED":
      // Only a SUCCEEDED run is a successful replay. Anything else must not look like success to a caller that only checks status.
      // A PARTIAL run is a healthy, unfinished sync: replaying its request id must not look like a failure.
      if (outcome.runStatus === "PARTIAL") return { httpStatus: 202, body: { status: "ALREADY_COMPLETED", runId: outcome.runId, runStatus: outcome.runStatus, message: "This request already ran part of a large QuickBooks sync; the rest continues automatically.", retry: "LATER" } };
      if (outcome.runStatus === "SUCCEEDED") return { httpStatus: 200, body: { status: "ALREADY_COMPLETED", runId: outcome.runId, runStatus: outcome.runStatus } };
      return {
        httpStatus: 409,
        body: {
          status: "ALREADY_COMPLETED", runId: outcome.runId, runStatus: outcome.runStatus,
          message: outcome.runStatus === "RUNNING" ? "This request is still running." : "An earlier attempt with this request id did not succeed. Send a new request id to try again.",
          retry: outcome.runStatus === "RUNNING" ? "LATER" : "NONE",
        },
      };
    case "BUSY":
      return {
        httpStatus: 409,
        body: { status: "BUSY", ...(outcome.runId ? { runId: outcome.runId } : {}), message: "A QuickBooks sync is already running for this business.", retry: "LATER" },
      };
    case "NOT_DUE":
      return { httpStatus: 200, body: { status: "NOT_DUE", nextAttemptNotBefore: outcome.nextAttemptNotBefore.toISOString() } };
    case "FAILED": {
      const row = FAILURE_TABLE[outcome.code];
      return {
        httpStatus: row.http,
        body: {
          status: "FAILED", ...(outcome.runId ? { runId: outcome.runId } : {}), code: outcome.code, message: row.message, retry: row.retry,
          nextAttemptNotBefore: outcome.nextAttemptNotBefore ? outcome.nextAttemptNotBefore.toISOString() : null,
        },
      };
    }
  }
}
