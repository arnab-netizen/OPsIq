/**
 * Atomicity + safety proof for scripts/provision-acceptance-fixture-operator.ts's
 * grant/revoke paths. Sibling to
 * src/__tests__/scripts/provision-beta-request-operator.db.test.ts — same
 * AUDIT-01 atomicity discipline (the UserRoleAssignment mutation and its
 * audit event must commit or roll back together), plus additional proofs
 * specific to this role: the grant is purpose-specific (ACCEPTANCE_FIXTURE_OPERATOR
 * only), never widens into SYSTEM_ADMIN, and never touches an existing
 * BETA_REQUEST_OPERATOR assignment on the same account.
 *
 * Tests the extracted grantAcceptanceFixtureOperator/revokeAcceptanceFixtureOperator
 * functions directly against a real database -- transaction rollback
 * semantics cannot be faithfully proven against a mocked Prisma client.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/provision-acceptance-fixture-operator.db.test.ts
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
  grantAcceptanceFixtureOperator,
  revokeAcceptanceFixtureOperator,
} from "../../../scripts/provision-acceptance-fixture-operator";
import { grantBetaRequestOperator } from "../../../scripts/provision-beta-request-operator";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);

async function seedUser(): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `provision-fixture-op-${userId}@example.com`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
  return { userId, email };
}

async function cleanupUser(userId: string) {
  await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
  await db.user.delete({ where: { id: userId } }).catch(() => undefined);
}

describe("provision-acceptance-fixture-operator — role definition (no DB required)", () => {
  it("ACCEPTANCE_FIXTURE_OPERATOR grants exactly ACCEPTANCE_FIXTURE_WRITE", () => {
    const bundle = getCapabilitiesForRole(ROLES.ACCEPTANCE_FIXTURE_OPERATOR);
    expect(bundle).toEqual([CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE]);
    expect(bundle).not.toContain(CAPABILITIES.SYSTEM_ADMIN);
    expect(bundle).not.toContain(CAPABILITIES.USER_ASSIGN_ROLE);
  });

  it("the other narrow operator bundles are untouched by this role's existence", () => {
    expect(getCapabilitiesForRole(ROLES.BETA_REQUEST_OPERATOR)).toEqual([
      CAPABILITIES.BETA_REQUEST_REVIEW,
      CAPABILITIES.BETA_REQUEST_INVITE,
    ]);
    expect(getCapabilitiesForRole(ROLES.ADMINISTRATION_OPERATOR)).toEqual([
      CAPABILITIES.BETA_PROGRAM_MANAGE,
      CAPABILITIES.CUSTOMER_ACCESS_MANAGE,
    ]);
  });

  it("holding all three narrow operator roles yields only the union of their own capabilities, never SYSTEM_ADMIN", () => {
    const ctx = {
      userId: randomUUID(),
      roles: [{ role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR }, { role: ROLES.BETA_REQUEST_OPERATOR }, { role: ROLES.ADMINISTRATION_OPERATOR }],
    };
    expect(hasCapability(ctx, CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.BETA_PROGRAM_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.USER_ASSIGN_ROLE)).toBe(false);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator — grant/revoke atomicity", () => {
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

  it("[db] grant creates exactly one ACCEPTANCE_FIXTURE_OPERATOR assignment, and an audit event, together", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: result.assignmentId } });
    expect(assignment).not.toBeNull();
    expect(assignment?.role).toBe("acceptance_fixture_operator");
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
      "scripts/provision-acceptance-fixture-operator.ts"
    );
  });

  it("[db] existing roles (e.g. BETA_REQUEST_OPERATOR) on the same user remain untouched by the grant", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);

    const adminOp = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const betaOpAssignment = await db.userRoleAssignment.findUnique({ where: { id: betaOp.assignmentId } });
    expect(betaOpAssignment?.role).toBe("beta_request_operator");
    expect(betaOpAssignment?.isActive).toBe(true);
    expect(betaOpAssignment?.revokedAt).toBeNull();

    const allAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
    const roles = allAssignments.map((a) => a.role).sort();
    expect(roles).toEqual(["acceptance_fixture_operator", "beta_request_operator"]);
  });

  it("[db] a duplicate grant call is idempotent — grantAcceptanceFixtureOperator itself always creates a row, so the CLI's own pre-check (not this function) is what prevents a duplicate active assignment", async () => {
    // grantAcceptanceFixtureOperator is the low-level atomic primitive (mirrors
    // grantBetaRequestOperator) — main()'s CLI orchestration is what checks
    // `existing` before calling it (see "CLI guard behaviors" describe block
    // below, which proves the CLI-level idempotency via a real subprocess run).
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const first = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(first.auditEventId);

    const existing = await db.userRoleAssignment.findFirst({
      where: { userId, role: "acceptance_fixture_operator", scope: "workspace", scopeId: workspaceId, isActive: true, revokedAt: null },
    });
    expect(existing?.id).toBe(first.assignmentId);
  });

  it("[db] revoke deactivates only the ACCEPTANCE_FIXTURE_OPERATOR assignment, leaving BETA_REQUEST_OPERATOR active", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);
    const adminOp = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const revoked = await revokeAcceptanceFixtureOperator({
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

    await expect(grantAcceptanceFixtureOperator({ userId, email, workspaceId })).rejects.toThrow(
      "SIMULATED_AUDIT_FAILURE_ON_GRANT"
    );

    const assignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(assignments).toHaveLength(0);
  });

  it("[db] a simulated audit failure during revoke rolls back the deactivation (assignment stays active)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const granted = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(granted.auditEventId);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REVOKE");
    });

    await expect(
      revokeAcceptanceFixtureOperator({ assignmentId: granted.assignmentId, userId, email, workspaceId })
    ).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REVOKE");

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: granted.assignmentId } });
    expect(assignment?.isActive).toBe(true);
    expect(assignment?.revokedAt).toBeNull();
  });

  it("[db] granting ACCEPTANCE_FIXTURE_OPERATOR never creates a SYSTEM_ADMIN assignment for the same user", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const systemAdminAssignments = await db.userRoleAssignment.findMany({
      where: { userId, role: "system_admin" },
    });
    expect(systemAdminAssignments).toHaveLength(0);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator CLI — guard behaviors", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
  // The real hostname this test process's own DATABASE_URL/TEST_DATABASE_URL
  // resolves to -- computed the same way the script itself does, so these
  // tests work identically against local Postgres, CI's throwaway Postgres,
  // or any other real test database, without hardcoding "localhost".
  const RAW_TEST_DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const EXPECTED_DB_HOST = new URL(RAW_TEST_DB_URL).hostname;
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
    const email = `provision-fixture-op-cli-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: opts.isActive ?? true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision AdminOp CLI WS", slug: `provision-fixture-op-cli-${workspaceId.substring(0, 8)}` } });
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

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MATCH=YES");
    expect(result.stdout).toContain("Dry run only");
    expect(result.stdout).toContain(
      "This grants EXACTLY ACCEPTANCE_FIXTURE_WRITE (create isolated acceptance fixtures in this workspace only) — no SYSTEM_ADMIN, no user/role administration, no other admin capability."
    );
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --workspace-id still refuses (no writes)", async () => {
    const { email } = await seedActorWithWorkspace();
    const wrongWorkspaceId = randomUUID();

    const result = runScript(["--email", email, "--workspace-id", wrongWorkspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Mismatch");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] an inactive user is refused (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace({ isActive: false });

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

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
      "--expected-database-host",
      EXPECTED_DB_HOST,
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
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT BETA REQUEST OPERATOR",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--confirm must be exactly");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] apply with correct confirm grants exactly one ACCEPTANCE_FIXTURE_OPERATOR assignment; a second apply is idempotent (no duplicate)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const first = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("✓ Granted");

    const afterFirst = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "acceptance_fixture_operator", isActive: true },
    });
    expect(afterFirst).toHaveLength(1);

    const second = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("already holds an active");

    const afterSecond = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "acceptance_fixture_operator", isActive: true },
    });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(afterFirst[0]!.id);
  }, 60_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator CLI — wrong-database fail-closed gate", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
  const RAW_TEST_DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const EXPECTED_DB_HOST = new URL(RAW_TEST_DB_URL).hostname;
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
    const email = `provision-fixture-op-hostgate-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision AdminOp HostGate WS", slug: `provision-fixture-op-hostgate-${workspaceId.substring(0, 8)}` } });
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

  it("[db] correct --expected-database-host passes and the dry run proceeds normally", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Expected database host: ${EXPECTED_DB_HOST}`);
    expect(result.stdout).toContain(`Actual database host: ${EXPECTED_DB_HOST}`);
    expect(result.stdout).toContain("MATCH=YES");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --expected-database-host fails before any DB query or mutation (no user lookup, no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", "definitely-the-wrong-host.example.com"]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("MATCH=NO");
    expect(result.stderr).toContain("Refusing before any database connection or query");
    // Proves no DB lookup happened: the "No user found" branch (which itself
    // requires a successful query) never printed.
    expect(result.stderr).not.toContain("No user found");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --expected-database-host refuses even when --apply and a correct --confirm are also passed (host gate runs first)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email", email,
      "--workspace-id", workspaceId,
      "--expected-database-host", "definitely-the-wrong-host.example.com",
      "--apply",
      "--confirm", "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("MATCH=NO");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a missing --expected-database-host fails before any DB query (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected_database_host is required");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a malformed --expected-database-host (full URL) fails before any DB query (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", `postgresql://user:pass@${EXPECTED_DB_HOST}/db`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("://");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] credentials passed as --expected-database-host are rejected as malformed, never compared or logged", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", `admin:s3cr3t@${EXPECTED_DB_HOST}`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@");
    expect(result.stdout).not.toContain("s3cr3t");
    expect(result.stderr).not.toContain("s3cr3t");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);
});
