import { describe, it, expect } from "vitest";
import {
  SUPPORTED_QBO_READ_ENTITIES, QBO_SYNC_QUERY_ENTITIES, QBO_SYNC_REPORTS, QboManualSyncRequestSchema, QboStatusQuerySchema,
  computeSyncBackoffMs, isTerminalSyncFailure, completeMonthPeriods, chooseSyncMode, incrementalLowerBound, syncIdempotencyKey,
  syncFailureFromError, toQboInstant, scheduleBucket, QBO_SYNC_WATERMARK_OVERLAP_MS, QBO_SYNC_FULL_RECONCILE_MS, QBO_SYNC_FAILURE_CODES,
} from "@/domain/quickbooks/qbo-sync-model";
import { evaluateDueGate } from "@/domain/quickbooks/qbo-sync-model";
import { mapSyncOutcome } from "@/domain/quickbooks/qbo-sync-outcomes";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import { QBO_READABLE_ENTITIES, QBO_REPORT_NAMES, buildQboQuery } from "@/domain/quickbooks/qbo-read-catalog";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("sync scope", () => {
  it("SUPPORTED_QBO_READ_ENTITIES is the exact documented list and stays inside the read-only catalog", () => {
    expect(SUPPORTED_QBO_READ_ENTITIES).toEqual(["CompanyInfo", "Customer", "Invoice", "Bill", "ProfitAndLoss(report)", "BalanceSheet(report)", "AgedReceivables(report)", "AgedPayables(report)"]);
    for (const e of QBO_SYNC_QUERY_ENTITIES) expect(QBO_READABLE_ENTITIES as readonly string[]).toContain(e);
    for (const r of QBO_SYNC_REPORTS) expect(QBO_REPORT_NAMES as readonly string[]).toContain(r);
  });
  it("the incremental query it builds is a plain structured SELECT with the watermark window", () => {
    const q = buildQboQuery({
      entity: "Invoice",
      where: [{ field: "MetaData.LastUpdatedTime", op: ">=", value: toQboInstant(new Date("2026-10-01T10:20:30.999Z")) }, { field: "MetaData.LastUpdatedTime", op: "<=", value: toQboInstant(new Date("2026-10-02T00:00:00Z")) }],
      orderBy: { field: "MetaData.LastUpdatedTime", direction: "ASC" }, startPosition: 1001, maxResults: 1000,
    });
    expect(q).toBe("SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime >= '2026-10-01T10:20:30+00:00' AND MetaData.LastUpdatedTime <= '2026-10-02T00:00:00+00:00' ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1001 MAXRESULTS 1000");
  });
});

describe("manual request contract", () => {
  it("accepts exactly businessId, connectionId and an optional requestId", () => {
    expect(QboManualSyncRequestSchema.safeParse({ businessId: UUID, connectionId: UUID }).success).toBe(true);
    expect(QboManualSyncRequestSchema.safeParse({ businessId: UUID, connectionId: UUID, requestId: UUID }).success).toBe(true);
  });
  it.each(["accessToken", "refreshToken", "realmId", "environment", "apiBaseUrl", "baseUrl", "workspaceId", "actorId", "mode", "force"])("rejects a %s field (server-controlled)", (k) => {
    expect(QboManualSyncRequestSchema.safeParse({ businessId: UUID, connectionId: UUID, [k]: "x" }).success).toBe(false);
  });
  it("requires explicit uuids", () => {
    expect(QboManualSyncRequestSchema.safeParse({ businessId: "nope", connectionId: UUID }).success).toBe(false);
    expect(QboManualSyncRequestSchema.safeParse({ connectionId: UUID }).success).toBe(false);
    expect(QboStatusQuerySchema.safeParse({ businessId: UUID, realmId: "1" }).success).toBe(false);
  });
});

