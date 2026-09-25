import { describe, expect, it, vi } from "vitest";
import { createQboClient, type QboFetch } from "@/services/quickbooks/qbo-client";
import { isQboApiError, type QboConnectionCredentials, type QboTokenProvider } from "@/domain/quickbooks/qbo-contracts";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } as Headers,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeTokenProvider(overrides: Partial<QboTokenProvider> = {}): QboTokenProvider & { forceRefreshCalls: string[] } {
  const forceRefreshCalls: string[] = [];
  return {
    forceRefreshCalls,
    getCredentials: vi.fn(async (): Promise<QboConnectionCredentials> => ({
      accessToken: "token-1",
      realmId: "123456789",
      environment: "sandbox",
    })),
    forceRefresh: vi.fn(async (rejected: string): Promise<QboConnectionCredentials> => {
      forceRefreshCalls.push(rejected);
      return { accessToken: "token-2", realmId: "123456789", environment: "sandbox" };
    }),
    ...overrides,
  };
}

const noopSleep = async () => {};

describe("createQboClient — read", () => {
  it("reads an entity and builds the correct URL", async () => {
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      expect(url).toContain("/v3/company/123456789/customer/42");
      expect(url).toContain("minorversion=75");
      return jsonResponse(200, { Customer: { Id: "42", DisplayName: "Acme" }, time: "2026-01-01" });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    const result = await client.read("Customer", "42");
    expect(result).toEqual({ Id: "42", DisplayName: "Acme" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends Authorization and Accept headers", async () => {
    const fetchImpl = vi.fn<QboFetch>(async (_url, init) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
      expect((init.headers as Record<string, string>).Accept).toBe("application/json");
      return jsonResponse(200, { Customer: { Id: "42" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.read("Customer", "42");
  });

  it("rejects an invalid entity id without any network call", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.read("Customer", "not-numeric")).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws MALFORMED when the entity key is missing from the response", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { time: "x" }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.read("Customer", "1")).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("reads companyInfo and preferences from their dedicated endpoints", async () => {
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      if (url.includes("/companyinfo/")) return jsonResponse(200, { CompanyInfo: { CompanyName: "Acme" } });
      if (url.includes("/preferences")) return jsonResponse(200, { Preferences: { EmailMessagesPrefs: {} } });
      throw new Error("unexpected url " + url);
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    expect(await client.companyInfo()).toEqual({ CompanyName: "Acme" });
    expect(await client.preferences()).toEqual({ EmailMessagesPrefs: {} });
  });
});

describe("createQboClient — query", () => {
  it("builds a SELECT query with pagination and returns a page", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, {
        QueryResponse: { Invoice: [{ Id: "1" }, { Id: "2" }], startPosition: 1, maxResults: 2 },
      });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    const page = await client.query("Invoice", { startPosition: 1, maxResults: 50 });
    expect(page.items).toHaveLength(2);
    expect(page.startPosition).toBe(1);
    expect(page.maxResults).toBe(2);
    expect(decodeURIComponent(capturedUrl.replace(/\+/g, " "))).toContain("SELECT * FROM Invoice STARTPOSITION 1 MAXRESULTS 50");
  });

  it("includes WHERE and ORDERBY clauses", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, { QueryResponse: {} });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.query("Invoice", { where: "TxnDate > '2026-01-01'", orderBy: "TxnDate DESC", startPosition: 1, maxResults: 10 });
    const decoded = decodeURIComponent(capturedUrl.replace(/\+/g, " "));
    expect(decoded).toContain("WHERE TxnDate > '2026-01-01'");
    expect(decoded).toContain("ORDERBY TxnDate DESC");
  });

  it("returns an empty items array when the entity key is absent (no results)", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { QueryResponse: { startPosition: 1, maxResults: 0 } }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    const page = await client.query("Invoice", { startPosition: 1, maxResults: 10 });
    expect(page.items).toEqual([]);
  });

  it("caps maxResults at QBO_QUERY_MAX_RESULTS", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, { QueryResponse: {} });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.query("Invoice", { startPosition: 1, maxResults: 5000 });
    expect(decodeURIComponent(capturedUrl.replace(/\+/g, " "))).toContain("MAXRESULTS 1000");
  });

  it("rejects a WHERE clause with a semicolon without any network call", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.query("Invoice", { where: "Id = '1'; DROP TABLE", startPosition: 1, maxResults: 10 })).rejects.toMatchObject({
      kind: "VALIDATION",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a WHERE clause with a backslash", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.query("Invoice", { where: "Name = 'a\\b'", startPosition: 1, maxResults: 10 })).rejects.toMatchObject({
      kind: "VALIDATION",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a WHERE clause with an unbalanced single quote", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.query("Invoice", { where: "Name = 'unterminated", startPosition: 1, maxResults: 10 })).rejects.toMatchObject({
      kind: "VALIDATION",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createQboClient — cdc", () => {
  it("parses changed and deleted entities, and flags truncation", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () =>
      jsonResponse(200, {
        CDCResponse: [
          {
            QueryResponse: [
              {
                Customer: [
                  { Id: "1", DisplayName: "Acme" },
                  { Id: "2", status: "Deleted", MetaData: { LastUpdatedTime: "2026-01-02T00:00:00Z" } },
                ],
                startPosition: 1,
                maxResults: 2,
              },
            ],
          },
        ],
        time: "2026-01-02T00:00:00Z",
      }),
    );
    const client = await createQboClient({
      tokenProvider: makeTokenProvider(),
      fetchImpl,
      sleep: noopSleep,
      now: () => new Date("2026-01-02T00:00:00Z"),
    });
    const result = await client.cdc(["Customer"], new Date("2026-01-01T00:00:00Z"));
    expect(result.serverTime).toBe("2026-01-02T00:00:00Z");
    expect(result.entities[0].changed).toEqual([{ Id: "1", DisplayName: "Acme" }]);
    expect(result.entities[0].deleted).toEqual([{ Id: "2", lastUpdated: "2026-01-02T00:00:00Z" }]);
    expect(result.entities[0].truncated).toBe(false);
  });

  it("flags truncated when totalCount exceeds the returned item count", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () =>
      jsonResponse(200, {
        CDCResponse: [{ QueryResponse: [{ Invoice: [{ Id: "1" }], startPosition: 1, maxResults: 1, totalCount: 5000 }] }],
      }),
    );
    const client = await createQboClient({
      tokenProvider: makeTokenProvider(),
      fetchImpl,
      sleep: noopSleep,
      now: () => new Date("2026-01-10T00:00:00Z"),
    });
    const result = await client.cdc(["Invoice"], new Date("2026-01-01T00:00:00Z"));
    expect(result.entities[0].truncated).toBe(true);
  });

  it("returns an empty entity result when the entity is absent from the response", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { CDCResponse: [{ QueryResponse: [] }] }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, now: () => new Date("2026-01-05T00:00:00Z") });
    const result = await client.cdc(["Invoice"], new Date("2026-01-01T00:00:00Z"));
    expect(result.entities[0]).toEqual({ entity: "Invoice", changed: [], deleted: [], truncated: false });
  });

  it("rejects a changedSince older than the CDC lookback window without any network call", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const now = new Date("2026-03-01T00:00:00Z");
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, now: () => now });
    const tooOld = new Date("2026-01-01T00:00:00Z");
    await expect(client.cdc(["Invoice"], tooOld)).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createQboClient — report", () => {
  it("returns the raw report JSON object", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { Header: { ReportName: "ProfitAndLoss" }, Rows: { Row: [] } }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    const report = await client.report("ProfitAndLoss", { start_date: "2026-01-01", end_date: "2026-01-31" });
    expect(report.Header).toEqual({ ReportName: "ProfitAndLoss" });
  });
});

