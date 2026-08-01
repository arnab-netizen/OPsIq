/**
 * Prisma datasource selection contract.
 *
 * Incident this pins: prisma.config.ts resolved
 *   MIGRATION_DATABASE_URL || DATABASE_URL || DATABASE_URL_TEST || local default
 * so `npx prisma migrate deploy` in a Codespaces shell that happened to carry
 * MIGRATION_DATABASE_URL silently selected production, even though the operator
 * had set DATABASE_URL to a local container.
 *
 * All URLs below are synthetic placeholders. No real value appears in this file.
 */

import { describe, it, expect } from "vitest";
import {
  BUILT_IN_LOCAL_DEFAULT,
  PrismaDatasourceError,
  isMutationCommand,
  resolvePrismaDatasource,
} from "@/infra/prisma-datasource";

const LOCAL = "postgresql://local-user:local-pass@localhost:5432/opsiq_local";
const TEST = "postgresql://test-user:test-pass@localhost:5432/opsiq_test";
const CI = "postgresql://ci-user:ci-pass@localhost:5432/opsiq_ci";
const PROD = "postgresql://prod-user:prod-pass@synthetic-production.invalid/opsiq";

const MIGRATE = ["node", "prisma", "migrate", "deploy"];
const VALIDATE = ["node", "prisma", "validate"];
const GENERATE = ["node", "prisma", "generate"];

const resolve = (env: Record<string, string | undefined>, argv = VALIDATE) =>
  resolvePrismaDatasource({ env, argv });

describe("command classification", () => {
  it.each([
    [["node", "prisma", "migrate", "deploy"], true],
    [["node", "prisma", "migrate", "dev"], true],
    [["node", "prisma", "migrate", "reset"], true],
    [["node", "prisma", "db", "push"], true],
    [["node", "prisma", "db", "seed"], true],
    [["node", "prisma", "db", "execute"], true],
    [["node", "prisma", "studio"], true],
    [["node", "prisma", "validate"], false],
    [["node", "prisma", "generate"], false],
    [["node", "prisma", "format"], false],
  ])("%j -> mutating=%s", (argv, expected) => {
    expect(isMutationCommand(argv as string[])).toBe(expected);
  });
});

describe("1-3. explicit modes select the intended datasource", () => {
  it("1. local mode selects DATABASE_URL", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "local", DATABASE_URL: LOCAL });
    expect(r.url).toBe(LOCAL);
    expect(r.target).toBe("local");
  });

  it("2. test mode selects the test datasource", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: TEST, DATABASE_URL: LOCAL });
    expect(r.url).toBe(TEST);
    expect(r.target).toBe("test");
  });

  it("2b. test mode also accepts DATABASE_URL_TEST", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "test", DATABASE_URL_TEST: TEST });
    expect(r.url).toBe(TEST);
  });

  it("3. ci mode selects DATABASE_URL", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "ci", DATABASE_URL: CI });
    expect(r.url).toBe(CI);
    expect(r.target).toBe("ci");
  });
});

describe("4-5. MIGRATION_DATABASE_URL never overrides a non-production mode", () => {
  it("4. does not override local mode", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "local", DATABASE_URL: LOCAL, MIGRATION_DATABASE_URL: PROD });
    expect(r.url).toBe(LOCAL);
    expect(r.url).not.toBe(PROD);
    expect(r.notices.join(" ")).toMatch(/MIGRATION_DATABASE_URL is present but ignored/);
  });

  it("5. does not override test mode", () => {
    const r = resolve({ OPSIQ_DB_TARGET: "test", TEST_DATABASE_URL: TEST, MIGRATION_DATABASE_URL: PROD });
    expect(r.url).toBe(TEST);
    expect(r.url).not.toBe(PROD);
  });

  it("5b. does not override implicit resolution either", () => {
    const r = resolve({ DATABASE_URL: LOCAL, MIGRATION_DATABASE_URL: PROD });
    expect(r.url).toBe(LOCAL);
    expect(r.url).not.toBe(PROD);
  });
});

