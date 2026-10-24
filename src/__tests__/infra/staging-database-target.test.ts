/**
 * The ONE staging database-target validator (src/infra/staging-database-target.ts).
 * All URLs are SYNTHETIC. Refusals must never emit a URL, host, user, password or database name.
 */
import { describe, it, expect } from "vitest";
import {
  StagingTargetRefusal,
  assertApprovedStagingDatabaseUrl,
  assertLocalOrApprovedStagingTarget,
  isPositivelyLocalDatabaseUrl,
  parseApprovedStagingEndpointIds,
} from "@/infra/staging-database-target";
import { assertApprovedStagingTarget } from "../../../scripts/assert-approved-staging-database";
import { resolvePrismaDatasource } from "@/infra/prisma-datasource";

const STG = "postgresql://stg-user:stg-secret@ep-synthetic-stg-1.region.invalid:5432/stg_db_name?sslmode=require";
const APPROVED = "ep-synthetic-stg-1";
const PROD = "postgresql://prod-user:prod-secret@ep-synthetic-prod-1.region.invalid:5432/prod_db_name";
const PROD_ENV = { OPSIQ_PRODUCTION_DB_IDENTITIES: "ep-synthetic-prod-1" };
const LEAK = ["stg-user", "stg-secret", "ep-synthetic-stg-1", "stg_db_name", "prod-user", "prod-secret", "ep-synthetic-prod-1", "prod_db_name", "region.invalid"];

const refusal = (fn: () => unknown) => {
  try { fn(); } catch (e) { if (e instanceof StagingTargetRefusal) return e; throw e; }
  return null;
};

describe("staging target validator", () => {
  it("A. an approved direct staging endpoint passes", () => {
    expect(assertApprovedStagingDatabaseUrl(STG, APPROVED).endpointId).toBe("ep-synthetic-stg-1");
    expect(assertApprovedStagingDatabaseUrl(STG, `other-id, ${APPROVED}`).endpointId).toBe("ep-synthetic-stg-1");
    expect(assertApprovedStagingDatabaseUrl(STG, [APPROVED]).endpointId).toBe("ep-synthetic-stg-1");
  });

  it("B. an approved id with a -pooler hostname is refused for schema mutation", () => {
    const pooled = "postgresql://u:p@ep-synthetic-stg-1-pooler.region.invalid:5432/d";
    expect(refusal(() => assertApprovedStagingDatabaseUrl(pooled, "ep-synthetic-stg-1-pooler"))?.code).toBe("POOLED_ENDPOINT");
    expect(refusal(() => assertApprovedStagingDatabaseUrl(pooled, APPROVED))?.code).toBe("POOLED_ENDPOINT");
  });

  it("C. a known production endpoint is refused — even when someone put it on the allowlist", () => {
    expect(refusal(() => assertApprovedStagingDatabaseUrl(PROD, "ep-synthetic-prod-1", PROD_ENV))?.code).toBe("PRODUCTION_ENDPOINT");
    expect(refusal(() => assertApprovedStagingDatabaseUrl(PROD, APPROVED, PROD_ENV))?.code).toBe("PRODUCTION_ENDPOINT");
  });

  it("D. an arbitrary unrelated remote endpoint is refused (unknown does not mean safe)", () => {
    const other = "postgresql://u:p@db.synthetic-unrelated.invalid:5432/d";
    expect(refusal(() => assertApprovedStagingDatabaseUrl(other, APPROVED))?.code).toBe("ENDPOINT_NOT_APPROVED");
    // Prefix / substring of an approved id is not an exact match.
    expect(refusal(() => assertApprovedStagingDatabaseUrl("postgresql://u:p@ep-synthetic-stg-12.invalid:5432/d", APPROVED))?.code).toBe("ENDPOINT_NOT_APPROVED");
  });

  it("E. an empty or unset approved-endpoint list fails closed", () => {
    for (const list of [undefined, "", "   ", " , ", []] as const) {
      expect(refusal(() => assertApprovedStagingDatabaseUrl(STG, list))?.code, JSON.stringify(list)).toBe("ALLOWLIST_EMPTY");
    }
  });

  it("a malformed allowlist fails closed (a typo never widens what is approved)", () => {
    for (const list of ["ep-a,,ep-b", "https://ep-synthetic-stg-1.invalid", "ep a", "ep-*", "ep/../x", "ep-synthetic-stg-1;ep-x"]) {
      expect(refusal(() => assertApprovedStagingDatabaseUrl(STG, list))?.code, list).toBe("ALLOWLIST_MALFORMED");
    }
    expect(() => parseApprovedStagingEndpointIds("EP-UPPER-1, ep-two")).not.toThrow();
    expect(parseApprovedStagingEndpointIds("EP-UPPER-1, ep-two")).toEqual(["ep-upper-1", "ep-two"]);
  });

  it("F. a malformed or non-postgres URL is refused", () => {
    for (const url of ["", "   ", undefined, "not a url", "mysql://u:p@ep-synthetic-stg-1.invalid/d", "https://ep-synthetic-stg-1.invalid", "postgresql://"]) {
      const r = refusal(() => assertApprovedStagingDatabaseUrl(url, APPROVED));
      expect(r, String(url)).not.toBeNull();
      expect(["URL_UNSET", "URL_NOT_PLAIN_POSTGRES"]).toContain(r!.code);
    }
  });

  it("G. a host / hostaddr override is refused when the effective target cannot be proven", () => {
    for (const q of ["host=db.synthetic-other.invalid", "hostaddr=203.0.113.9", "HOST=db.synthetic-other.invalid"]) {
      const url = `postgresql://u:p@ep-synthetic-stg-1.region.invalid:5432/d?${q}`;
      expect(refusal(() => assertApprovedStagingDatabaseUrl(url, APPROVED))?.code, q).toBe("URL_NOT_PLAIN_POSTGRES");
    }
  });

  it("H. unusual / percent-encoded credentials never leak through any refusal", () => {
    const weird = "postgresql://us%40er:p%2Fa%3As%40s:w0rd!#@db.synthetic-weird-host.invalid:5432/we%20ird_db";
    const parts = ["us%40er", "p%2Fa%3As%40s", "w0rd", "synthetic-weird-host", "we%20ird_db", "ird_db"];
    const attempts: Array<() => unknown> = [
      () => assertApprovedStagingDatabaseUrl(weird, APPROVED),
      () => assertApprovedStagingDatabaseUrl(weird, undefined),
      () => assertApprovedStagingDatabaseUrl(`${weird}?host=x`, APPROVED),
      () => assertApprovedStagingDatabaseUrl(PROD, APPROVED, PROD_ENV),
      () => assertApprovedStagingDatabaseUrl(STG, "ep-nope"),
      () => assertApprovedStagingDatabaseUrl(STG, "ep a"),
    ];
    for (const attempt of attempts) {
      const r = refusal(attempt);
      expect(r).not.toBeNull();
      for (const p of [...parts, ...LEAK.filter((x) => x !== "ep-synthetic-stg-1")]) expect(r!.message).not.toContain(p);
    }
  });
});

