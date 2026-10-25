/**
 * Atomicity proof for scripts/provision-beta-request-operator.ts's grant/revoke
 * paths (AUDIT-01): the UserRoleAssignment mutation and its audit event must
 * commit or roll back together, never one without the other. Both paths run
 * inside `db.$transaction`, with `emitAuditEvent` given the same transaction
 * client (see infra/audit.ts's `AuditClient`) -- same pattern as
 * services/owner-mode/owner-action-outcome.service.ts.
 *
 * Tests the extracted grantBetaRequestOperator/revokeBetaRequestOperator
 * functions directly against a real database -- transaction rollback
 * semantics cannot be faithfully proven against a mocked Prisma client, and
 * these two functions are the actual atomic units this diff introduces.
 * `emitAuditEvent` is wrapped with `vi.fn(actual)` (calls through by default)
 * so a single test can force it to throw and prove the assignment mutation
 * rolls back with it, without disturbing every other test's real behavior.
 *
 * CLI-level guard behaviors this diff does NOT touch -- dry-run performs zero
 * writes, wrong --workspace-id refuses, wrong --confirm refuses -- are
 * covered separately below by spawning the actual CLI script, since those are
 * main()'s argv-driven orchestration rather than the transactional logic
 * under test here.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/provision-beta-request-operator.db.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import path from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/infra/audit", async () => {
  const actual = await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit");
  return { ...actual, emitAuditEvent: vi.fn(actual.emitAuditEvent) };
});

import { emitAuditEvent } from "@/infra/audit";
import {
  grantBetaRequestOperator,
  revokeBetaRequestOperator,
} from "../../../scripts/provision-beta-request-operator";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);

async function seedUser(): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `provision-atomicity-${userId}@example.com`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
  return { userId, email };
}

async function cleanupUser(userId: string) {
  await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
  await db.user.delete({ where: { id: userId } }).catch(() => undefined);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-beta-request-operator — grant/revoke atomicity", () => {
  let seededUserId: string | null = null;
  const seededAuditEventIds: string[] = [];

  afterEach(async () => {
    // vi.fn(actual.emitAuditEvent) (see vi.mock factory above) keeps the real
    // implementation as its permanent base; mockImplementationOnce below only
    // overrides a single call, so nothing needs resetting here beyond call history.
    mockedEmitAuditEvent.mockClear();
    if (seededAuditEventIds.length > 0) {
      await db.auditEvent.deleteMany({ where: { id: { in: seededAuditEventIds } } }).catch(() => undefined);
      seededAuditEventIds.length = 0;
    }
    if (seededUserId) {
      await cleanupUser(seededUserId);
      seededUserId = null;
    }
  });

  it("[db] grant success creates the assignment and an audit event together", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: result.assignmentId } });
    expect(assignment).not.toBeNull();
    expect(assignment?.role).toBe("beta_request_operator");
    expect(assignment?.scope).toBe("workspace");
    expect(assignment?.scopeId).toBe(workspaceId);
    expect(assignment?.isActive).toBe(true);

    const auditEvent = await db.auditEvent.findUnique({ where: { id: result.auditEventId } });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.eventName).toBe("role.assigned");
    expect(auditEvent?.entityId).toBe(result.assignmentId);
  });

  it("[db] revoke success deactivates the assignment and creates an audit event together", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const granted = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(granted.auditEventId);

    const revoked = await revokeBetaRequestOperator({
      assignmentId: granted.assignmentId,
      userId,
      email,
      workspaceId,
    });
    seededAuditEventIds.push(revoked.auditEventId);

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: granted.assignmentId } });
    expect(assignment?.isActive).toBe(false);
    expect(assignment?.revokedAt).not.toBeNull();

    const auditEvent = await db.auditEvent.findUnique({ where: { id: revoked.auditEventId } });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.eventName).toBe("role.revoked");
    expect(auditEvent?.entityId).toBe(granted.assignmentId);
  });

  it("[db] a simulated audit failure during grant rolls back the assignment creation (no orphaned row)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_GRANT");
    });

    await expect(grantBetaRequestOperator({ userId, email, workspaceId })).rejects.toThrow(
      "SIMULATED_AUDIT_FAILURE_ON_GRANT"
    );

    const assignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(assignments).toHaveLength(0);
  });

  it("[db] a simulated audit failure during revoke rolls back the assignment deactivation (assignment stays active)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const granted = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(granted.auditEventId);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REVOKE");
    });

    await expect(
      revokeBetaRequestOperator({ assignmentId: granted.assignmentId, userId, email, workspaceId })
    ).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REVOKE");

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: granted.assignmentId } });
    expect(assignment?.isActive).toBe(true);
    expect(assignment?.revokedAt).toBeNull();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-beta-request-operator CLI — guard behaviors unchanged by the atomicity refactor", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-beta-request-operator.ts");
  let seededUserId: string | null = null;
  let seededWorkspaceId: string | null = null;

  afterEach(async () => {
    if (seededUserId) {
      await db.userRoleAssignment.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.user.delete({ where: { id: seededUserId } }).catch(() => undefined);
      seededUserId = null;
    }
    if (seededWorkspaceId) {
      await db.workspace.delete({ where: { id: seededWorkspaceId } }).catch(() => undefined);
      seededWorkspaceId = null;
    }
  });

  async function seedActorWithWorkspace() {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const email = `provision-cli-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision CLI WS", slug: `provision-cli-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    seededUserId = userId;
    seededWorkspaceId = workspaceId;
    return { userId, workspaceId, email };
  }

  // A cold `npx tsx` child (its own tsx/esbuild transform + Prisma client init,
  // sharing the machine with the already-running vitest worker) can take longer
  // than a plain script invocation. Generous but bounded, and under each test's
  // own extended per-test timeout below.
  const CHILD_TIMEOUT_MS = 25_000;

  function runScript(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: process.env,
        timeout: CHILD_TIMEOUT_MS,
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error: any) {
      return {
        status: typeof error.status === "number" ? error.status : 1,
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? ""),
      };
    }
  }

  it("[db] dry run (no --apply) performs zero writes", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dry run only");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --workspace-id still refuses (no writes)", async () => {
    const { email } = await seedActorWithWorkspace();
    const wrongWorkspaceId = randomUUID();

    const result = runScript(["--email", email, "--workspace-id", wrongWorkspaceId]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Mismatch");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --confirm phrase still refuses to apply (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--apply",
      "--confirm",
      "WRONG PHRASE",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--confirm must be exactly");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);
});

// ─── Re-grant after revoke (UserRoleAssignment is UNIQUE on userId+role+scope+scopeId) ────────────────────
// A revoke keeps the row (history). The old grant path looked only for an ACTIVE row and then INSERTed the
// same unique tuple, so GRANT → REVOKE → GRANT failed with a unique-constraint error. These tests run the
// real transaction against real Postgres: the re-grant must REACTIVATE the same row and audit it atomically.
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-beta-request-operator — grant → revoke → re-grant lifecycle", () => {
  const ROLE_VALUE = "beta_request_operator";
  const SCOPE = "workspace";
  let seededUserId: string | null = null;
  const seededEntityIds: string[] = [];
  const track = (_auditEventId: string | null) => undefined;

  afterEach(async () => {
    mockedEmitAuditEvent.mockReset();
    mockedEmitAuditEvent.mockImplementation((await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit")).emitAuditEvent);
    if (seededEntityIds.length > 0) {
      await db.auditEvent.deleteMany({ where: { entityId: { in: seededEntityIds } } }).catch(() => undefined);
      seededEntityIds.length = 0;
    }
    if (seededUserId) {
      await cleanupUser(seededUserId);
      seededUserId = null;
    }
  });

  const events = (assignmentId: string) =>
    db.auditEvent.findMany({ where: { entityId: assignmentId, entityType: "user_role_assignment" }, orderBy: { occurredAt: "asc" } });
  const rows = (userId: string, workspaceId: string) =>
    db.userRoleAssignment.findMany({ where: { userId, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId } });

  it("[db] first grant → duplicate grant → revoke → second revoke → re-grant: one row, same id, auditable sequence", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    // 1. first grant: exactly one active row + ROLE_ASSIGNED
    const g1 = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededEntityIds.push(g1.assignmentId);
    expect(g1.outcome).toBe("created");
    const afterG1 = await rows(userId, workspaceId);
    expect(afterG1).toHaveLength(1);
    expect(afterG1[0]).toMatchObject({ id: g1.assignmentId, isActive: true, revokedAt: null, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId });

    // 2. duplicate grant while active: idempotent, nothing written, nothing audited
    const dup = await grantBetaRequestOperator({ userId, email, workspaceId });
    expect(dup).toMatchObject({ outcome: "already_active", assignmentId: g1.assignmentId, auditEventId: null });
    expect(await rows(userId, workspaceId)).toHaveLength(1);
    expect(await events(g1.assignmentId)).toHaveLength(1);

    // 3. revoke: SAME row kept, inactive + revokedAt set + ROLE_REVOKED
    const rv = await revokeBetaRequestOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    expect(rv.outcome).toBe("revoked");
    const afterRv = await rows(userId, workspaceId);
    expect(afterRv).toHaveLength(1);
    expect(afterRv[0]).toMatchObject({ id: g1.assignmentId, isActive: false });
    expect(afterRv[0]!.revokedAt).not.toBeNull();

    // 4. second revoke: deterministic no-op (revokedAt unchanged, no extra audit)
    const rv2 = await revokeBetaRequestOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    expect(rv2).toMatchObject({ outcome: "already_revoked", auditEventId: null });
    const afterRv2 = await rows(userId, workspaceId);
    expect(afterRv2[0]!.revokedAt!.getTime()).toBe(afterRv[0]!.revokedAt!.getTime());
    expect(await events(g1.assignmentId)).toHaveLength(2);

    // 5. re-grant: SUCCEEDS (the old code failed here), reactivating the same row
    const g2 = await grantBetaRequestOperator({ userId, email, workspaceId });
    expect(g2.outcome).toBe("reactivated");
    expect(g2.assignmentId).toBe(g1.assignmentId);
    const afterG2 = await rows(userId, workspaceId);
    expect(afterG2).toHaveLength(1);
    expect(afterG2[0]).toMatchObject({ id: g1.assignmentId, isActive: true, revokedAt: null, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId });
    expect(afterG2[0]!.grantedAt.getTime()).toBeGreaterThanOrEqual(afterG1[0]!.grantedAt.getTime());

    // 6. the audit trail reconstructs the whole cycle in order
    const trail = await events(g1.assignmentId);
    expect(trail.map((e) => e.eventName)).toEqual(["role.assigned", "role.revoked", "role.assigned"]);
    const reactivation = trail[2]!.payload as Record<string, unknown>;
    expect(reactivation).toMatchObject({ reactivated: true, role: ROLE_VALUE, targetUserId: userId });
    expect(reactivation.previousRevokedAt).toBe(afterRv[0]!.revokedAt!.toISOString());
    expect(reactivation.previousGrantedAt).toBe(afterG1[0]!.grantedAt.toISOString());
    expect((trail[0]!.payload as Record<string, unknown>).reactivated).toBeUndefined();
  });

  it("[db] an audit failure during REACTIVATION rolls the reactivation back (assignment stays revoked, nothing audited)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();
    const g1 = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededEntityIds.push(g1.assignmentId);
    await revokeBetaRequestOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    const before = (await rows(userId, workspaceId))[0]!;
    expect(before.isActive).toBe(false);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REACTIVATION");
    });
    await expect(grantBetaRequestOperator({ userId, email, workspaceId })).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REACTIVATION");

    const after = (await rows(userId, workspaceId))[0]!;
    expect(await rows(userId, workspaceId)).toHaveLength(1);
    expect(after.isActive).toBe(false);
    expect(after.revokedAt!.getTime()).toBe(before.revokedAt!.getTime());
    expect(after.grantedAt.getTime()).toBe(before.grantedAt.getTime());
    expect(await events(g1.assignmentId)).toHaveLength(2);
  });

});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-beta-request-operator CLI — grant → revoke → re-grant (real subprocess, real Postgres)", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-beta-request-operator.ts");
  const EXPECTED_DB_HOST = new URL(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "").hostname;
  const GRANT = "GRANT BETA REQUEST OPERATOR";
  const REVOKE = "REVOKE BETA REQUEST OPERATOR";
  let userId: string | null = null;
  let workspaceId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await db.auditEvent.deleteMany({ where: { payload: { path: ["targetUserId"], equals: userId } } }).catch(() => undefined);
      await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
      userId = null;
    }
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
      workspaceId = null;
    }
  });

  function run(args: string[]): { status: number; stdout: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], { encoding: "utf8", env: process.env, timeout: 25_000 });
      return { status: 0, stdout };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return { status: typeof e.status === "number" ? e.status : 1, stdout: String(e.stdout ?? "") + String(e.stderr ?? "") };
    }
  }

  it("[db] GRANT, REVOKE, GRANT again via the CLI succeeds, reactivating the same single row and never touching the unique constraint", async () => {
    userId = randomUUID();
    workspaceId = randomUUID();
    const email = `provision-beta-request-operator-regrant-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "regrant WS", slug: `regrant-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    const base = ["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST, "--apply"];

    const g1 = run([...base, "--confirm", GRANT]);
    expect(g1.status).toBe(0);
    const rv = run([...base, "--revoke", "--confirm", REVOKE]);
    expect(rv.status).toBe(0);
    const rv2 = run([...base, "--revoke", "--confirm", REVOKE]);
    expect(rv2.status).toBe(0);
    expect(rv2.stdout).toContain("nothing to revoke");

    const mid = await db.userRoleAssignment.findMany({ where: { userId, role: "beta_request_operator" } });
    expect(mid).toHaveLength(1);
    expect(mid[0]!.isActive).toBe(false);

    const g2 = run([...base, "--confirm", GRANT]);
    expect(g2.status).toBe(0);
    expect(g2.stdout).not.toContain("Unique constraint");
    expect(g2.stdout).toContain("reactivated existing revoked assignment");

    const end = await db.userRoleAssignment.findMany({ where: { userId, role: "beta_request_operator" } });
    expect(end).toHaveLength(1);
    expect(end[0]!.id).toBe(mid[0]!.id);
    expect(end[0]).toMatchObject({ isActive: true, revokedAt: null });
    const g3 = run([...base, "--confirm", GRANT]);
    expect(g3.status).toBe(0);
    expect(g3.stdout).toContain("already holds an active");
    expect(await db.userRoleAssignment.count({ where: { userId, role: "beta_request_operator" } })).toBe(1);
  }, 120_000);

  it("[db] a dry run on a revoked assignment announces the reactivation and performs zero writes", async () => {
    userId = randomUUID();
    workspaceId = randomUUID();
    const email = `provision-beta-request-operator-dry-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "dry WS", slug: `dry-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    const common = ["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST];
    expect(run([...common, "--apply", "--confirm", GRANT]).status).toBe(0);
    expect(run([...common, "--apply", "--revoke", "--confirm", REVOKE]).status).toBe(0);
    const before = await db.userRoleAssignment.findFirst({ where: { userId, role: "beta_request_operator" } });
    const auditsBefore = await db.auditEvent.count({ where: { payload: { path: ["targetUserId"], equals: userId } } });

    const dry = run(common);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("will REACTIVATE that same row");
    expect(dry.stdout).toContain("Dry run only");

    const after = await db.userRoleAssignment.findFirst({ where: { userId, role: "beta_request_operator" } });
    expect(after).toMatchObject({ id: before!.id, isActive: false });
    expect(after!.revokedAt!.getTime()).toBe(before!.revokedAt!.getTime());
    expect(await db.auditEvent.count({ where: { payload: { path: ["targetUserId"], equals: userId } } })).toBe(auditsBefore);
  }, 120_000);
});
