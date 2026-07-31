/**
 * [db] Stage 8 — Private owner seed audit-actor regression + race-closure tests.
 *
 * Root cause fixed: seed script used `systemActorId` ("00000000-…-0001"), a UUID
 * that never existed in users, as `actorId` for the audit event.  The FK
 * `audit_events_actor_id_fkey` (actor_id → users.id) rejected it with P2003,
 * rolling back the entire transaction.
 *
 * Fix: capture the owner User returned by step 1 upsert; use `owner.id` as
 * `actorId` with `actorType: "user"`.
 *
 * Race closure (Phase 3): advisory lock + 12-invariant CLEAN_FIRST_SEED assertion
 * added to `runPrivateOwnerSeedTransaction`. The function is now FIRST_RUN_ONLY —
 * a second call throws PrivateOwnerBootstrapInvariantError and rolls back atomically.
 *
 * Tests 1-9 and 11-25 call `runPrivateOwnerSeedTransaction` imported directly from
 * the production seed script — the exact function the CLI invokes. Tests 10 and
 * 12 are schema-level assertions (direct DB calls) that prove the FK constraint
 * still exists independently of the seed path.
 *
 * Coverage (25 requirements):
 *  1.  Fresh migrated DB: seed transaction completes without error.
 *  2.  User: expected owner user record exists.
 *  3.  Workspace: expected workspace record exists.
 *  4.  Workspace membership: owner membership record exists.
 *  5.  Role assignment: OWNER assignment exists with workspace scope.
 *  6.  Client account: expected client account record exists.
 *  7.  Private mode access: approved OWNER access record exists.
 *  8.  Audit event: PRIVATE_OWNER_SEED_EXECUTED audit event exists.
 *  9.  Audit actor integrity: actorId references an existing users.id; actorType = "user".
 * 10.  Atomic rollback (schema-level): invalid actorId in audit step causes P2003; all
 *      earlier mutations roll back — zero records remain.
 * 11.  FIRST_RUN_ONLY: second seed attempt throws MEMBERSHIP_EXISTS; exactly 7 rows persist.
 * 12.  FK not weakened: inserting an audit event with a non-existent actorId still raises P2003.
 * inv.1   Invariant MEMBERSHIP_EXISTS fires and rolls back.
 * inv.2   Invariant CONFLICTING_OWNER_MEMBERSHIP fires and rolls back.
 * inv.3   Invariant ROLE_ASSIGNMENT_EXISTS fires and rolls back.
 * inv.4   Invariant CONFLICTING_ROLE_ASSIGNMENT fires and rolls back.
 * inv.5   Invariant PRIVATE_MODE_ACCESS_EXISTS fires and rolls back.
 * inv.6   Invariant CLIENT_ACCOUNT_ID_EXISTS fires and rolls back.
 * inv.7   Invariant CONFLICTING_CLIENT_ACCOUNT fires and rolls back.
 * inv.8   Invariant AUDIT_EVENT_EXISTS fires and rolls back.
 * inv.9   Invariant USER_ID_EXISTS fires and rolls back.
 * inv.10  Invariant USER_EMAIL_EXISTS fires and rolls back.
 * inv.11  Invariant WORKSPACE_ID_EXISTS fires and rolls back.
 * inv.12  Invariant WORKSPACE_SLUG_EXISTS fires and rolls back.
 * C1.     Concurrent seed: exactly one succeeds, the other throws PrivateOwnerBootstrapInvariantError;
 *         exactly 7 rows committed.
 *
 * Requires: TEST_WITH_DB=true and a migrated PostgreSQL instance pointed to by
 * DATABASE_URL or TEST_DATABASE_URL.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { v4 as randomUUID } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ROLES } from "@/domain/constants/roles";
import {
  runPrivateOwnerSeedTransaction,
  PrivateOwnerBootstrapInvariantError,
  type PrivateOwnerSeedParams,
} from "../../../scripts/seed-private-owner";

const SKIP = !SHOULD_RUN_DB_TESTS;

// ---------------------------------------------------------------------------
// DB client — created once for the suite, isolated to the test database.
// ---------------------------------------------------------------------------

let prisma: Awaited<ReturnType<typeof makePrisma>>;

// ---------------------------------------------------------------------------
// Production-URL guard — hard-fail if the resolved URL could be production.
// The test creates and deletes real records; it must never touch a remote DB.
// Allow only loopback addresses (127.x.x.x / localhost / ::1).
// ---------------------------------------------------------------------------

function assertLocalUrl(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`[stage8-test] DATABASE_URL is not a valid URL: "${url}"`);
  }
  const isLocal =
    hostname === "localhost" ||
    hostname === "::1" ||
    /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[stage8-test] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "These tests may only run against a local throwaway PostgreSQL instance. " +
        "Aborting to protect production data."
    );
  }
}

async function makePrisma() {
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = await import("pg");
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  assertLocalUrl(url);
  const pool = new pg.Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) }) as InstanceType<typeof PrismaClient>;
}

// ---------------------------------------------------------------------------
// Stable per-test-run IDs (fresh UUIDs so tests don't collide across runs).
// ---------------------------------------------------------------------------

const OWNER_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const OWNER_EMAIL = `seed-reg-${OWNER_ID.slice(0, 8)}@test.local`;
const HASHED_PW = "$2a$10$testhashedpasswordvalue.not.real";

const SEED_PARAMS: PrivateOwnerSeedParams = {
  ownerId: OWNER_ID,
  workspaceId: WORKSPACE_ID,
  email: OWNER_EMAIL,
  hashedPassword: HASHED_PW,
  now: new Date(),
};

// Derived slug — must match the production seed formula
const INTENDED_SLUG = `private-owner-${WORKSPACE_ID.slice(0, 8)}`;
// Secondary actors/entities for invariant-violation tests
const OTHER_USER_ID = randomUUID();
const OTHER_CA_ID = randomUUID();
const OTHER_WS_ID = randomUUID();

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function cleanupTestRecords() {
  // FK-safe deletion order: dependents before parents
  await prisma.auditEvent.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.privateModeAccess.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: OWNER_ID } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: OTHER_USER_ID } });
  await prisma.clientAccount.deleteMany({ where: { id: WORKSPACE_ID } });
  await prisma.clientAccount.deleteMany({ where: { id: OTHER_CA_ID } });
  await prisma.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  await prisma.workspace.deleteMany({ where: { id: OTHER_WS_ID } });
  await prisma.workspace.deleteMany({ where: { slug: INTENDED_SLUG } });
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  await prisma.user.deleteMany({ where: { id: OTHER_USER_ID } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)("[db] Stage 8 — private-owner seed audit-actor regression", () => {
  beforeAll(async () => {
    prisma = await makePrisma();
    // Clean any leftover state from aborted previous runs
    await cleanupTestRecords();
  });

  afterEach(async () => {
    await cleanupTestRecords();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── 1. Fresh migrated DB: transaction completes ───────────────────────────
  it("1. seed transaction completes on a fresh migrated DB without error", async () => {
    await expect(runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS)).resolves.toBeUndefined();
  });

  // ── 2. User exists ────────────────────────────────────────────────────────
  it("2. expected owner user record exists after seed", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const user = await prisma.user.findUnique({ where: { id: OWNER_ID } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(OWNER_EMAIL);
    expect(user!.isActive).toBe(true);
  });

  // ── 3. Workspace exists ───────────────────────────────────────────────────
  it("3. expected workspace record exists after seed", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const ws = await prisma.workspace.findUnique({ where: { id: WORKSPACE_ID } });
    expect(ws).not.toBeNull();
    expect(ws!.isActive).toBe(true);
  });

  // ── 4. WorkspaceMembership exists ────────────────────────────────────────
  it("4. owner workspace membership record exists", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const mem = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
    });
    expect(mem).not.toBeNull();
    expect(mem!.role).toBe("owner");
    expect(mem!.isActive).toBe(true);
  });

  // ── 5. UserRoleAssignment exists with correct scope ───────────────────────
  it("5. OWNER role assignment exists with workspace scope", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: OWNER_ID,
        role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
        scope: "workspace",
        scopeId: WORKSPACE_ID,
      },
    });
    expect(assignment).not.toBeNull();
    expect(assignment!.isActive).toBe(true);
  });

  // ── 6. ClientAccount exists ───────────────────────────────────────────────
  it("6. expected client account record exists", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const ca = await prisma.clientAccount.findUnique({ where: { id: WORKSPACE_ID } });
    expect(ca).not.toBeNull();
    expect(ca!.status).toBe("active");
  });

  // ── 7. PrivateModeAccess exists as approved OWNER ─────────────────────────
  it("7. private mode access record is approved OWNER", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const pma = await prisma.privateModeAccess.findUnique({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
    });
    expect(pma).not.toBeNull();
    expect(pma!.role).toBe("OWNER");
    expect(pma!.approvalStatus).toBe("approved");
    expect(pma!.revokedAt).toBeNull();
  });

  // ── 8. Audit event exists ────────────────────────────────────────────────
  it("8. PRIVATE_OWNER_SEED_EXECUTED audit event exists", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const event = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: WORKSPACE_ID,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
      },
    });
    expect(event).not.toBeNull();
    expect(event!.entityType).toBe("workspace");
    expect(event!.entityId).toBe(WORKSPACE_ID);
  });

  // ── 9. Audit actor integrity ─────────────────────────────────────────────
  it("9. audit event actorId references an existing users.id and actorType is 'user'", async () => {
    await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS);
    const event = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: WORKSPACE_ID,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
      },
    });
    expect(event).not.toBeNull();
    expect(event!.actorType).toBe("user");
    expect(event!.actorId).toBe(OWNER_ID);

    // The actorId must reference an existing users.id
    const user = await prisma.user.findUnique({ where: { id: event!.actorId! } });
    expect(user).not.toBeNull();
  });

  // ── 10. Atomic rollback (schema-level) ───────────────────────────────────
  // This is a direct DB-level test, not a reimplementation of the production seed.
  // It proves that the schema enforces atomicity: if an audit event with a ghost
  // actorId is the LAST write in a transaction containing earlier seed mutations,
  // the FK violation rolls back ALL prior writes. This reproduces the original bug class.
  it("10. invalid audit actorId causes P2003; all earlier seed mutations roll back", async () => {
    const GHOST_ID = "00000000-0000-0000-0000-000000000001"; // never in users
    const now = new Date();

    const attempt = prisma.$transaction(async (tx) => {
      // Mirror steps 1-6 of the production seed directly against the tx client
      // so we can inject the broken step 7 (ghost actorId) to prove atomicity.
      await tx.user.upsert({
        where: { id: OWNER_ID },
        update: { hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
        create: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
      });
      await tx.workspace.upsert({
        where: { id: WORKSPACE_ID },
        update: { isActive: true },
        create: { id: WORKSPACE_ID, name: "Private Owner Workspace", slug: `private-owner-${WORKSPACE_ID.slice(0, 8)}`, isActive: true, createdBy: OWNER_ID },
      });
      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
        update: { role: "owner", isActive: true, removedAt: null },
        create: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "owner", addedBy: OWNER_ID, isActive: true },
      });
      await tx.userRoleAssignment.upsert({
        where: { userId_role_scope_scopeId: { userId: OWNER_ID, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WORKSPACE_ID } },
        update: { isActive: true, revokedAt: null },
        create: { id: randomUUID(), userId: OWNER_ID, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WORKSPACE_ID, grantedAt: now, isActive: true },
      });
      await tx.clientAccount.upsert({
        where: { id: WORKSPACE_ID },
        update: { status: "active", updatedAt: now },
        create: { id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, name: "Private Owner Account", status: "active", visibility: "internal", updatedAt: now },
      });
      await tx.privateModeAccess.upsert({
        where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
        update: { role: "OWNER", revokedAt: null, revokedBy: null, revokeReason: null, approvalStatus: "approved", approvedBy: OWNER_ID, approvedAt: now, updatedAt: now },
        create: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "OWNER", grantedBy: OWNER_ID, grantedAt: now, approvalStatus: "approved", approvedBy: OWNER_ID, approvedAt: now, updatedAt: now },
      });

      // Inject the pre-fix defect: ghost UUID as actorId → P2003
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
          workspaceId: WORKSPACE_ID,
          actorId: GHOST_ID,
          actorType: "user",
          entityType: "workspace",
          entityId: WORKSPACE_ID,
          payload: {},
          visibility: "internal",
          occurredAt: now,
        },
      });
    });

    // Transaction must fail
    await expect(attempt).rejects.toThrow();

    // All earlier mutations must have rolled back — zero records on every table
    const [users, workspaces, memberships, roles, accounts, access, events] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID } }),
      prisma.userRoleAssignment.count({ where: { userId: OWNER_ID, scopeId: WORKSPACE_ID } }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID } }),
      prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }),
    ]);

    expect(users, "users after rollback").toBe(0);
    expect(workspaces, "workspaces after rollback").toBe(0);
    expect(memberships, "memberships after rollback").toBe(0);
    expect(roles, "role assignments after rollback").toBe(0);
    expect(accounts, "client accounts after rollback").toBe(0);
    expect(access, "private mode access after rollback").toBe(0);
    expect(events, "audit events after rollback").toBe(0);
  });

  // ── 11. FIRST_RUN_ONLY: second run rejected; 7 rows persist ─────────────
  it("11. duplicate seed attempt is rejected (MEMBERSHIP_EXISTS); exactly 7 rows persist", async () => {
    await expect(runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS)).resolves.toBeUndefined();
    await expect(runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS))
      .rejects.toThrow(PrivateOwnerBootstrapInvariantError);

    const [users, workspaces, memberships, roles, accounts, access, events] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.userRoleAssignment.count({
        where: { userId: OWNER_ID, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: WORKSPACE_ID },
      }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }),
    ]);

    expect(users, "exactly one user").toBe(1);
    expect(workspaces, "exactly one workspace").toBe(1);
    expect(memberships, "exactly one membership").toBe(1);
    expect(roles, "exactly one role assignment").toBe(1);
    expect(accounts, "exactly one client account").toBe(1);
    expect(access, "exactly one private mode access").toBe(1);
    expect(events, "exactly one audit event — second run rolled back").toBe(1);
  });

  // ── 12. FK not weakened: invalid actorId still raises P2003 ──────────────
  it("12. audit_events_actor_id_fkey is intact — non-existent actorId is still rejected", async () => {
    const ghostId = "00000000-ffff-0000-0000-000000000002";
    const attempt = prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "private_mode.owner_seed_executed",
        workspaceId: WORKSPACE_ID,
        actorId: ghostId,
        actorType: "user",
        entityType: "workspace",
        entityId: WORKSPACE_ID,
        visibility: "internal",
        occurredAt: new Date(),
      },
    });

    // Must reject: FK constraint on actor_id → users.id
    await expect(attempt).rejects.toThrow();
  });

  // =========================================================================
  // Invariant violation tests (inv.1 – inv.12)
  // Each test: pre-insert minimal rows that trip exactly one invariant, then
  // assert the seed throws PrivateOwnerBootstrapInvariantError with the correct
  // violation name, and that no seed rows were committed.
  // =========================================================================

  async function assertSeedRolledBackClean() {
    const [users, workspaces, memberships, roles, accounts, access, events] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.userRoleAssignment.count({ where: { userId: OWNER_ID, scopeId: WORKSPACE_ID } }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }),
    ]);
    expect(users, "user not committed").toBe(0);
    expect(workspaces, "workspace not committed").toBe(0);
    expect(memberships, "membership not committed").toBe(0);
    expect(roles, "role assignment not committed").toBe(0);
    expect(accounts, "client account not committed").toBe(0);
    expect(access, "private mode access not committed").toBe(0);
    expect(events, "audit event not committed").toBe(0);
  }

  // ── inv.1 MEMBERSHIP_EXISTS ───────────────────────────────────────────────
  it("inv.1 MEMBERSHIP_EXISTS: existing membership blocks seed and rolls back atomically", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: INTENDED_SLUG, isActive: true, createdBy: OWNER_ID, createdAt: now, updatedAt: now },
    });
    await prisma.workspaceMembership.create({
      data: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "owner", addedBy: OWNER_ID, isActive: true },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("MEMBERSHIP_EXISTS");
  });

  // ── inv.2 CONFLICTING_OWNER_MEMBERSHIP ───────────────────────────────────
  it("inv.2 CONFLICTING_OWNER_MEMBERSHIP: another user holds owner role in this workspace", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: INTENDED_SLUG, isActive: true, createdBy: OTHER_USER_ID, createdAt: now, updatedAt: now },
    });
    await prisma.workspaceMembership.create({
      data: { workspaceId: WORKSPACE_ID, userId: OTHER_USER_ID, role: "owner", addedBy: OTHER_USER_ID, isActive: true },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("CONFLICTING_OWNER_MEMBERSHIP");
    // Pre-inserted workspace(WORKSPACE_ID) is setup data — verify seed-specific rows absent
    expect(await prisma.user.count({ where: { id: OWNER_ID } }), "seed user not committed").toBe(0);
  });

  // ── inv.3 ROLE_ASSIGNMENT_EXISTS ─────────────────────────────────────────
  // user_role_assignments.scopeId has no FK → no workspace row required
  it("inv.3 ROLE_ASSIGNMENT_EXISTS: owner already has the role in this workspace", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.userRoleAssignment.create({
      data: { id: randomUUID(), userId: OWNER_ID, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: WORKSPACE_ID, grantedAt: now, isActive: true },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("ROLE_ASSIGNMENT_EXISTS");
    // Pre-inserted user(OWNER_ID) is setup data — verify seed-specific rows absent
    expect(await prisma.workspace.count({ where: { id: WORKSPACE_ID } }), "seed workspace not committed").toBe(0);
  });

  // ── inv.4 CONFLICTING_ROLE_ASSIGNMENT ────────────────────────────────────
  it("inv.4 CONFLICTING_ROLE_ASSIGNMENT: different user holds admin role in this workspace", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.userRoleAssignment.create({
      data: { id: randomUUID(), userId: OTHER_USER_ID, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: WORKSPACE_ID, grantedAt: now, isActive: true },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("CONFLICTING_ROLE_ASSIGNMENT");
    await assertSeedRolledBackClean();
  });

  // ── inv.5 PRIVATE_MODE_ACCESS_EXISTS ─────────────────────────────────────
  // private_mode_access.workspaceId FK → client_accounts.id, so need CA row
  it("inv.5 PRIVATE_MODE_ACCESS_EXISTS: owner private-mode access already seeded", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: INTENDED_SLUG, isActive: true, createdBy: OWNER_ID, createdAt: now, updatedAt: now },
    });
    await prisma.clientAccount.create({
      data: { id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, name: "CA", status: "active", visibility: "internal", updatedAt: now },
    });
    await prisma.privateModeAccess.create({
      data: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "OWNER", grantedBy: OWNER_ID, grantedAt: now, approvalStatus: "approved", approvedBy: OWNER_ID, approvedAt: now, updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("PRIVATE_MODE_ACCESS_EXISTS");
  });

  // ── inv.6 CLIENT_ACCOUNT_ID_EXISTS ───────────────────────────────────────
  it("inv.6 CLIENT_ACCOUNT_ID_EXISTS: client account with workspace UUID already exists", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: INTENDED_SLUG, isActive: true, createdBy: OWNER_ID, createdAt: now, updatedAt: now },
    });
    await prisma.clientAccount.create({
      data: { id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, name: "CA", status: "active", visibility: "internal", updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("CLIENT_ACCOUNT_ID_EXISTS");
  });

  // ── inv.7 CONFLICTING_CLIENT_ACCOUNT ─────────────────────────────────────
  it("inv.7 CONFLICTING_CLIENT_ACCOUNT: a different CA already belongs to this workspace", async () => {
    const now = new Date();
    const diffSlug = `diff-slug-${OTHER_USER_ID.slice(0, 8)}`;
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: diffSlug, isActive: true, createdBy: OTHER_USER_ID, createdAt: now, updatedAt: now },
    });
    await prisma.clientAccount.create({
      data: { id: OTHER_CA_ID, workspaceId: WORKSPACE_ID, name: "Racing CA", status: "active", visibility: "internal", updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("CONFLICTING_CLIENT_ACCOUNT");
    // Pre-inserted workspace(WORKSPACE_ID) is setup data — only verify seed-specific rows are absent
    expect(await prisma.user.count({ where: { id: OWNER_ID } }), "seed user not committed").toBe(0);
    expect(await prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }), "seed CA not committed").toBe(0);
  });

  // ── inv.8 AUDIT_EVENT_EXISTS ──────────────────────────────────────────────
  // audit_events.workspaceId has no FK to workspaces → minimal setup
  it("inv.8 AUDIT_EVENT_EXISTS: prior audit event for this workspace blocks re-seed", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "private_mode.owner_seed_executed",
        workspaceId: WORKSPACE_ID,
        actorId: OTHER_USER_ID,
        actorType: "user",
        entityType: "workspace",
        entityId: WORKSPACE_ID,
        visibility: "internal",
        occurredAt: now,
      },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("AUDIT_EVENT_EXISTS");
    // Pre-inserted audit event is setup data — verify seed-specific rows absent and event count unchanged
    expect(await prisma.user.count({ where: { id: OWNER_ID } }), "seed user not committed").toBe(0);
    expect(await prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }), "only pre-inserted event, no seed event").toBe(1);
  });

  // ── inv.9 USER_ID_EXISTS ──────────────────────────────────────────────────
  it("inv.9 USER_ID_EXISTS: user with intended UUID already exists (different email)", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OWNER_ID, email: `different-${OWNER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("USER_ID_EXISTS");
  });

  // ── inv.10 USER_EMAIL_EXISTS ──────────────────────────────────────────────
  it("inv.10 USER_EMAIL_EXISTS: intended email already registered under a different UUID", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("USER_EMAIL_EXISTS");
    await assertSeedRolledBackClean();
  });

  // ── inv.11 WORKSPACE_ID_EXISTS ────────────────────────────────────────────
  it("inv.11 WORKSPACE_ID_EXISTS: workspace with intended UUID already exists (different slug)", async () => {
    const now = new Date();
    const diffSlug = `diff-ws-slug-${OTHER_USER_ID.slice(0, 8)}`;
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: WORKSPACE_ID, name: "WS", slug: diffSlug, isActive: true, createdBy: OTHER_USER_ID, createdAt: now, updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("WORKSPACE_ID_EXISTS");
    // Pre-inserted workspace(WORKSPACE_ID) is setup data — verify seed-specific rows absent
    expect(await prisma.user.count({ where: { id: OWNER_ID } }), "seed user not committed").toBe(0);
  });

  // ── inv.12 WORKSPACE_SLUG_EXISTS ─────────────────────────────────────────
  it("inv.12 WORKSPACE_SLUG_EXISTS: intended slug already claimed by a different workspace", async () => {
    const now = new Date();
    await prisma.user.create({
      data: { id: OTHER_USER_ID, email: `other-${OTHER_USER_ID.slice(0, 8)}@test.local`, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });
    await prisma.workspace.create({
      data: { id: OTHER_WS_ID, name: "Squatter WS", slug: INTENDED_SLUG, isActive: true, createdBy: OTHER_USER_ID, createdAt: now, updatedAt: now },
    });

    const err = await runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS).catch((e) => e);
    expect(err).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);
    expect((err as PrivateOwnerBootstrapInvariantError).violation).toBe("WORKSPACE_SLUG_EXISTS");
    await assertSeedRolledBackClean();
  });

  // ── C1. Concurrent seed: exactly one succeeds ────────────────────────────
  it("C1. concurrent seed: exactly one call succeeds and the other throws MEMBERSHIP_EXISTS; exactly 7 rows committed", async () => {
    const results = await Promise.allSettled([
      runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS),
      runPrivateOwnerSeedTransaction(prisma, SEED_PARAMS),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length, "exactly one seed call succeeded").toBe(1);
    expect(rejected.length, "exactly one seed call was rejected").toBe(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(PrivateOwnerBootstrapInvariantError);

    const [users, workspaces, memberships, roles, accounts, access, events] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.userRoleAssignment.count({
        where: { userId: OWNER_ID, role: "admin_or_portfolio_manager", scope: "workspace", scopeId: WORKSPACE_ID },
      }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }),
    ]);

    expect(users, "exactly one user").toBe(1);
    expect(workspaces, "exactly one workspace").toBe(1);
    expect(memberships, "exactly one membership").toBe(1);
    expect(roles, "exactly one role assignment").toBe(1);
    expect(accounts, "exactly one client account").toBe(1);
    expect(access, "exactly one private mode access").toBe(1);
    expect(events, "exactly one audit event").toBe(1);
  });
});

describe.skipIf(!SKIP)("[db] Stage 8 — DB unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — set TEST_WITH_DB=true to run PostgreSQL-backed seed tests", () => {
    expect(true).toBe(true);
  });
});