describe("the CLI preflight and the Prisma staging path share this validator", () => {
  it("the preflight accepts the approved URL and refuses every refusal case, sanitized", () => {
    const ok = assertApprovedStagingTarget("DATABASE_URL", { DATABASE_URL: STG, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED });
    expect(ok.ok).toBe(true);
    const bad: Array<Record<string, string | undefined>> = [
      { DATABASE_URL: STG },
      { DATABASE_URL: STG, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "" },
      { DATABASE_URL: STG, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-other" },
      { DATABASE_URL: PROD, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED, ...PROD_ENV },
      { DATABASE_URL: "garbage", OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED },
      { OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED },
    ];
    for (const env of bad) {
      const r = assertApprovedStagingTarget("DATABASE_URL", env);
      expect(r.ok).toBe(false);
      const text = r.lines.join("\n");
      expect(text).toMatch(/STAGING_TARGET_REFUSED_/);
      for (const p of LEAK) expect(text).not.toContain(p);
    }
    expect(assertApprovedStagingTarget("lower-case", { }).ok).toBe(false);
  });

  it("the Prisma OPSIQ_DB_TARGET=staging path applies the identical decisions", () => {
    const deploy = ["node", "prisma", "migrate", "deploy"];
    const base = { OPSIQ_DB_TARGET: "staging", DATABASE_URL: STG };
    expect(resolvePrismaDatasource({ env: { ...base, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED }, argv: deploy }).target).toBe("staging");
    for (const [env, re] of [
      [{ ...base }, /not set or is empty/],
      [{ ...base, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep-other" }, /not listed/],
      [{ ...base, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: "ep a" }, /malformed/],
      [{ ...base, DATABASE_URL: PROD, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED, ...PROD_ENV }, /known production endpoint/],
      [{ ...base, DATABASE_URL: `${STG}&host=x`, OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED }, /provable hostname/],
    ] as const) {
      expect(() => resolvePrismaDatasource({ env, argv: deploy })).toThrow(re);
    }
  });
});

describe("destructive paths outside Prisma: local or approved staging only", () => {
  it("a loopback database and a listed compose service are local; production, unknown remote and unlisted staging are refused", () => {
    expect(assertLocalOrApprovedStagingTarget("postgresql://u:p@127.0.0.1:5432/d").kind).toBe("local");
    expect(assertLocalOrApprovedStagingTarget("postgresql://u:p@postgres:5432/d", { OPSIQ_LOCAL_DB_EXTRA_HOSTS: "postgres" }).kind).toBe("local");
    expect(isPositivelyLocalDatabaseUrl("postgresql://u:p@postgres:5432/d", {})).toBe(false);
    expect(assertLocalOrApprovedStagingTarget(STG, { OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED }).kind).toBe("staging");
    expect(() => assertLocalOrApprovedStagingTarget(STG, {})).toThrow(StagingTargetRefusal);
    expect(() => assertLocalOrApprovedStagingTarget(PROD, { OPSIQ_APPROVED_STAGING_ENDPOINT_IDS: APPROVED, ...PROD_ENV })).toThrow(StagingTargetRefusal);
    expect(() => assertLocalOrApprovedStagingTarget(undefined, {})).toThrow(StagingTargetRefusal);
  });
});
