/**
 * Google Search Console client — fixture-based tests.
 *
 * Every test injects a `fetchImpl` fixture (same pattern as
 * google-sheets-oauth.service.test.ts) — no test in this file makes, or could make, a live
 * network call. There are no live Google credentials anywhere in this repo.
 */
import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  getAccessToken,
  getSearchConsoleAuthFromEnv,
  computeDataFreshness,
  computeSearchConsoleRowKey,
  searchAnalyticsQuery,
  sitemapsList,
  urlInspect,
  SEARCH_CONSOLE_READONLY_SCOPE,
  GSC_REPORTING_DELAY_DAYS_MAX,
  type SearchConsoleAuth,
  type ServiceAccountKey,
  type FetchLike,
} from "@/lib/integrations/search-console";
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
} from "@/infra/errors";

// ── fetch fixture helper (mirrors google-sheets-oauth.service.test.ts's makeFetch) ──────────
function makeFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): () => Promise<Response> {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: { get: (name: string) => headers[name] ?? null },
    } as unknown as Response);
}

// Generated fresh for this test run — not a real credential, never written to disk, and
// discarded when the process exits. Needed because buildServiceAccountJwt() really signs with
// node:crypto, so the fixture must be a structurally valid RSA private key.
const { privateKey: TEST_PRIVATE_KEY_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const VALID_SA_KEY: ServiceAccountKey = {
  client_email: "gsc-reader@test-project.iam.gserviceaccount.com",
  private_key: TEST_PRIVATE_KEY_PEM,
};

const ACCESS_TOKEN_AUTH: SearchConsoleAuth = { mode: "access_token", accessToken: "ya29.fixture" };

describe("Search Console client — auth", () => {
  it("access_token mode returns the token with no network call", async () => {
    const fetchImpl = vi.fn();
    const result = await getAccessToken(ACCESS_TOKEN_AUTH, fetchImpl as unknown as FetchLike);
    expect(result.accessToken).toBe("ya29.fixture");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("access_token mode rejects an empty token", async () => {
    await expect(
      getAccessToken({ mode: "access_token", accessToken: "" }, vi.fn() as unknown as FetchLike),
    ).rejects.toThrow(ValidationError);
  });

  it("service_account_key mode exchanges a signed JWT for an access token on 200", async () => {
    const fetchImpl = makeFetch(200, { access_token: "ya29.exchanged", expires_in: 3600 });

    const result = await getAccessToken(
      { mode: "service_account_key", serviceAccountKey: VALID_SA_KEY },
      fetchImpl,
    );

    expect(result.accessToken).toBe("ya29.exchanged");
    expect(result.expiresInSeconds).toBe(3600);
  });

  it("service_account_key mode sends the readonly scope by default", async () => {
    let sentBody = "";
    const fetchImpl = (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: "t", expires_in: 3600 }),
      } as unknown as Response);
    };

    await getAccessToken({ mode: "service_account_key", serviceAccountKey: VALID_SA_KEY }, fetchImpl);

    const assertion = new URLSearchParams(sentBody).get("assertion")!;
    const [, claimsB64] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(claimsB64, "base64").toString("utf8"));
    expect(claims.scope).toBe(SEARCH_CONSOLE_READONLY_SCOPE);
    expect(claims.iss).toBe(VALID_SA_KEY.client_email);
  });

  it("rejects a service-account key missing private_key", async () => {
    await expect(
      getAccessToken(
        { mode: "service_account_key", serviceAccountKey: { client_email: "x@y.iam.gserviceaccount.com" } as ServiceAccountKey },
        vi.fn() as unknown as FetchLike,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws UnauthorizedError when Google rejects the service-account JWT (401)", async () => {
    const fetchImpl = makeFetch(401, { error: "invalid_grant", error_description: "Invalid JWT signature" });
    await expect(
      getAccessToken({ mode: "service_account_key", serviceAccountKey: VALID_SA_KEY }, fetchImpl),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("throws ServiceUnavailableError on a 5xx token-exchange failure", async () => {
    const fetchImpl = makeFetch(503, {});
    await expect(
      getAccessToken({ mode: "service_account_key", serviceAccountKey: VALID_SA_KEY }, fetchImpl),
    ).rejects.toThrow(ServiceUnavailableError);
  });
});

describe("getSearchConsoleAuthFromEnv", () => {
  it("prefers GSC_ACCESS_TOKEN when present", () => {
    const auth = getSearchConsoleAuthFromEnv({ GSC_ACCESS_TOKEN: "ya29.env" });
    expect(auth).toEqual({ mode: "access_token", accessToken: "ya29.env" });
  });

  it("parses GSC_SERVICE_ACCOUNT_KEY_JSON", () => {
    const auth = getSearchConsoleAuthFromEnv({
      GSC_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify(VALID_SA_KEY),
    });
    expect(auth.mode).toBe("service_account_key");
    if (auth.mode === "service_account_key") {
      expect(auth.serviceAccountKey.client_email).toBe(VALID_SA_KEY.client_email);
    }
  });

  it("parses base64-encoded GSC_SERVICE_ACCOUNT_KEY_BASE64", () => {
    const b64 = Buffer.from(JSON.stringify(VALID_SA_KEY)).toString("base64");
    const auth = getSearchConsoleAuthFromEnv({ GSC_SERVICE_ACCOUNT_KEY_BASE64: b64 });
    expect(auth.mode).toBe("service_account_key");
  });

  it("throws when no credential is configured", () => {
    expect(() => getSearchConsoleAuthFromEnv({})).toThrow(ValidationError);
  });

  it("throws on malformed JSON", () => {
    expect(() => getSearchConsoleAuthFromEnv({ GSC_SERVICE_ACCOUNT_KEY_JSON: "{not json" })).toThrow(
      ValidationError,
    );
  });
});

describe("computeDataFreshness", () => {
  it("flags a recent date as within the reporting-delay window", () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const freshness = computeDataFreshness("2026-11-16", now); // 1 day old
    expect(freshness.withinReportingDelayWindow).toBe(true);
    expect(freshness.note).toContain("reporting delay");
    // Explicitly disclaims being live/"today's" data rather than silently implying it.
    expect(freshness.note).toMatch(/not today/i);
    expect(freshness.reportingDelayDays.max).toBe(GSC_REPORTING_DELAY_DAYS_MAX);
  });

  it("does not flag a date well outside the delay window", () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const freshness = computeDataFreshness("2026-11-01", now); // 16 days old
    expect(freshness.withinReportingDelayWindow).toBe(false);
  });

  it("asOfDate always equals the requested endDate — never silently 'today'", () => {
    const freshness = computeDataFreshness("2026-01-01", new Date("2026-11-17T00:00:00.000Z"));
    expect(freshness.asOfDate).toBe("2026-01-01");
  });
});

describe("computeSearchConsoleRowKey", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeSearchConsoleRowKey({ siteUrl: "sc-domain:opsiq.solutions", date: "2026-11-14", query: "crm" });
    const b = computeSearchConsoleRowKey({ siteUrl: "sc-domain:opsiq.solutions", date: "2026-11-14", query: "crm" });
    expect(a).toBe(b);
  });

  it("differs when any dimension differs", () => {
    const a = computeSearchConsoleRowKey({ siteUrl: "sc-domain:opsiq.solutions", date: "2026-11-14", query: "crm" });
    const b = computeSearchConsoleRowKey({ siteUrl: "sc-domain:opsiq.solutions", date: "2026-11-14", query: "erp" });
    expect(a).not.toBe(b);
  });
});

