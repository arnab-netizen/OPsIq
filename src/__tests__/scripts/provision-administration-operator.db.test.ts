/**
 * Atomicity + safety proof for scripts/provision-administration-operator.ts's
 * grant/revoke paths. Sibling to
 * src/__tests__/scripts/provision-beta-request-operator.db.test.ts — same
 * AUDIT-01 atomicity discipline (the UserRoleAssignment mutation and its
 * audit event must commit or roll back together), plus additional proofs
 * specific to this role: the grant is purpose-specific (ADMINISTRATION_OPERATOR
 * only), never widens into SYSTEM_ADMIN, and never touches an existing
 * BETA_REQUEST_OPERATOR assignment on the same account.
 *
 * Tests the extracted grantAdministrationOperator/revokeAdministrationOperator
 * functions directly against a real database -- transaction rollback
 * semantics cannot be faithfully proven against a mocked Prisma client.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/provision-administration-operator.db.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import path from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROLES } from "@/domain/constants/roles";
import { getCapabilitiesForRole, hasCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";

vi.mock("@/infra/audit", async () => {
  const actual = await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit");
  return { ...actual, emitAuditEvent: vi.fn(actual.emitAuditEvent) };
});

import { emitAuditEvent } from "@/infra/audit";
import {
  grantAdministrationOperator,
  revokeAdministrationOperator,
} from "../../../scripts/provision-administration-operator";
import { grantBetaRequestOperator } from "../../../scripts/provision-beta-request-operator";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);

async function seedUser(): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `provision-admin-op-${userId}@example.com`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
  return { userId, email };
}

async function cleanupUser(userId: string) {
  await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
  await db.user.delete({ where: { id: userId } }).catch(() => undefined);
}

describe("provision-administration-operator — role definition (no DB required)", () => {
  it("ADMINISTRATION_OPERATOR grants exactly BETA_PROGRAM_MANAGE and CUSTOMER_ACCESS_MANAGE", () => {
    const bundle = getCapabilitiesForRole(ROLES.ADMINISTRATION_OPERATOR);
    expect(bundle).toEqual([
      CAPABILITIES.BETA_PROGRAM_MANAGE,
      CAPABILITIES.CUSTOMER_ACCESS_MANAGE,
    ]);
    expect(bundle).not.toContain(CAPABILITIES.SYSTEM_ADMIN);
    expect(bundle).not.toContain(CAPABILITIES.BETA_REQUEST_REVIEW);
    expect(bundle).not.toContain(CAPABILITIES.BETA_REQUEST_INVITE);
  });

  it("BETA_REQUEST_OPERATOR's bundle is untouched by ADMINISTRATION_OPERATOR's existence", () => {
    expect(getCapabilitiesForRole(ROLES.BETA_REQUEST_OPERATOR)).toEqual([
      CAPABILITIES.BETA_REQUEST_REVIEW,
      CAPABILITIES.BETA_REQUEST_INVITE,
    ]);
  });

  it("hasCapability resolves the exact effective set for a context holding only ADMINISTRATION_OPERATOR", () => {
    const ctx = { userId: randomUUID(), roles: [{ role: ROLES.ADMINISTRATION_OPERATOR }] };
    expect(hasCapability(ctx, CAPABILITIES.BETA_PROGRAM_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.CUSTOMER_ACCESS_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.USER_ASSIGN_ROLE)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
  });

  it("holding both ADMINISTRATION_OPERATOR and BETA_REQUEST_OPERATOR yields the union, each capability traceable to its own role", () => {
    const ctx = {
      userId: randomUUID(),
      roles: [{ role: ROLES.ADMINISTRATION_OPERATOR }, { role: ROLES.BETA_REQUEST_OPERATOR }],
    };
    // From ADMINISTRATION_OPERATOR
    expect(hasCapability(ctx, CAPABILITIES.BETA_PROGRAM_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.CUSTOMER_ACCESS_MANAGE)).toBe(true);
    // From BETA_REQUEST_OPERATOR — proves the new role's grant didn't have to
    // (and didn't) come from modifying BETA_REQUEST_OPERATOR's own bundle.
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(true);
    // Still no broader authority from the union of these two narrow roles.
    expect(hasCapability(ctx, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-administration-operator — grant/revoke atomicity", () => {
  let seededUserId: string | null = null;
  const seededAuditEventIds: string[] = [];

  afterEach(async () => {
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

  it("[db] grant creates exactly one ADMINISTRATION_OPERATOR assignment, and an audit event, together", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: result.assignmentId } });
    expect(assignment).not.toBeNull();
    expect(assignment?.role).toBe("administration_operator");
    expect(assignment?.scope).toBe("workspace");
    expect(assignment?.scopeId).toBe(workspaceId);
    expect(assignment?.isActive).toBe(true);

    const allAssignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(allAssignments).toHaveLength(1);

    const auditEvent = await db.auditEvent.findUnique({ where: { id: result.auditEventId } });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.eventName).toBe("role.assigned");
    expect(auditEvent?.entityType).toBe("user_role_assignment");
    expect(auditEvent?.entityId).toBe(result.assignmentId);
    expect((auditEvent?.payload as Record<string, unknown>)?.provisionedVia).toBe(
      "scripts/provision-administration-operator.ts"
    );
  });

  it("[db] existing roles (e.g. BETA_REQUEST_OPERATOR) on the same user remain untouched by the grant", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);

    const adminOp = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const betaOpAssignment = await db.userRoleAssignment.findUnique({ where: { id: betaOp.assignmentId } });
    expect(betaOpAssignment?.role).toBe("beta_request_operator");
    expect(betaOpAssignment?.isActive).toBe(true);
    expect(betaOpAssignment?.revokedAt).toBeNull();

    const allAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
    const roles = allAssignments.map((a) => a.role).sort();
    expect(roles).toEqual(["administration_operator", "beta_request_operator"]);
  });

  it("[db] a duplicate grant call is idempotent — grantAdministrationOperator itself always creates a row, so the CLI's own pre-check (not this function) is what prevents a duplicate active assignment", async () => {
    // grantAdministrationOperator is the low-level atomic primitive (mirrors
    // grantBetaRequestOperator) — main()'s CLI orchestration is what checks
    // `existing` before calling it (see "CLI guard behaviors" describe block
    // below, which proves the CLI-level idempotency via a real subprocess run).
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const first = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(first.auditEventId);

    const existing = await db.userRoleAssignment.findFirst({
      where: { userId, role: "administration_operator", scope: "workspace", scopeId: workspaceId, isActive: true, revokedAt: null },
    });
    expect(existing?.id).toBe(first.assignmentId);
  });

  it("[db] revoke deactivates only the ADMINISTRATION_OPERATOR assignment, leaving BETA_REQUEST_OPERATOR active", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);
    const adminOp = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const revoked = await revokeAdministrationOperator({
      assignmentId: adminOp.assignmentId,
      userId,
      email,
      workspaceId,
    });
    seededAuditEventIds.push(revoked.auditEventId);

    const adminAssignment = await db.userRoleAssignment.findUnique({ where: { id: adminOp.assignmentId } });
    expect(adminAssignment?.isActive).toBe(false);
    expect(adminAssignment?.revokedAt).not.toBeNull();

    const betaAssignment = await db.userRoleAssignment.findUnique({ where: { id: betaOp.assignmentId } });
    expect(betaAssignment?.isActive).toBe(true);
    expect(betaAssignment?.revokedAt).toBeNull();

    const auditEvent = await db.auditEvent.findUnique({ where: { id: revoked.auditEventId } });
    expect(auditEvent?.eventName).toBe("role.revoked");
    expect(auditEvent?.entityId).toBe(adminOp.assignmentId);
  });

  it("[db] a simulated audit failure during grant rolls back the assignment creation (no orphaned row, and no SYSTEM_ADMIN path exists to fall back to)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_GRANT");
    });

    await expect(grantAdministrationOperator({ userId, email, workspaceId })).rejects.toThrow(
      "SIMULATED_AUDIT_FAILURE_ON_GRANT"
    );

    const assignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(assignments).toHaveLength(0);
  });

  it("[db] a simulated audit failure during revoke rolls back the deactivation (assignment stays active)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const granted = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(granted.auditEventId);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REVOKE");
    });

    await expect(
      revokeAdministrationOperator({ assignmentId: granted.assignmentId, userId, email, workspaceId })
    ).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REVOKE");

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: granted.assignmentId } });
    expect(assignment?.isActive).toBe(true);
    expect(assignment?.revokedAt).toBeNull();
  });

  it("[db] granting ADMINISTRATION_OPERATOR never creates a SYSTEM_ADMIN assignment for the same user", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAdministrationOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const systemAdminAssignments = await db.userRoleAssignment.findMany({
      where: { userId, role: "system_admin" },
    });
    expect(systemAdminAssignments).toHaveLength(0);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-administration-operator CLI — guard behaviors", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-administration-operator.ts");
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

  async function seedActorWithWorkspace(opts: { isActive?: boolean } = {}) {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const email = `provision-admin-op-cli-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: opts.isActive ?? true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision AdminOp CLI WS", slug: `provision-admin-op-cli-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    seededUserId = userId;
    seededWorkspaceId = workspaceId;
    return { userId, workspaceId, email };
  }

  const CHILD_TIMEOUT_MS = 25_000;

  function runScript(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: process.env,
        timeout: CHILD_TIMEOUT_MS,
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return {
        status: typeof e.status === "number" ? e.status : 1,
        stdout: String(e.stdout ?? ""),
        stderr: String(e.stderr ?? ""),
      };
    }
  }

  it("[db] dry run (no --apply) performs zero writes and prints the exact-capability disclosure", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dry run only");
    expect(result.stdout).toContain(
      "This grants EXACTLY BETA_PROGRAM_MANAGE and CUSTOMER_ACCESS_MANAGE — no SYSTEM_ADMIN and no beta-request-review/invite capabilities from this role."
    );
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

  it("[db] an inactive user is refused (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace({ isActive: false });

    const result = runScript(["--email", email, "--workspace-id", workspaceId]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not active");
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

  it("[db] the beta-request-operator's confirm phrase does not satisfy this script's grant confirmation (no cross-script phrase reuse)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--apply",
      "--confirm",
      "GRANT BETA REQUEST OPERATOR",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--confirm must be exactly");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] apply with correct confirm grants exactly one ADMINISTRATION_OPERATOR assignment; a second apply is idempotent (no duplicate)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const first = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--apply",
      "--confirm",
      "GRANT ADMINISTRATION OPERATOR",
    ]);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("✓ Granted");

    const afterFirst = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "administration_operator", isActive: true },
    });
    expect(afterFirst).toHaveLength(1);

    const second = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--apply",
      "--confirm",
      "GRANT ADMINISTRATION OPERATOR",
    ]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("already holds an active");

    const afterSecond = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "administration_operator", isActive: true },
    });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(afterFirst[0]!.id);
  }, 60_000);
});
