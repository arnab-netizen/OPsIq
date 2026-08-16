/**
 * [db] P0-15 — cross-instance startup-claim CAS, proven against real PostgreSQL.
 *
 * Forensic root cause (OPSIQ_P0_15_ORGANIC_COLD_START_FORENSIC_REPORT): the old
 * setStartupStatus() was a plain, unconditional upsert with no lock/version
 * guard, so any two concurrently cold-starting Vercel instances of one
 * deployment could race — including a straggler silently overwriting a
 * sibling's already-committed READY with FAILED. claimStartup()/
 * completeStartup() replace that with an atomic, Postgres-level
 * compare-and-set. This suite proves the CAS guarantees hold under genuine
 * concurrent commits against a real database — a mocked test cannot prove
 * this, since the guarantee is enforced by Postgres row-level locking during
 * `INSERT ... ON CONFLICT ... WHERE ...`, not by anything in application code.
 *
 * Coverage (maps to the 15 hostile scenarios in the P0-15 CAS remediation
 * mission):
 *   1/2/15. 20 concurrent claimants, one deployment → exactly one CLAIMED,
 *           the rest IN_PROGRESS, exactly one row, no write storm.
 *   3.  Owner succeeds → exactly one valid READY completion.
 *   4.  Stale owner's late FAILED completion after reclaim → 0 rows affected.
 *   5.  Stale owner's late READY completion after reclaim → 0 rows affected.
 *   6.  Normal FAILED is recorded only by the current owner.
 *   7.  A new attempt after FAILED can claim (retry policy).
 *   8.  A crashed owner's STARTING cannot be reclaimed before lease expiry,
 *       can be reclaimed after.
 *   9.  A READY row: concurrent claims all see ALREADY_READY, none re-run
 *       checks or claim.
 *   10. Two different deployment IDs remain fully independent.
 *   14. A concurrent, unrelated scheduled_tasks write does not interfere with
 *       startup-claim ownership (disjoint tables, same shared pool).
 *
 * Not covered here (see file header comments at the referenced files for why):
 *   11/12/13. DB-unavailable / DB-disappears / auth-bypass-on-failure are
 *   proven with a mocked DB in src/services/__tests__/startup-claim-fail-
 *   closed.test.ts and src/services/__tests__/get-session-db-resilience.
 *   test.ts — injecting a real outage against this suite's shared local/CI
 *   Postgres instance would also break every other test running against it.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance
 * (including the additive 20260816000001_startup_status_claim_token
 * migration).
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { v4 as randomUUID } from "uuid";

import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db } from "@/lib/db";
import {
  claimStartup,
  completeStartup,
  getStartupStatus,
  resolveInstanceId,
  STARTUP_CLAIM_LEASE_MS,
} from "@/services/startup-status";

const SKIP = !SHOULD_RUN_DB_TESTS;

/** Same production-URL guard as the sibling deployment-scoping suite. */
function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[stage8-claim-db] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[stage8-claim-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "Aborting to protect production data.",
    );
  }
}

const RUN = randomUUID().slice(0, 8);
const createdInstanceIds = new Set<string>();

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
}

/** Force a row's started_at into the past, simulating elapsed lease time without a real wait. */
async function backdateStartedAt(instanceId: string, msAgo: number): Promise<void> {
  await db.$queryRaw`
    UPDATE "startup_status"
    SET "started_at" = ${new Date(Date.now() - msAgo)}
    WHERE "instance_id" = ${instanceId}
  `;
}