describe("searchAnalyticsQuery", () => {
  const baseRequest = {
    siteUrl: "sc-domain:opsiq.solutions",
    startDate: "2026-11-10",
    endDate: "2026-11-10",
    dimensions: ["query" as const],
    auth: ACCESS_TOKEN_AUTH,
  };

  it("returns rows on success and attaches freshness", async () => {
    const fetchImpl = makeFetch(200, {
      rows: [{ keys: ["opsiq crm"], clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 }],
      responseAggregationType: "byProperty",
    });

    const result = await searchAnalyticsQuery({ ...baseRequest, fetchImpl });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].clicks).toBe(12);
    expect(result.rowCount).toBe(1);
    expect(result.possiblyIncomplete).toBe(false);
    expect(result.freshness.asOfDate).toBe("2026-11-10");
  });

  it("handles a verified-but-empty property (no `rows` key at all) without throwing", async () => {
    // Real Google behavior for a brand-new/empty property: 200 with no `rows` field.
    const fetchImpl = makeFetch(200, { responseAggregationType: "byProperty" });

    const result = await searchAnalyticsQuery({ ...baseRequest, fetchImpl });

    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
    expect(result.possiblyIncomplete).toBe(false);
  });

  it("flags possiblyIncomplete when the row count hits rowLimit", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      keys: [`q${i}`],
      clicks: 1,
      impressions: 1,
      ctr: 1,
      position: 1,
    }));
    const fetchImpl = makeFetch(200, { rows });

    const result = await searchAnalyticsQuery({ ...baseRequest, rowLimit: 5, fetchImpl });

    expect(result.rowCount).toBe(5);
    expect(result.possiblyIncomplete).toBe(true);
  });

  it("throws UnauthorizedError on 401 (auth failure)", async () => {
    const fetchImpl = makeFetch(401, { error: { message: "Request had invalid authentication credentials" } });
    await expect(searchAnalyticsQuery({ ...baseRequest, fetchImpl })).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError on 403 (service account not granted access on the property yet)", async () => {
    const fetchImpl = makeFetch(403, {
      error: { message: "User does not have sufficient permission for site 'sc-domain:opsiq.solutions'." },
    });
    await expect(searchAnalyticsQuery({ ...baseRequest, fetchImpl })).rejects.toMatchObject({
      name: "UnauthorizedError",
      message: expect.stringContaining("Restricted user"),
    });
  });

  it("throws TooManyRequestsError on 429 and carries Retry-After", async () => {
    const fetchImpl = makeFetch(429, { error: { message: "Quota exceeded" } }, { "Retry-After": "30" });
    await expect(searchAnalyticsQuery({ ...baseRequest, fetchImpl })).rejects.toMatchObject({
      name: "TooManyRequestsError",
      details: { retryAfterSeconds: 30 },
    });
  });

  it("throws ServiceUnavailableError on a 5xx response", async () => {
    const fetchImpl = makeFetch(500, { error: { message: "Internal error" } });
    await expect(searchAnalyticsQuery({ ...baseRequest, fetchImpl })).rejects.toThrow(ServiceUnavailableError);
  });

  it("rejects a missing siteUrl before making any network call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      searchAnalyticsQuery({ ...baseRequest, siteUrl: "", fetchImpl: fetchImpl as unknown as FetchLike }),
    ).rejects.toThrow(ValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("sitemapsList", () => {
  it("returns the sitemap array on success", async () => {
    const fetchImpl = makeFetch(200, {
      sitemap: [{ path: "https://opsiq.solutions/sitemap.xml", isPending: false, isSitemapsIndex: true }],
    });

    const result = await sitemapsList({ siteUrl: "sc-domain:opsiq.solutions", auth: ACCESS_TOKEN_AUTH, fetchImpl });

    expect(result.sitemaps).toHaveLength(1);
    expect(result.sitemaps[0].path).toContain("sitemap.xml");
  });

  it("returns an empty array when Google reports none", async () => {
    const fetchImpl = makeFetch(200, {});
    const result = await sitemapsList({ siteUrl: "sc-domain:opsiq.solutions", auth: ACCESS_TOKEN_AUTH, fetchImpl });
    expect(result.sitemaps).toEqual([]);
  });

  it("throws NotFoundError on 404 (property not found for this account)", async () => {
    const fetchImpl = makeFetch(404, { error: { message: "Not found" } });
    await expect(
      sitemapsList({ siteUrl: "sc-domain:unregistered.example", auth: ACCESS_TOKEN_AUTH, fetchImpl }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("urlInspect", () => {
  it("returns parsed index status on success", async () => {
    const fetchImpl = makeFetch(200, {
      inspectionResult: {
        inspectionResultLink: "https://search.google.com/...",
        indexStatusResult: {
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          indexingState: "INDEXING_ALLOWED",
        },
      },
    });

    const result = await urlInspect({
      inspectionUrl: "https://opsiq.solutions/pricing",
      siteUrl: "sc-domain:opsiq.solutions",
      auth: ACCESS_TOKEN_AUTH,
      fetchImpl,
    });

    expect(result.indexStatus?.verdict).toBe("PASS");
    expect(result.indexStatus?.coverageState).toBe("Submitted and indexed");
  });

  it("throws UnauthorizedError on 401", async () => {
    const fetchImpl = makeFetch(401, { error: { message: "Unauthenticated" } });
    await expect(
      urlInspect({
        inspectionUrl: "https://opsiq.solutions/pricing",
        siteUrl: "sc-domain:opsiq.solutions",
        auth: ACCESS_TOKEN_AUTH,
        fetchImpl,
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});
