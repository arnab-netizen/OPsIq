/**
 * [db] Stage 8 — startup_status deployment scoping, proven against real PostgreSQL.
 *
 * The unit suite (startup-deployment-scoping.test.ts) proves the resolver and
 * orchestrator logic against an in-memory table. This suite proves the same
 * contract through the REAL Prisma client and a REAL migrated schema, so the
 * unique index on startup_status.instance_id, the generated key length, and the
 * per-deployment row separation are exercised by the database itself.
 *
 * Coverage:
 *  1. Schema: startup_status exists with its UNIQUE index on instance_id.
 *  2. Deployment A and deployment B occupy distinct rows.
 *  3. A legacy instance_id='unknown' READY row is preserved but never read.
 *  4. Repeated calls within one deployment are idempotent (exactly one row).
 *  5. A configured workspace that exists drives startup to READY.
 *  6. A configured workspace that is missing drives startup to FAILED.
 *  7. Generated keys insert without any uniqueness or length failure.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db } from "@/lib/db";
import {
  getStartupStatus,
  setStartupStatus,
  resolveInstanceId,
  MAX_INSTANCE_ID_LENGTH,
} from "@/services/startup-status";
import { ensureStartupComplete } from "@/infra/startup-orchestrator";

const SKIP = !SHOULD_RUN_DB_TESTS;

/**
 * Production-URL guard — this suite writes real rows, so it may only ever run
 * against a local throwaway PostgreSQL instance.
 */
function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[stage8-db] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[stage8-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "Aborting to protect production data.",
    );
  }
}

// Unique per run so parallel/repeat runs never collide.
const RUN = randomUUID().slice(0, 8);
const DEPLOYMENT_A = `dpl_A_${RUN}`;
const DEPLOYMENT_B = `dpl_B_${RUN}`;
const LEGACY_INSTANCE_ID = `unknown-legacy-${RUN}`;

const createdInstanceIds = new Set<string>();
const createdWorkspaceIds = new Set<string>();

/** Put the process into deployment `id`'s runtime and return its instance key. */
function enterDeployment(id: string): string {
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_DEPLOYMENT_ID = id;
  process.env.VERCEL_GIT_COMMIT_SHA = "";
  delete process.env.HOSTNAME;
  delete process.env.npm_package_version;
  const key = resolveInstanceId();
  createdInstanceIds.add(key);
  return key;
}

function leaveDeployment(): void {
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
}

describe.skipIf(SKIP)("[db] [stage8] startup_status deployment scoping", () => {
  beforeAll(() => {
    assertLocalUrl();
  });

  afterEach(() => {
    leaveDeployment();
  });

  afterAll(async () => {
    for (const instanceId of createdInstanceIds) {
      await db.startupStatus.deleteMany({ where: { instanceId } }).catch(() => undefined);
    }
    await db.startupStatus
      .deleteMany({ where: { instanceId: LEGACY_INSTANCE_ID } })
      .catch(() => undefined);
    for (const id of createdWorkspaceIds) {
      await db.workspace.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("1. startup_status exists with a UNIQUE index on instance_id", async () => {
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'startup_status'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(["instance_id", "status", "version"]));

    const indexes = await db.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'startup_status'
    `;
    expect(indexes.some((i) => /CREATE UNIQUE INDEX .*instance_id/.test(i.indexdef))).toBe(true);
  });

  it("2. deployment A and deployment B occupy distinct rows", async () => {
    const keyA = enterDeployment(DEPLOYMENT_A);
    await setStartupStatus("READY", { completedAt: new Date() });
    const seenByA = await getStartupStatus();
    expect(seenByA.status).toBe("READY");

    const keyB = enterDeployment(DEPLOYMENT_B);
    expect(keyB).not.toBe(keyA);
    const seenByB = await getStartupStatus();
    expect(seenByB.status).toBe("NOT_STARTED");

    await setStartupStatus("READY", { completedAt: new Date() });

    const rowA = await db.startupStatus.findUnique({ where: { instanceId: keyA } });
    const rowB = await db.startupStatus.findUnique({ where: { instanceId: keyB } });
    expect(rowA).not.toBeNull();
    expect(rowB).not.toBeNull();
    expect(rowA!.id).not.toBe(rowB!.id);
  });

  it("3. a legacy 'unknown' READY row is preserved but never read", async () => {
    const legacyUpdatedAt = new Date("2026-07-31T10:55:10.162Z");
    await db.startupStatus.create({
      data: {
        instanceId: LEGACY_INSTANCE_ID,
        status: "READY",
        version: "unknown",
        startedAt: new Date("2026-07-31T10:55:09.899Z"),
        completedAt: new Date("2026-07-31T10:55:10.152Z"),
        updatedAt: legacyUpdatedAt,
      },
    });

    const key = enterDeployment(`dpl_C_${RUN}`);
    expect(key).not.toBe(LEGACY_INSTANCE_ID);

    // The corrected deployment must not inherit the legacy row's READY.
    const status = await getStartupStatus();
    expect(status.status).toBe("NOT_STARTED");

    await setStartupStatus("READY", { completedAt: new Date() });

    const legacy = await db.startupStatus.findUnique({
      where: { instanceId: LEGACY_INSTANCE_ID },
    });
    expect(legacy).not.toBeNull();
    expect(legacy!.status).toBe("READY");
    expect(legacy!.version).toBe("unknown");
    expect(legacy!.updatedAt.toISOString()).toBe(legacyUpdatedAt.toISOString());
  });

  it("4. repeated calls within one deployment stay idempotent", async () => {
    const key = enterDeployment(`dpl_D_${RUN}`);

    await setStartupStatus("STARTING");
    await setStartupStatus("READY", { completedAt: new Date() });
    await setStartupStatus("READY", { completedAt: new Date() });

    const rows = await db.startupStatus.findMany({ where: { instanceId: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("READY");
  });

  it("5. a configured workspace that exists drives startup to READY", async () => {
    const workspaceId = randomUUID();
    createdWorkspaceIds.add(workspaceId);
    await db.workspace.create({
      data: {
        id: workspaceId,
        name: `stage8-scoping-${RUN}`,
        slug: `stage8-scoping-${RUN}`,
        isActive: true,
      },
    });

    enterDeployment(`dpl_E_${RUN}`);
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = workspaceId;

    await ensureStartupComplete();

    const status = await getStartupStatus();
    expect(status.status).toBe("READY");
    expect(status.completed_at).toBeTruthy();
    expect(status.version).not.toBe("unknown");
  });

  it("6. a configured workspace that is missing drives startup to FAILED", async () => {
    enterDeployment(`dpl_F_${RUN}`);
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = randomUUID(); // never created

    await expect(ensureStartupComplete()).rejects.toThrow();

    const status = await getStartupStatus();
    expect(status.status).toBe("FAILED");
    expect(status.error).toBeTruthy();
  });

  it("7. generated keys insert with no uniqueness or length failure", async () => {
    // An absurdly long raw identifier still yields a bounded, indexable key.
    const key = enterDeployment(`dpl_G_${RUN}_${"z".repeat(5000)}`);
    expect(key.length).toBeLessThanOrEqual(MAX_INSTANCE_ID_LENGTH);

    await setStartupStatus("STARTING");
    // Re-writing the same key must UPDATE, never violate the unique index.
    await expect(setStartupStatus("READY", { completedAt: new Date() })).resolves.toBeUndefined();

    const rows = await db.startupStatus.findMany({ where: { instanceId: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].instanceId.length).toBeLessThanOrEqual(MAX_INSTANCE_ID_LENGTH);
  });
});