describe("back-off", () => {
  it("terminal failures are never retried", () => {
    for (const c of ["REAUTH_REQUIRED", "CONNECTION_NOT_ACTIVE", "CONFIGURATION_UNAVAILABLE", "ENVIRONMENT_MISMATCH", "CONNECTION_NOT_FOUND"] as const) {
      expect(isTerminalSyncFailure(c)).toBe(true);
      expect(computeSyncBackoffMs(c, 1)).toBeNull();
    }
  });
  it("transient failures back off 15m doubling to a 6h ceiling", () => {
    const m = (n: number) => computeSyncBackoffMs("PROVIDER_UNAVAILABLE", n) as number;
    expect([1, 2, 3, 4, 5, 6, 12, 50].map(m)).toEqual([15, 30, 60, 120, 240, 360, 360, 360].map((x) => x * 60_000));
  });
  it("a company mismatch is persistent (24h ceiling), not terminal: it is re-checked daily, never hot-looped", () => {
    expect(isTerminalSyncFailure("COMPANY_MISMATCH")).toBe(false);
    expect([1, 2, 3, 9].map((n) => computeSyncBackoffMs("COMPANY_MISMATCH", n))).toEqual([6, 12, 23, 23].map((x) => x * 3_600_000));
  });
  it("persistent non-auth failures back off 6h doubling to a 23h ceiling (never a whole skipped day)", () => {
    const m = (n: number) => computeSyncBackoffMs("PROVIDER_MALFORMED", n) as number;
    expect([1, 2, 3, 9].map(m)).toEqual([6, 12, 23, 23].map((x) => x * 3_600_000));
  });
  it("honours Retry-After but never beyond the ceiling", () => {
    expect(computeSyncBackoffMs("PROVIDER_RATE_LIMITED", 1, 3_600_000)).toBe(3_600_000);
    expect(computeSyncBackoffMs("PROVIDER_RATE_LIMITED", 1, 99 * 3_600_000)).toBe(6 * 3_600_000);
    expect(computeSyncBackoffMs("PROVIDER_RATE_LIMITED", 1, -5)).toBe(15 * 60_000);
  });
});

describe("planning helpers", () => {
  it("completeMonthPeriods returns the last complete UTC months, oldest first", () => {
    expect(completeMonthPeriods(new Date("2026-10-10T03:00:00Z"), 3)).toEqual([
      { start: "2026-07-01", end: "2026-07-31" }, { start: "2026-08-01", end: "2026-08-31" }, { start: "2026-09-01", end: "2026-09-30" },
    ]);
    expect(completeMonthPeriods(new Date("2026-01-05T00:00:00Z"), 2)).toEqual([{ start: "2025-11-01", end: "2025-11-30" }, { start: "2025-12-01", end: "2025-12-31" }]);
    expect(completeMonthPeriods(new Date("2024-03-01T00:00:00Z"), 1)).toEqual([{ start: "2024-02-01", end: "2024-02-29" }]);
  });
  it("chooses FULL for a first run, a missing watermark or an overdue reconcile; otherwise INCREMENTAL", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const wm = { Customer: now, Invoice: now, Bill: now };
    expect(chooseSyncMode({ now, watermarks: {}, lastFullSyncAt: null })).toBe("FULL");
    expect(chooseSyncMode({ now, watermarks: { Customer: now }, lastFullSyncAt: now })).toBe("FULL");
    expect(chooseSyncMode({ now, watermarks: wm, lastFullSyncAt: new Date(now.getTime() - QBO_SYNC_FULL_RECONCILE_MS) })).toBe("FULL");
    expect(chooseSyncMode({ now, watermarks: wm, lastFullSyncAt: new Date(now.getTime() - 3_600_000) })).toBe("INCREMENTAL");
  });
  it("incremental window starts before the watermark by the overlap; FULL has no lower bound", () => {
    const wm = new Date("2026-10-10T12:00:00Z");
    expect(incrementalLowerBound("INCREMENTAL", wm)?.getTime()).toBe(wm.getTime() - QBO_SYNC_WATERMARK_OVERLAP_MS);
    expect(incrementalLowerBound("FULL", wm)).toBeNull();
    expect(incrementalLowerBound("INCREMENTAL", undefined)).toBeNull();
  });
  it("idempotency keys: manual replays by request id, scheduled/webhook are bucketed per lease epoch", () => {
    const now = new Date("2026-10-10T03:07:00Z");
    expect(syncIdempotencyKey("MANUAL", now, UUID, 0, () => "r")).toBe(`manual:${UUID}`);
    expect(syncIdempotencyKey("MANUAL", now, null, 0, () => "r")).toBe("manual:r");
    expect(syncIdempotencyKey("SCHEDULED", now, null, 0, () => "r")).toBe("scheduled:2026-10-10:0");
    expect(syncIdempotencyKey("SCHEDULED", now, null, 2, () => "r")).toBe("scheduled:2026-10-10:2");
    expect(syncIdempotencyKey("WEBHOOK", now, null, 0, () => "r")).toBe(syncIdempotencyKey("WEBHOOK", new Date(now.getTime() + 60_000), null, 0, () => "x"));
    expect(scheduleBucket(now)).toBe("2026-10-10");
  });
});

