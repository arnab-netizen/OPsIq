/**
 * STAGE 8 — startup_status deployment scoping.
 *
 * Defect: instance identity resolved to `process.env.HOSTNAME || "unknown"`.
 * Vercel's Node.js serverless runtime sets neither HOSTNAME nor
 * npm_package_version, so every production deployment resolved the SAME key
 * ("unknown"). A READY row written by deployment A therefore satisfied
 * deployment B, and ensureStartupComplete() returned early WITHOUT running the
 * startup checks — including the OPSIQ_PRIVATE_WORKSPACE_ID binding check.
 *
 * These tests pin the corrected contract: startup status is scoped to one
 * deployment, and a deployment context with no trustworthy deployment identity
 * fails closed instead of silently sharing an "unknown" row.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory stand-in for the startup_status table, keyed by instance_id exactly
// as the real unique index is.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  instanceId: string;
  status: string;
  version: string;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

interface InstanceWhere {
  where: { instanceId: string };
}

interface UpsertArgs extends InstanceWhere {
  create: {
    status: string;
    version: string;
    error?: string | null;
    startedAt?: Date;
    completedAt?: Date | null;
  };
  update: Partial<Row>;
}

const rows = new Map<string, Row>();
const workspaceFindUnique = vi.fn();

const dbMock = {
  startupStatus: {
    findUnique: vi.fn(async ({ where }: InstanceWhere) => rows.get(where.instanceId) ?? null),
    findFirst: vi.fn(async (args?: { where?: { instanceId?: string } }) => {
      const all = [...rows.values()];
      const wanted = args?.where?.instanceId;
      const filtered = wanted ? all.filter((r) => r.instanceId === wanted) : all;
      return (
        filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
      );
    }),
    upsert: vi.fn(async ({ where, create, update }: UpsertArgs) => {
      const existing = rows.get(where.instanceId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const row: Row = {
        instanceId: where.instanceId,
        status: create.status,
        version: create.version,
        error: create.error ?? null,
        startedAt: create.startedAt ?? new Date(),
        completedAt: create.completedAt ?? null,
        updatedAt: new Date(),
      };
      rows.set(row.instanceId, row);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: InstanceWhere) => {
      const had = rows.delete(where.instanceId);
      return { count: had ? 1 : 0 };
    }),
  },
  workspace: { findUnique: workspaceFindUnique },
  $queryRawUnsafe: vi.fn(async () => [{ ok: 1 }]),
};

vi.mock("@/lib/db", () => ({
  db: dbMock,
  getDbInstance: vi.fn(async () => dbMock),
}));

/** Reload the startup modules so per-process module state does not leak. */
async function loadStartupModules() {
  vi.resetModules();
  const statusMod = await import("@/services/startup-status");
  const orchestratorMod = await import("@/infra/startup-orchestrator");
  return { ...statusMod, ...orchestratorMod };
}

/** Put the process in a Vercel production deployment context. */
function stubDeployment(deploymentId: string, commitSha = "a".repeat(40)) {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_DEPLOYMENT_ID", deploymentId);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", commitSha);
  // Vercel sets neither of these — this is the condition that caused the defect.
  vi.stubEnv("HOSTNAME", "");
  vi.stubEnv("npm_package_version", "");
}