describe("6-8, 10. fail-closed behaviour", () => {
  it("6. an unsupported OPSIQ_DB_TARGET value fails closed", () => {
    expect(() => resolve({ OPSIQ_DB_TARGET: "prod-ish", DATABASE_URL: LOCAL })).toThrow(
      PrismaDatasourceError
    );
  });

  it("7. an explicit mode with its datasource missing fails closed", () => {
    expect(() => resolve({ OPSIQ_DB_TARGET: "local" })).toThrow(/requires DATABASE_URL/);
    expect(() => resolve({ OPSIQ_DB_TARGET: "test" })).toThrow(/requires TEST_DATABASE_URL/);
    expect(() => resolve({ OPSIQ_DB_TARGET: "ci" })).toThrow(/requires DATABASE_URL/);
  });

  it("8. production target without explicit authorization fails closed", () => {
    expect(() =>
      resolve({ OPSIQ_DB_TARGET: "production", MIGRATION_DATABASE_URL: PROD }, MIGRATE)
    ).toThrow(/requires OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true/);
  });

  it("8b. authorization flag alone, without the target, never reaches production", () => {
    const r = resolve(
      { OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", MIGRATION_DATABASE_URL: PROD, DATABASE_URL: LOCAL },
      MIGRATE
    );
    expect(r.url).toBe(LOCAL);
    expect(r.target).not.toBe("production-authorized");
  });

  it("10. a mutation-capable command cannot silently fall back to the built-in default", () => {
    expect(() => resolve({}, MIGRATE)).toThrow(/mutation-capable/);
    expect(() => resolve({}, MIGRATE)).toThrow(/Refusing to use the built-in local default/);
  });

  it("10b. production mode authorized but MIGRATION_DATABASE_URL missing does not fall back", () => {
    expect(() =>
      resolve(
        { OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true", DATABASE_URL: LOCAL },
        MIGRATE
      )
    ).toThrow(/Refusing to fall back/);
  });
});

describe("9. explicitly authorized production", () => {
  it("selects MIGRATION_DATABASE_URL and reports a sanitized target", () => {
    const r = resolve(
      {
        OPSIQ_DB_TARGET: "production",
        OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true",
        MIGRATION_DATABASE_URL: PROD,
      },
      MIGRATE
    );
    expect(r.url).toBe(PROD);
    expect(r.target).toBe("production-authorized");
    expect(r.notices.join(" ")).not.toContain(PROD);
  });
});

describe("11. validation and generation remain compatible", () => {
  it("prisma validate with nothing configured uses the built-in local default", () => {
    const r = resolve({}, VALIDATE);
    expect(r.url).toBe(BUILT_IN_LOCAL_DEFAULT);
    expect(r.mutating).toBe(false);
  });

  it("prisma generate with nothing configured does not throw (postinstall / Vercel build)", () => {
    expect(() => resolve({}, GENERATE)).not.toThrow();
  });

  it("prisma generate with a stray MIGRATION_DATABASE_URL still avoids production", () => {
    const r = resolve({ MIGRATION_DATABASE_URL: PROD }, GENERATE);
    expect(r.url).toBe(BUILT_IN_LOCAL_DEFAULT);
    expect(r.url).not.toBe(PROD);
  });
});

describe("12-13. real CI workflow shapes", () => {
  it("12. LANE_B resolves to its throwaway container", () => {
    // db-verification.yml sets all three to the local throwaway container.
    const r = resolve(
      { CI: "true", DATABASE_URL: CI, TEST_DATABASE_URL: CI, MIGRATION_DATABASE_URL: CI },
      MIGRATE
    );
    expect(r.url).toBe(CI);
    expect(r.target).toBe("ci");
  });

  it("13. Main Integration resolves to its CI container", () => {
    // main-integration.yml sets DATABASE_URL only.
    const r = resolve({ CI: "true", DATABASE_URL: CI, DATABASE_URL_TEST: CI }, MIGRATE);
    expect(r.url).toBe(CI);
    expect(r.target).toBe("ci");
  });

  it("13b. the Neon migration workflows keep working via DATABASE_URL", () => {
    // Every module-*-migrate.yml sets DATABASE_URL to the same secret value.
    const r = resolve({ CI: "true", DATABASE_URL: PROD, MIGRATION_DATABASE_URL: PROD }, MIGRATE);
    expect(r.url).toBe(PROD);
  });
});

describe("14. output never leaks credentials", () => {
  it("notices and error messages contain no URL, host, user or password", () => {
    const secretParts = ["prod-user", "prod-pass", "synthetic-production.invalid", PROD];

    const withNotices = resolve({ DATABASE_URL: LOCAL, MIGRATION_DATABASE_URL: PROD });
    for (const part of secretParts) {
      expect(withNotices.notices.join(" ")).not.toContain(part);
    }

    let message = "";
    try {
      resolve({ OPSIQ_DB_TARGET: "production", MIGRATION_DATABASE_URL: PROD }, MIGRATE);
    } catch (e) {
      const err = e as PrismaDatasourceError;
      message = err.message + " " + err.notices.join(" ");
    }
    expect(message).not.toBe("");
    for (const part of secretParts) {
      expect(message).not.toContain(part);
    }
  });
});

describe("15. named regression: the exact historical incident", () => {
  it("MIGRATION_DATABASE_URL in the shell plus an intended local DATABASE_URL never selects production", () => {
    const r = resolve({ MIGRATION_DATABASE_URL: PROD, DATABASE_URL: LOCAL }, MIGRATE);

    expect(r.url).toBe(LOCAL);
    expect(r.url).not.toBe(PROD);
    expect(r.target).toBe("local");
  });

  it("MIGRATION_DATABASE_URL in the shell with DATABASE_URL unset refuses to run a migration", () => {
    // The precise Codespaces shape: DATABASE_URL was not exported at the time.
    // Previously this selected production. It must now fail closed.
    expect(() => resolve({ MIGRATION_DATABASE_URL: PROD }, MIGRATE)).toThrow(PrismaDatasourceError);

    let selected: string | undefined;
    try {
      selected = resolve({ MIGRATION_DATABASE_URL: PROD }, MIGRATE).url;
    } catch {
      selected = undefined;
    }
    expect(selected).toBeUndefined();
  });
});