describe("failure mapping and public outcomes", () => {
  it("maps provider error kinds to the closed vocabulary", () => {
    const m = (kind: ConstructorParameters<typeof QboProviderError>[0]["kind"], extra = {}) => syncFailureFromError(new QboProviderError({ kind, ...extra })).code;
    expect(m("REFRESH_INVALID")).toBe("REAUTH_REQUIRED");
    expect(m("AUTH_EXPIRED", { httpStatus: 401 })).toBe("REAUTH_REQUIRED");
    expect(m("FORBIDDEN")).toBe("PROVIDER_FORBIDDEN");
    expect(m("RATE_LIMITED")).toBe("PROVIDER_RATE_LIMITED");
    expect(m("TRANSIENT_PROVIDER_FAILURE")).toBe("PROVIDER_UNAVAILABLE");
    expect(m("TIMEOUT")).toBe("PROVIDER_TIMEOUT");
    expect(m("MALFORMED_RESPONSE")).toBe("PROVIDER_MALFORMED");
    expect(m("BAD_REQUEST")).toBe("PROVIDER_REJECTED");
    expect(syncFailureFromError(new Error("secret-token-xyz"))).toEqual({ code: "INTERNAL_ERROR", retryAfterMs: null });
    expect(syncFailureFromError(new QboProviderError({ kind: "RATE_LIMITED", retryAfterMs: 7000 })).retryAfterMs).toBe(7000);
  });
  it("every failure code has a fixed public sentence and no dynamic content", () => {
    for (const code of QBO_SYNC_FAILURE_CODES) {
      const m = mapSyncOutcome({ status: "FAILED", runId: null, code, terminal: isTerminalSyncFailure(code), nextAttemptNotBefore: null });
      expect(m.httpStatus).toBeGreaterThanOrEqual(400);
      expect(m.body.message).toBeTruthy();
      expect(m.body.message).not.toMatch(/\$\{|undefined|token|secret|realm|workspace/i);
      expect(Object.keys(m.body).sort()).toEqual(["code", "message", "nextAttemptNotBefore", "retry", "status"]);
    }
  });
  it("BUSY is 409; only a SUCCEEDED replay is 200 (a failed/running/abandoned replay must not look like success); success carries counts only", () => {
    expect(mapSyncOutcome({ status: "BUSY", runId: UUID, leaseExpiresAt: new Date() }).httpStatus).toBe(409);
    expect(mapSyncOutcome({ status: "ALREADY_COMPLETED", runId: UUID, runStatus: "SUCCEEDED" }).httpStatus).toBe(200);
    for (const runStatus of ["FAILED", "RUNNING", "ABANDONED"] as const) {
      const m = mapSyncOutcome({ status: "ALREADY_COMPLETED", runId: UUID, runStatus });
      expect(m.httpStatus).toBe(409);
      expect(m.body.runStatus).toBe(runStatus);
      expect(m.body.message).toBeTruthy();
    }
    const ok = mapSyncOutcome({ status: "SUCCEEDED", runId: UUID, mode: "FULL", changed: true, counts: { fetched: { Invoice: 3 }, inserted: 3, updated: 0, unchanged: 0, skipped: 0, reportsStored: 8, reportsChanged: 8, reportsFailed: 0, pages: 4, tieBucketsClosed: 0, verifiedByRead: 0, unresolved: 0 } });
    expect(ok.body.summary).toEqual({ inserted: 3, updated: 0, unchanged: 0, skipped: 0, reportsStored: 8, reportsChanged: 8, pages: 4, unresolved: 0 });
  });
});

describe("due gate (pure)", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const st = (o: Partial<Parameters<typeof evaluateDueGate>[1] & object> = {}) => ({ lastAttemptedAt: null, lastSucceededAt: null, nextAttemptNotBefore: null, webhookHintAt: null, ...o });
  it("MANUAL: spaced by the cooldown only; back-off does not apply", () => {
    expect(evaluateDueGate("MANUAL", st({ lastAttemptedAt: new Date(now.getTime() - 10_000) }), now, 60_000)).toEqual(new Date(now.getTime() + 50_000));
    expect(evaluateDueGate("MANUAL", st({ lastAttemptedAt: new Date(now.getTime() - 61_000), nextAttemptNotBefore: new Date(now.getTime() + 1e9) }), now, 60_000)).toBeNull();
    expect(evaluateDueGate("MANUAL", st({ lastAttemptedAt: now }), now, 0)).toBeNull();
    expect(evaluateDueGate("MANUAL", null, now, 60_000)).toBeNull();
  });
  it("SCHEDULED: back-off wins; one success per UTC day unless an unserved webhook hint exists", () => {
    const later = new Date(now.getTime() + 3_600_000);
    expect(evaluateDueGate("SCHEDULED", st({ nextAttemptNotBefore: later }), now, 0)).toEqual(later);
    const done = st({ lastSucceededAt: new Date("2026-10-10T03:00:00Z") });
    expect(evaluateDueGate("SCHEDULED", done, now, 0)).toEqual(new Date("2026-10-11T00:00:00Z"));
    expect(evaluateDueGate("SCHEDULED", { ...done, webhookHintAt: now }, now, 0)).toBeNull();
    expect(evaluateDueGate("SCHEDULED", st({ lastSucceededAt: new Date("2026-10-09T03:00:00Z") }), now, 0)).toBeNull();
  });
  it("an unfinished sync (continuationPending) is due for SCHEDULED/WEBHOOK even if a success happened today, but never overrides back-off", () => {
    const done = st({ lastSucceededAt: new Date("2026-10-10T03:00:00Z"), continuationPending: true });
    expect(evaluateDueGate("SCHEDULED", done, now, 0)).toBeNull();
    expect(evaluateDueGate("WEBHOOK", { ...done, webhookHintAt: null }, now, 0)).toBeNull();
    const later = new Date(now.getTime() + 1000);
    expect(evaluateDueGate("SCHEDULED", { ...done, nextAttemptNotBefore: later }, now, 0)).toEqual(later);
  });
  it("WEBHOOK: runs only for an unserved hint, and still respects back-off", () => {
    expect(evaluateDueGate("WEBHOOK", st(), now, 0)).toEqual(now);
    expect(evaluateDueGate("WEBHOOK", null, now, 0)).toEqual(now);
    expect(evaluateDueGate("WEBHOOK", st({ webhookHintAt: now }), now, 0)).toBeNull();
    const later = new Date(now.getTime() + 1000);
    expect(evaluateDueGate("WEBHOOK", st({ webhookHintAt: now, nextAttemptNotBefore: later }), now, 0)).toEqual(later);
  });
});

