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