describe("createQboClient — create/update", () => {
  it("creates an entity with requestid in the URL", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, { Invoice: { Id: "1", SyncToken: "0" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    const result = await client.create("Invoice", { CustomerRef: { value: "1" } }, { requestId: "req-1" });
    expect(result).toEqual({ Id: "1", SyncToken: "0" });
    expect(capturedUrl).toContain("requestid=req-1");
    expect(capturedUrl).not.toContain("operation=");
  });

  it("rejects an invalid requestId format without any network call", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.create("Invoice", {}, { requestId: "has a space" })).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forces sparse:true on update and requires Id/SyncToken", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn<QboFetch>(async (_url, init) => {
      capturedBody = init.body as string;
      return jsonResponse(200, { Invoice: { Id: "1", SyncToken: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.update("Invoice", { Id: "1", SyncToken: "0", Line: [] }, { requestId: "req-2" });
    const parsed = JSON.parse(capturedBody);
    expect(parsed.sparse).toBe(true);
    expect(parsed.Id).toBe("1");
  });
});

describe("createQboClient — delete", () => {
  it("deletes a transaction entity via POST ?operation=delete", async () => {
    let capturedUrl = "";
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, { Bill: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.delete("Bill", { Id: "1", SyncToken: "0" }, { requestId: "req-3" });
    expect(capturedUrl).toContain("operation=delete");
  });

  it("throws before any network call when deleting a name-list entity (unsupported)", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.delete("Customer", { Id: "1", SyncToken: "0" }, { requestId: "req-4" })).rejects.toMatchObject({
      kind: "VALIDATION",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createQboClient — void", () => {
  it("voids an Invoice via operation=void with a plain {Id,SyncToken} body", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchImpl = vi.fn<QboFetch>(async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return jsonResponse(200, { Invoice: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.void("Invoice", { Id: "1", SyncToken: "0" }, { requestId: "req-5" });
    expect(capturedUrl).toContain("operation=void");
    expect(JSON.parse(capturedBody)).toEqual({ Id: "1", SyncToken: "0" });
  });

  it("voids a Payment via operation=update&include=void with a sparse body", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchImpl = vi.fn<QboFetch>(async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return jsonResponse(200, { Payment: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.void("Payment", { Id: "1", SyncToken: "0" }, { requestId: "req-6" });
    expect(capturedUrl).toContain("operation=update");
    expect(capturedUrl).toContain("include=void");
    expect(JSON.parse(capturedBody)).toEqual({ Id: "1", SyncToken: "0", sparse: true });
  });

  it("throws before any network call when voiding an entity with no void support", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.void("Bill", { Id: "1", SyncToken: "0" }, { requestId: "req-7" })).rejects.toMatchObject({ kind: "VALIDATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createQboClient — inactivate", () => {
  it("sends a sparse update with Active:false", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn<QboFetch>(async (_url, init) => {
      capturedBody = init.body as string;
      return jsonResponse(200, { Customer: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await client.inactivate("Customer", { Id: "1", SyncToken: "0" }, { requestId: "req-8" });
    expect(JSON.parse(capturedBody)).toEqual({ Id: "1", SyncToken: "0", sparse: true, Active: false });
  });
});

describe("createQboClient — 401 handling", () => {
  it("refreshes the token once on 401 and retries with the new token", async () => {
    const tokenProvider = makeTokenProvider();
    let call = 0;
    const fetchImpl = vi.fn<QboFetch>(async (_url, init) => {
      call += 1;
      if (call === 1) {
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
        return jsonResponse(401, { Fault: { type: "AuthenticationFault", Error: [{ Message: "expired" }] } });
      }
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-2");
      return jsonResponse(200, { Customer: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider, fetchImpl, sleep: noopSleep });
    const result = await client.read("Customer", "1");
    expect(result).toEqual({ Id: "1" });
    expect(tokenProvider.forceRefresh).toHaveBeenCalledTimes(1);
    expect(tokenProvider.forceRefreshCalls).toEqual(["token-1"]);
  });

  it("throws AUTH on a second consecutive 401", async () => {
    const tokenProvider = makeTokenProvider();
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(401, { Fault: { type: "AuthenticationFault", Error: [{ Message: "expired" }] } }));
    const client = await createQboClient({ tokenProvider, fetchImpl, sleep: noopSleep });
    await expect(client.read("Customer", "1")).rejects.toMatchObject({ kind: "AUTH" });
    expect(tokenProvider.forceRefresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("createQboClient — retries", () => {
  it("retries reads on TRANSIENT (5xx) up to maxReadRetries using the injected sleep", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetchImpl = vi.fn<QboFetch>(async () => {
      calls += 1;
      if (calls < 3) return jsonResponse(500, {});
      return jsonResponse(200, { Customer: { Id: "1" } });
    });
    const client = await createQboClient({
      tokenProvider: makeTokenProvider(),
      fetchImpl,
      sleep,
      random: () => 0.5,
      maxReadRetries: 3,
    });
    const result = await client.read("Customer", "1");
    expect(result).toEqual({ Id: "1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting maxReadRetries and surfaces the TRANSIENT error", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(503, {}));
    const client = await createQboClient({
      tokenProvider: makeTokenProvider(),
      fetchImpl,
      sleep: noopSleep,
      random: () => 0,
      maxReadRetries: 2,
    });
    await expect(client.read("Customer", "1")).rejects.toMatchObject({ kind: "TRANSIENT" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("honours Retry-After (seconds) as the backoff delay, capped", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetchImpl = vi.fn<QboFetch>(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(429, {}, { "Retry-After": "5" });
      return jsonResponse(200, { Customer: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep, random: () => 0.9 });
    await client.read("Customer", "1");
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("honours Retry-After as an HTTP-date", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const retryAt = new Date(now.getTime() + 8000).toUTCString();
    const fetchImpl = vi.fn<QboFetch>(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(429, {}, { "Retry-After": retryAt });
      return jsonResponse(200, { Customer: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep, now: () => now });
    await client.read("Customer", "1");
    expect(sleep).toHaveBeenCalledWith(8000);
  });

  it("does not retry STALE_OBJECT (5010) failures", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () =>
      jsonResponse(400, { Fault: { type: "ValidationFault", Error: [{ Message: "Stale Object Error", code: "5010" }] } }),
    );
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.update("Invoice", { Id: "1", SyncToken: "0" }, { requestId: "req-9" })).rejects.toMatchObject({
      kind: "STALE_OBJECT",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a write on TRANSIENT using the SAME requestid on every attempt", async () => {
    const requestIds: string[] = [];
    let calls = 0;
    const fetchImpl = vi.fn<QboFetch>(async (url) => {
      calls += 1;
      const parsed = new URL(url);
      requestIds.push(parsed.searchParams.get("requestid")!);
      if (calls < 2) return jsonResponse(503, {});
      return jsonResponse(200, { Invoice: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, maxWriteRetries: 2 });
    await client.create("Invoice", {}, { requestId: "stable-req-id" });
    expect(requestIds).toEqual(["stable-req-id", "stable-req-id"]);
  });

  it("retries a write on RATE_LIMITED (not committed) using the same requestid", async () => {
    let calls = 0;
    const fetchImpl = vi.fn<QboFetch>(async () => {
      calls += 1;
      if (calls < 2) return jsonResponse(429, {});
      return jsonResponse(200, { Invoice: { Id: "1" } });
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, maxWriteRetries: 2 });
    const result = await client.create("Invoice", {}, { requestId: "rate-limited-req" });
    expect(result).toEqual({ Id: "1" });
  });

  it("keeps the ambiguous flag on a write that exhausts its retries after a 5xx", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(500, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, maxWriteRetries: 1 });
    try {
      await client.create("Invoice", {}, { requestId: "ambiguous-req" });
      expect.unreachable();
    } catch (err) {
      expect(isQboApiError(err)).toBe(true);
      if (isQboApiError(err)) expect(err.ambiguous).toBe(true);
    }
  });

  it("classifies a network-level failure before any response as TRANSIENT/TIMEOUT", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep, maxReadRetries: 0 });
    await expect(client.read("Customer", "1")).rejects.toMatchObject({ kind: "TIMEOUT" });
  });
});

describe("createQboClient — malformed responses", () => {
  it("throws MALFORMED when query response has no QueryResponse key", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { NotQueryResponse: {} }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.query("Invoice", { startPosition: 1, maxResults: 10 })).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("throws MALFORMED when cdc response has no CDCResponse key", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, {}));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.cdc(["Invoice"], new Date())).rejects.toMatchObject({ kind: "MALFORMED" });
  });

  it("throws MALFORMED when the JSON body is not an object at all", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, "just a string"));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    await expect(client.read("Customer", "1")).rejects.toMatchObject({ kind: "MALFORMED" });
  });
});

describe("createQboClient — realmId/environment", () => {
  it("exposes realmId and environment fetched once at creation", async () => {
    const fetchImpl = vi.fn<QboFetch>(async () => jsonResponse(200, { Customer: { Id: "1" } }));
    const client = await createQboClient({ tokenProvider: makeTokenProvider(), fetchImpl, sleep: noopSleep });
    expect(client.realmId).toBe("123456789");
    expect(client.environment).toBe("sandbox");
  });
});