describe("continuation checkpoint and CONTINUING outcome", () => {
  const cp = { v: 1, syncId: UUID, mode: "FULL", cutoff: "2026-10-10T03:00:00.000Z", entityIndex: 1, cursor: "2026-09-01T00:00:00.000Z", tie: { second: "2026-09-15T10:00:00.000Z", offset: 20, stalledPasses: 0, lastSeen: 20, total: 47, verify: { round: 1, after: "130", matched: 12, total: 47 } }, reconciled: ["Customer"], seq: 5, changed: false, restart: false };
  it("round-trips a valid checkpoint and treats anything unreadable as ABSENT (restart cleanly, never trust garbage)", async () => {
    const { parseContinuation } = await import("@/domain/quickbooks/qbo-sync-model");
    expect(parseContinuation(cp)).toEqual(cp);
    expect(parseContinuation(null)).toBeNull();
    expect(parseContinuation({ ...cp, v: 2 })).toBeNull();
    expect(parseContinuation({ ...cp, entityIndex: 99 })).toBeNull();
    expect(parseContinuation({ ...cp, cutoff: "yesterday" })).toBeNull();
    expect(parseContinuation({ ...cp, tie: { second: "2026-09-15T10:00:00.000Z" } })).toBeNull();
  });
  it("floorSecond drops sub-second precision only", async () => {
    const { floorSecond } = await import("@/domain/quickbooks/qbo-sync-model");
    expect(floorSecond(new Date("2026-10-10T03:00:00.999Z")).toISOString()).toBe("2026-10-10T03:00:00.000Z");
  });
  it("CONTINUING maps to HTTP 202 (accepted, not failed) with counts only", () => {
    const counts = { fetched: {}, inserted: 5, updated: 0, unchanged: 0, skipped: 0, reportsStored: 0, reportsChanged: 0, reportsFailed: 0, pages: 3, tieBucketsClosed: 0, verifiedByRead: 0, unresolved: 0 };
    const m = mapSyncOutcome({ status: "CONTINUING", runId: UUID, mode: "FULL", changed: true, counts, continuationKey: `${UUID}:4:2` });
    expect(m.httpStatus).toBe(202);
    expect(m.body.status).toBe("CONTINUING");
    expect(m.body.retry).toBe("LATER");
    expect(JSON.stringify(m.body)).not.toMatch(/checkpoint|cursor|cutoff|syncId/i);
  });
  it("replaying a PARTIAL run's request id is an accepted, still-continuing sync - not a failure", () => {
    const m = mapSyncOutcome({ status: "ALREADY_COMPLETED", runId: UUID, runStatus: "PARTIAL" });
    expect(m.httpStatus).toBe(202);
    expect(m.body.retry).toBe("LATER");
  });
  it("PROVIDER_INCOMPLETE is a retryable, non-terminal failure", () => {
    expect(isTerminalSyncFailure("PROVIDER_INCOMPLETE")).toBe(false);
    expect(mapSyncOutcome({ status: "FAILED", runId: null, code: "PROVIDER_INCOMPLETE", terminal: false, nextAttemptNotBefore: null }).httpStatus).toBe(502);
  });
});