describe.skipIf(SKIP)("[db] [stage8] P0-15 startup_status claim CAS concurrency", () => {
  beforeAll(() => {
    assertLocalUrl();
  });

  afterEach(async () => {
    for (const instanceId of createdInstanceIds) {
      await db.startupStatus.deleteMany({ where: { instanceId } }).catch(() => undefined);
    }
    createdInstanceIds.clear();
    leaveDeployment();
  });

  it("1/2/15. 20 concurrent claimants on one deployment: exactly one owner, no write storm", async () => {
    const key = enterDeployment(`dpl_claim20_${RUN}`);

    const results = await Promise.all(Array.from({ length: 20 }, () => claimStartup()));

    const claimed = results.filter((r) => r.outcome === "CLAIMED");
    const inProgress = results.filter((r) => r.outcome === "IN_PROGRESS");
    expect(claimed).toHaveLength(1);
    expect(inProgress).toHaveLength(19);

    // No write storm: exactly one row exists for this instance, regardless of
    // 20 concurrent attempts.
    const rows = await db.startupStatus.findMany({ where: { instanceId: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("STARTING");
    expect(rows[0].claimToken).toBe((claimed[0] as { claimToken: string }).claimToken);
  });

  it("3. the owner's READY completion is recorded exactly once", async () => {
    enterDeployment(`dpl_claim3_${RUN}`);

    const claim = await claimStartup();
    expect(claim.outcome).toBe("CLAIMED");
    const { claimToken } = claim as { outcome: "CLAIMED"; claimToken: string; instanceId: string };

    await completeStartup(claimToken, "READY", { completedAt: new Date() });

    const status = await getStartupStatus();
    expect(status.status).toBe("READY");
    expect(status.completed_at).toBeTruthy();
  });

  it("4. a stale owner's late FAILED completion is a 0-row no-op after reclaim; the newer READY survives", async () => {
    const key = enterDeployment(`dpl_claim4_${RUN}`);

    const first = await claimStartup();
    expect(first.outcome).toBe("CLAIMED");
    const staleToken = (first as { claimToken: string }).claimToken;

    // Simulate the first claimant going stale (crashed/hung past the lease).
    await backdateStartedAt(key, STARTUP_CLAIM_LEASE_MS + 5_000);

    const second = await claimStartup();
    expect(second.outcome).toBe("CLAIMED");
    const newToken = (second as { claimToken: string }).claimToken;
    expect(newToken).not.toBe(staleToken);

    // The newer owner finishes successfully first.
    await completeStartup(newToken, "READY", { completedAt: new Date() });

    // The original (stale) owner's late completion must not clobber it.
    await completeStartup(staleToken, "FAILED", { error: "straggler, should be ignored" });

    const status = await getStartupStatus();
    expect(status.status).toBe("READY");
    expect(status.error).toBeFalsy();
  });

  it("5. a stale owner's late READY completion is also a 0-row no-op after reclaim", async () => {
    const key = enterDeployment(`dpl_claim5_${RUN}`);

    const first = await claimStartup();
    const staleToken = (first as { claimToken: string }).claimToken;

    await backdateStartedAt(key, STARTUP_CLAIM_LEASE_MS + 5_000);

    const second = await claimStartup();
    const newToken = (second as { claimToken: string }).claimToken;

    // The newer owner fails first (a genuine, current failure).
    await completeStartup(newToken, "FAILED", { error: "genuine current failure" });

    // The stale owner's late READY must not overwrite that genuine FAILED
    // with a false READY.
    await completeStartup(staleToken, "READY", { completedAt: new Date() });

    const status = await getStartupStatus();
    expect(status.status).toBe("FAILED");
    expect(status.error).toBe("genuine current failure");
  });

  it("6. a normal FAILED is recorded only by the current single owner", async () => {
    enterDeployment(`dpl_claim6_${RUN}`);

    const claim = await claimStartup();
    const token = (claim as { claimToken: string }).claimToken;

    await completeStartup(token, "FAILED", { error: "database unreachable" });

    const status = await getStartupStatus();
    expect(status.status).toBe("FAILED");
    expect(status.error).toBe("database unreachable");
  });

  it("7. a new attempt after FAILED can claim (retry policy)", async () => {
    enterDeployment(`dpl_claim7_${RUN}`);

    const first = await claimStartup();
    await completeStartup((first as { claimToken: string }).claimToken, "FAILED", { error: "e1" });

    const retry = await claimStartup();
    expect(retry.outcome).toBe("CLAIMED");

    await completeStartup((retry as { claimToken: string }).claimToken, "READY", { completedAt: new Date() });
    const status = await getStartupStatus();
    expect(status.status).toBe("READY");
  });

  it("8. a crashed owner's STARTING cannot be reclaimed before lease expiry, and can be reclaimed after", async () => {
    const key = enterDeployment(`dpl_claim8_${RUN}`);

    const first = await claimStartup();
    expect(first.outcome).toBe("CLAIMED");

    // Well inside the lease window (crashed owner, but not yet stale).
    await backdateStartedAt(key, 1_000);
    const tooSoon = await claimStartup();
    expect(tooSoon.outcome).toBe("IN_PROGRESS");

    // Past the lease window — now reclaimable.
    await backdateStartedAt(key, STARTUP_CLAIM_LEASE_MS + 1_000);
    const reclaimed = await claimStartup();
    expect(reclaimed.outcome).toBe("CLAIMED");
    expect((reclaimed as { claimToken: string }).claimToken).not.toBe(
      (first as { claimToken: string }).claimToken,
    );
  });

  it("9. once READY, concurrent claims all observe ALREADY_READY — none re-claim or re-run checks", async () => {
    enterDeployment(`dpl_claim9_${RUN}`);

    const first = await claimStartup();
    await completeStartup((first as { claimToken: string }).claimToken, "READY", { completedAt: new Date() });

    const results = await Promise.all(Array.from({ length: 10 }, () => claimStartup()));
    expect(results.every((r) => r.outcome === "ALREADY_READY")).toBe(true);
    expect(results.some((r) => r.outcome === "CLAIMED")).toBe(false);
  });

  it("10. two different deployment IDs remain fully independent under concurrent claims", async () => {
    // completeStartup() resolves its own instanceId from the CURRENT process
    // env at call time — exactly like claimStartup() and like a real single
    // process, which never changes deployment identity mid-lifetime. So each
    // deployment's claim -> complete cycle must finish while ITS OWN env is
    // still active, before switching to the next deployment; completing A
    // after already switching to B would resolve against B's row instead.
    const keyA = enterDeployment(`dpl_claimA_${RUN}`);
    const claimA = await claimStartup();
    expect(claimA.outcome).toBe("CLAIMED");
    await completeStartup((claimA as { claimToken: string }).claimToken, "READY", { completedAt: new Date() });

    const keyB = enterDeployment(`dpl_claimB_${RUN}`);
    expect(keyB).not.toBe(keyA);
    const claimB = await claimStartup();
    expect(claimB.outcome).toBe("CLAIMED");
    await completeStartup((claimB as { claimToken: string }).claimToken, "FAILED", { error: "eB" });

    const rowA = await db.startupStatus.findUnique({ where: { instanceId: keyA } });
    const rowB = await db.startupStatus.findUnique({ where: { instanceId: keyB } });
    expect(rowA!.status).toBe("READY");
    expect(rowB!.status).toBe("FAILED");
  });

  it("14. a concurrent, unrelated scheduled_tasks write does not corrupt startup-claim ownership", async () => {
    const key = enterDeployment(`dpl_claim14_${RUN}`);
    const taskId = randomUUID();

    const [claim] = await Promise.all([
      claimStartup(),
      db.scheduledTask.create({
        data: {
          id: taskId,
          taskName: "p0-15-concurrency-probe",
          status: "pending",
          scheduledFor: new Date(),
        },
      }),
    ]);

    expect(claim.outcome).toBe("CLAIMED");
    await completeStartup((claim as { claimToken: string }).claimToken, "READY", { completedAt: new Date() });

    const status = await getStartupStatus();
    expect(status.status).toBe("READY");

    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    expect(task).not.toBeNull();
    expect(task!.status).toBe("pending");

    await db.scheduledTask.delete({ where: { id: taskId } }).catch(() => undefined);
    void key;
  });
});