beforeEach(() => {
  rows.clear();
  workspaceFindUnique.mockReset();
  workspaceFindUnique.mockResolvedValue({ id: "workspace-present" });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[stage8] startup_status deployment scoping", () => {
  it("1. a READY row from deployment A does not satisfy deployment B", async () => {
    stubDeployment("dpl_AAAAAAAAAAAAAAAAAAAAAAAA");
    const a = await loadStartupModules();
    await a.setStartupStatus("READY", { completedAt: new Date() });
    expect(rows.size).toBe(1);

    stubDeployment("dpl_BBBBBBBBBBBBBBBBBBBBBBBB");
    const b = await loadStartupModules();
    const seenByB = await b.getStartupStatus();

    expect(seenByB.status).not.toBe("READY");
    expect(seenByB.status).toBe("NOT_STARTED");
  });

  it("2. repeated calls within one deployment are idempotent (one row)", async () => {
    stubDeployment("dpl_CCCCCCCCCCCCCCCCCCCCCCCC");
    const m = await loadStartupModules();

    await m.ensureStartupComplete();
    await m.ensureStartupComplete();
    await m.ensureStartupComplete();

    expect(rows.size).toBe(1);
    const only = [...rows.values()][0];
    expect(only.status).toBe("READY");
  });

  it("3. production identity is derived from the Vercel deployment identifier", async () => {
    stubDeployment("dpl_DDDDDDDDDDDDDDDDDDDDDDDD");
    const one = await loadStartupModules();
    await one.setStartupStatus("READY", { completedAt: new Date() });
    const keyOne = [...rows.keys()][0];

    rows.clear();
    stubDeployment("dpl_EEEEEEEEEEEEEEEEEEEEEEEE");
    const two = await loadStartupModules();
    await two.setStartupStatus("READY", { completedAt: new Date() });
    const keyTwo = [...rows.keys()][0];

    expect(keyOne).not.toBe(keyTwo);
    // The raw deployment identifier is never persisted verbatim.
    expect(keyOne).not.toContain("dpl_DDDDDDDDDDDDDDDDDDDDDDDD");
    expect(keyTwo).not.toContain("dpl_EEEEEEEEEEEEEEEEEEEEEEEE");
  });

  it("4. a deployment context with no trustworthy identity fails closed", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("HOSTNAME", "");
    const m = await loadStartupModules();

    await expect(m.ensureStartupComplete()).rejects.toThrow(/deployment identity/i);
    // Fails closed: nothing is written, and no shared row is invented.
    expect(rows.size).toBe(0);
    const status = await m.getStartupStatus();
    expect(status.status).toBe("FAILED");
  });

  it("5. the local fallback applies outside a deployment context only", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("OPSIQ_INSTANCE_ID", "");
    const m = await loadStartupModules();

    await expect(m.ensureStartupComplete()).resolves.toBeUndefined();
    expect(rows.size).toBe(1);
    expect([...rows.keys()][0]).toBe(m.LOCAL_INSTANCE_ID);

    // An explicit override is honoured outside production.
    rows.clear();
    vi.stubEnv("OPSIQ_INSTANCE_ID", "explicit-test-instance");
    const m2 = await loadStartupModules();
    await m2.setStartupStatus("READY");
    expect([...rows.keys()][0]).toBe("explicit-test-instance");
  });

  it("6. the workspace-binding check runs again on a new deployment", async () => {
    vi.stubEnv("OPSIQ_PRIVATE_WORKSPACE_ID", "11111111-2222-3333-4444-555555555555");

    stubDeployment("dpl_FFFFFFFFFFFFFFFFFFFFFFFF");
    const a = await loadStartupModules();
    await a.ensureStartupComplete();
    expect(workspaceFindUnique).toHaveBeenCalledTimes(1);

    // New deployment, same database, pre-existing READY row from deployment A.
    stubDeployment("dpl_GGGGGGGGGGGGGGGGGGGGGGGG");
    const b = await loadStartupModules();
    await b.ensureStartupComplete();

    expect(workspaceFindUnique).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(2);
  });

  it("7. a configured workspace that is missing drives startup to FAILED", async () => {
    vi.stubEnv("OPSIQ_PRIVATE_WORKSPACE_ID", "11111111-2222-3333-4444-555555555555");
    workspaceFindUnique.mockResolvedValue(null);

    stubDeployment("dpl_HHHHHHHHHHHHHHHHHHHHHHHH");
    const m = await loadStartupModules();

    await expect(m.ensureStartupComplete()).rejects.toThrow();
    const status = await m.getStartupStatus();
    expect(status.status).toBe("FAILED");
    expect(status.error).toBeTruthy();
  });

  it("8. a configured workspace that exists drives startup to READY", async () => {
    vi.stubEnv("OPSIQ_PRIVATE_WORKSPACE_ID", "11111111-2222-3333-4444-555555555555");
    workspaceFindUnique.mockResolvedValue({ id: "11111111-2222-3333-4444-555555555555" });

    stubDeployment("dpl_IIIIIIIIIIIIIIIIIIIIIIII");
    const m = await loadStartupModules();

    await m.ensureStartupComplete();
    const status = await m.getStartupStatus();
    expect(status.status).toBe("READY");
    expect(status.completed_at).toBeTruthy();
  });

  it("9. status reads are scoped to the current deployment row", async () => {
    // Historical row written by an older deployment under the legacy key.
    rows.set("unknown", {
      instanceId: "unknown",
      status: "READY",
      version: "unknown",
      error: null,
      startedAt: new Date("2026-07-31T10:55:09.899Z"),
      completedAt: new Date("2026-07-31T10:55:10.152Z"),
      updatedAt: new Date("2026-07-31T10:55:10.162Z"),
    });

    stubDeployment("dpl_JJJJJJJJJJJJJJJJJJJJJJJJ");
    const m = await loadStartupModules();

    // The corrected deployment must not read the legacy row as its own.
    const before = await m.getStartupStatus();
    expect(before.status).toBe("NOT_STARTED");

    await m.ensureStartupComplete();
    const after = await m.getStartupStatus();
    expect(after.status).toBe("READY");

    // Historical row preserved untouched — no deletion, no rewrite.
    const legacy = rows.get("unknown")!;
    expect(legacy.status).toBe("READY");
    expect(legacy.updatedAt.toISOString()).toBe("2026-07-31T10:55:10.162Z");
    expect(rows.size).toBe(2);
  });

  it("10. no shared 'unknown' row is created in a deployment context", async () => {
    stubDeployment("dpl_KKKKKKKKKKKKKKKKKKKKKKKK");
    const m = await loadStartupModules();
    await m.ensureStartupComplete();

    expect(rows.has("unknown")).toBe(false);
    for (const key of rows.keys()) {
      expect(key).not.toBe("unknown");
    }
  });

  it("11. version identity is never 'unknown' in a deployment context", async () => {
    stubDeployment("dpl_LLLLLLLLLLLLLLLLLLLLLLLL", "b".repeat(40));
    const m = await loadStartupModules();
    await m.ensureStartupComplete();

    const row = [...rows.values()][0];
    expect(row.version).not.toBe("unknown");
    expect(row.version.length).toBeGreaterThan(0);
  });
});

