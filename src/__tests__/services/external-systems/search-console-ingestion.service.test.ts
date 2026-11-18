/**
 * Google Search Console ingestion — idempotent-write tests.
 *
 * @/lib/db is fully mocked: no real database connection is made. The Search Console API is
 * reached only via an injected `fetchImpl` fixture, same as search-console.test.ts — no test
 * here makes, or could make, a live network call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    searchConsoleMetric: {
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
  // vitest.setup.ts dynamically imports getDbInstance from "@/lib/db" when
  // TEST_WITH_DB=true (Main Integration lane) — every vi.mock("@/lib/db")
  // factory must export it or that lane fails even though LANE_A (no DB)
  // passes silently. See DC-20 in scripts/a77-prevention-gates.ts.
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import { ingestSearchConsoleDay } from "@/services/external-systems/search-console-ingestion.service";
import { computeSearchConsoleRowKey, type SearchConsoleAuth } from "@/lib/integrations/search-console";
import { UnauthorizedError } from "@/infra/errors";

const AUTH: SearchConsoleAuth = { mode: "access_token", accessToken: "ya29.fixture" };
const SITE_URL = "sc-domain:opsiq.solutions";
const DATE = "2026-11-14";

function makeFetch(status: number, body: unknown): () => Promise<Response> {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: { get: () => null },
    } as unknown as Response);
}

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
});

describe("ingestSearchConsoleDay", () => {
  it("upserts one row per fetched result, keyed by the deterministic rowKey", async () => {
    const fetchImpl = makeFetch(200, {
      rows: [
        { keys: ["opsiq crm", "/", "DESKTOP", "usa"], clicks: 10, impressions: 200, ctr: 0.05, position: 5.1 },
        { keys: ["opsiq pricing", "/pricing", "MOBILE", "gbr"], clicks: 3, impressions: 90, ctr: 0.033, position: 9.4 },
      ],
    });

    const result = await ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl });

    expect(result.rowsFetched).toBe(2);
    expect(result.rowsWritten).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);

    const expectedRowKey = computeSearchConsoleRowKey({
      siteUrl: SITE_URL,
      date: DATE,
      query: "opsiq crm",
      page: "/",
      device: "DESKTOP",
      country: "usa",
    });
    const firstCallArg = upsertMock.mock.calls[0][0];
    expect(firstCallArg.where.rowKey).toBe(expectedRowKey);
    expect(firstCallArg.create).toMatchObject({
      siteUrl: SITE_URL,
      query: "opsiq crm",
      page: "/",
      device: "DESKTOP",
      country: "usa",
      clicks: 10,
      impressions: 200,
    });
  });

  it("re-running for the same date produces the same rowKeys (idempotent upsert, not insert)", async () => {
    const fetchImpl = makeFetch(200, {
      rows: [{ keys: ["opsiq crm", "/", "DESKTOP", "usa"], clicks: 10, impressions: 200, ctr: 0.05, position: 5.1 }],
    });

    await ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl });
    const firstKey = upsertMock.mock.calls[0][0].where.rowKey;

    upsertMock.mockClear();
    await ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl });
    const secondKey = upsertMock.mock.calls[0][0].where.rowKey;

    expect(secondKey).toBe(firstKey);
    // Same rowKey ⇒ Prisma's upsert() updates the existing row rather than inserting a
    // duplicate — this is the mechanism, not just an assertion of equal keys.
    expect(upsertMock.mock.calls[0][0].update).toMatchObject({ clicks: 10, impressions: 200 });
  });

  it("handles an empty-property result (no rows at all) as zero writes, not an error", async () => {
    const fetchImpl = makeFetch(200, {});
    const result = await ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl });

    expect(result.rowsFetched).toBe(0);
    expect(result.rowsWritten).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("propagates auth failures (401) without writing anything", async () => {
    const fetchImpl = makeFetch(401, { error: { message: "Request had invalid authentication credentials" } });

    await expect(
      ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl }),
    ).rejects.toThrow(UnauthorizedError);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("surfaces possiblyIncomplete from the underlying query when rowLimit is hit", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      keys: [`q${i}`, "/", "DESKTOP", "usa"],
      clicks: 1,
      impressions: 1,
      ctr: 1,
      position: 1,
    }));
    const fetchImpl = makeFetch(200, { rows });

    const result = await ingestSearchConsoleDay({
      siteUrl: SITE_URL,
      date: DATE,
      auth: AUTH,
      rowLimit: 3,
      fetchImpl,
    });

    expect(result.possiblyIncomplete).toBe(true);
    expect(result.rowsWritten).toBe(3);
  });

  it("attaches freshness metadata to the ingestion result", async () => {
    const fetchImpl = makeFetch(200, { rows: [] });
    const result = await ingestSearchConsoleDay({ siteUrl: SITE_URL, date: DATE, auth: AUTH, fetchImpl });

    expect(result.freshness.asOfDate).toBe(DATE);
    expect(result.freshness.note).not.toMatch(/today/i);
  });
});