describe("[stage8] deployment identity contract", () => {
  /** Clear every identity-relevant variable so each case starts from nothing. */
  function clearIdentityEnv() {
    for (const key of [
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_DEPLOYMENT_ID",
      "VERCEL_GIT_COMMIT_SHA",
      "OPSIQ_INSTANCE_ID",
      "HOSTNAME",
      "npm_package_version",
    ]) {
      vi.stubEnv(key, "");
    }
  }

  it("precedence: VERCEL_DEPLOYMENT_ID wins when both identifiers exist", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_PRECEDENCE");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "c".repeat(40));
    const withBoth = (await loadStartupModules()).resolveInstanceId();

    // Same deployment id, different commit SHA => same key (deployment id won).
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "d".repeat(40));
    const shaChanged = (await loadStartupModules()).resolveInstanceId();
    expect(shaChanged).toBe(withBoth);

    // Commit SHA only => a different key, proving it is the fallback.
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    const shaOnly = (await loadStartupModules()).resolveInstanceId();
    expect(shaOnly).not.toBe(withBoth);
    expect(shaOnly).toMatch(/^dpl-[0-9a-f]{32}$/);
  });

  it("same deployment id is stable across repeated resolutions", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_STABLE");
    const m = await loadStartupModules();
    const first = m.resolveInstanceId();
    expect(m.resolveInstanceId()).toBe(first);
    expect(m.resolveInstanceId()).toBe(first);
  });

  it("empty and whitespace-only identifiers are treated as absent", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "   ");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "\t\n ");
    const m = await loadStartupModules();
    expect(() => m.resolveInstanceId()).toThrow(m.MissingDeploymentIdentityError);
  });

  it("surrounding whitespace on a real identifier is trimmed, not rejected", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "  dpl_TRIMMED  ");
    const trimmed = (await loadStartupModules()).resolveInstanceId();

    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_TRIMMED");
    expect((await loadStartupModules()).resolveInstanceId()).toBe(trimmed);
  });

  it("overlong and malformed identifiers still yield a bounded, indexable key", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");

    for (const raw of ["x".repeat(10_000), "dpl_ <>%&", "  ünïcødé-dpl  "]) {
      vi.stubEnv("VERCEL_DEPLOYMENT_ID", raw);
      const m = await loadStartupModules();
      const id = m.resolveInstanceId();
      expect(id).toMatch(/^dpl-[0-9a-f]{32}$/);
      expect(id.length).toBe(36);
      expect(id.length).toBeLessThanOrEqual(m.MAX_INSTANCE_ID_LENGTH);
      expect(Buffer.byteLength(id, "utf8")).toBe(36);
    }
  });

  it("production outside Vercel fails closed", async () => {
    clearIdentityEnv();
    vi.stubEnv("NODE_ENV", "production");
    const m = await loadStartupModules();
    expect(() => m.resolveInstanceId()).toThrow(m.MissingDeploymentIdentityError);
  });

  it("Vercel with system environment variables disabled fails closed", async () => {
    // With the setting off, VERCEL itself is absent too — NODE_ENV=production
    // is what still marks this as a deployment runtime.
    clearIdentityEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const m = await loadStartupModules();
    expect(() => m.resolveInstanceId()).toThrow(m.MissingDeploymentIdentityError);
    expect(m.resolveAppVersion()).toBe("unknown");
  });

  it("an explicit local override is honoured verbatim when well-formed", async () => {
    clearIdentityEnv();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OPSIQ_INSTANCE_ID", "ci-worker-7.local:1");
    const m = await loadStartupModules();
    expect(m.resolveInstanceId()).toBe("ci-worker-7.local:1");
  });

  it("an overlong or exotic local override is normalised to a bounded key", async () => {
    clearIdentityEnv();
    vi.stubEnv("NODE_ENV", "test");

    for (const raw of ["y".repeat(5_000), "has spaces and /slashes", "emoji-🚀"]) {
      vi.stubEnv("OPSIQ_INSTANCE_ID", raw);
      const m = await loadStartupModules();
      const id = m.resolveInstanceId();
      expect(id).toMatch(/^loc-[0-9a-f]{32}$/);
      expect(id.length).toBeLessThanOrEqual(m.MAX_INSTANCE_ID_LENGTH);
    }
  });

  it("the local fallback is used when no override is set", async () => {
    clearIdentityEnv();
    vi.stubEnv("NODE_ENV", "test");
    const m = await loadStartupModules();
    expect(m.resolveInstanceId()).toBe(m.LOCAL_INSTANCE_ID);
    expect(m.LOCAL_INSTANCE_ID.length).toBeLessThanOrEqual(m.MAX_INSTANCE_ID_LENGTH);
  });

  it("every accepted input produces a key that fits the instance_id column", async () => {
    const cases: Array<() => void> = [
      () => {
        clearIdentityEnv();
        vi.stubEnv("VERCEL", "1");
        vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_" + "z".repeat(500));
      },
      () => {
        clearIdentityEnv();
        vi.stubEnv("VERCEL", "1");
        vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "e".repeat(40));
      },
      () => {
        clearIdentityEnv();
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("OPSIQ_INSTANCE_ID", "w".repeat(2_000));
      },
      () => {
        clearIdentityEnv();
        vi.stubEnv("NODE_ENV", "test");
      },
    ];

    for (const setup of cases) {
      setup();
      const m = await loadStartupModules();
      const id = m.resolveInstanceId();
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(m.MAX_INSTANCE_ID_LENGTH);
      // btree index entries must stay well under the ~2704 byte limit.
      expect(Buffer.byteLength(id, "utf8")).toBeLessThan(2704);
    }
  });

  it("version identity prefers the commit SHA over npm_package_version", async () => {
    clearIdentityEnv();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_VERSION");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "f".repeat(40));
    vi.stubEnv("npm_package_version", "9.9.9");
    const m = await loadStartupModules();
    expect(m.resolveAppVersion()).toBe("f".repeat(12));

    // Deployment id only: still not "unknown".
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const m2 = await loadStartupModules();
    expect(m2.resolveAppVersion()).toMatch(/^dpl-[0-9a-f]{12}$/);
  });
});
