/**
 * Private deployment owner seed script.
 *
 * Creates the single private-mode owner account in a clean, idempotent way.
 * Wraps all creates/upserts in a single $transaction — any failure rolls back
 * the entire seed so the DB is never left in a partial state.
 *
 * Required env vars (exits 1 if any are absent):
 *   PRIVATE_OWNER_EMAIL          — email for the owner account
 *   PRIVATE_OWNER_PASSWORD       — plaintext password (min 12 chars); hashed here
 *   OPSIQ_PRIVATE_OWNER_USER_ID  — stable UUID for the User record
 *   OPSIQ_PRIVATE_WORKSPACE_ID   — stable UUID used for BOTH Workspace.id AND ClientAccount.id
 *   DATABASE_URL                 — Postgres connection string
 *
 * Set SEED_CONFIRM=true to skip the interactive confirmation prompt (for CI).
 */

import { randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import * as readline from "readline";
import { ROLES } from "../src/domain/constants/roles";
import { AUDIT_EVENTS } from "../src/domain/constants/audit-events";
import type { PrismaClient } from "../src/generated/prisma/client";

// ---------------------------------------------------------------------------
// Env var validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

const DATABASE_URL = requireEnv("DATABASE_URL");
const PRIVATE_OWNER_EMAIL = requireEnv("PRIVATE_OWNER_EMAIL");
const PRIVATE_OWNER_PASSWORD = requireEnv("PRIVATE_OWNER_PASSWORD");
const OPSIQ_PRIVATE_OWNER_USER_ID = requireEnv("OPSIQ_PRIVATE_OWNER_USER_ID");
const OPSIQ_PRIVATE_WORKSPACE_ID = requireEnv("OPSIQ_PRIVATE_WORKSPACE_ID");

if (PRIVATE_OWNER_PASSWORD.length < 12) {
  console.error("ERROR: PRIVATE_OWNER_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// DB confirmation
// ---------------------------------------------------------------------------

async function confirm(): Promise<void> {
  if (process.env.SEED_CONFIRM === "true") return;

  // Print sanitized host (strip credentials from URL)
  let sanitizedHost = "(unknown)";
  try {
    const url = new URL(DATABASE_URL);
    sanitizedHost = `${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    sanitizedHost = "(invalid DATABASE_URL)";
  }

  console.log("");
  console.log("=== Private Owner Seed ===");
  console.log(`  Database host : ${sanitizedHost}`);
  console.log(`  Owner email   : ${PRIVATE_OWNER_EMAIL}`);
  console.log(`  User ID       : ${OPSIQ_PRIVATE_OWNER_USER_ID}`);
  console.log(`  Workspace ID  : ${OPSIQ_PRIVATE_WORKSPACE_ID}`);
  console.log("");
  console.log("This will create (or upsert) the private owner account.");
  console.log("Set SEED_CONFIRM=true to skip this prompt.");
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question("Proceed? [yes/no]: ", (answer: string) => {
      rl.close();
      if (answer.trim().toLowerCase() === "yes") {
        resolve();
      } else {
        console.log("Aborted.");
        process.exit(0);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  // Dynamic imports match the established pattern in other seed scripts
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;

  try {
    const now = new Date();
    const hashedPassword = await bcrypt.hash(PRIVATE_OWNER_PASSWORD, 10);

    await prisma.$transaction(async (tx) => {
      // 1. User — upsert by stable UUID; returned ID is used as the audit actor below.
      const owner = await tx.user.upsert({
        where: { id: OPSIQ_PRIVATE_OWNER_USER_ID },
        update: {
          // Re-hash on each seed run so password changes are applied idempotently
          hashedPassword,
          isActive: true,
          updatedAt: now,
        },
        create: {
          id: OPSIQ_PRIVATE_OWNER_USER_ID,
          email: PRIVATE_OWNER_EMAIL,
          hashedPassword,
          isActive: true,
          updatedAt: now,
        },
      });
      console.log("  ✓ User upserted");

      // 2. Workspace — upsert by stable UUID
      await tx.workspace.upsert({
        where: { id: OPSIQ_PRIVATE_WORKSPACE_ID },
        update: { isActive: true },
        create: {
          id: OPSIQ_PRIVATE_WORKSPACE_ID,
          name: "Private Owner Workspace",
          slug: `private-owner-${OPSIQ_PRIVATE_WORKSPACE_ID.slice(0, 8)}`,
          isActive: true,
          createdBy: OPSIQ_PRIVATE_OWNER_USER_ID,
        },
      });
      console.log("  ✓ Workspace upserted");

      // 3. WorkspaceMembership
      await tx.workspaceMembership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
            userId: OPSIQ_PRIVATE_OWNER_USER_ID,
          },
        },
        update: { role: "owner", isActive: true, removedAt: null },
        create: {
          workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
          userId: OPSIQ_PRIVATE_OWNER_USER_ID,
          role: "owner",
          addedBy: OPSIQ_PRIVATE_OWNER_USER_ID,
          isActive: true,
        },
      });
      console.log("  ✓ Workspace membership upserted");

      // 4. UserRoleAssignment
      await tx.userRoleAssignment.upsert({
        where: {
          userId_role_scope_scopeId: {
            userId: OPSIQ_PRIVATE_OWNER_USER_ID,
            role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
            scope: "workspace",
            scopeId: OPSIQ_PRIVATE_WORKSPACE_ID,
          },
        },
        update: { isActive: true, revokedAt: null },
        create: {
          id: randomUUID(),
          userId: OPSIQ_PRIVATE_OWNER_USER_ID,
          role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
          scope: "workspace",
          scopeId: OPSIQ_PRIVATE_WORKSPACE_ID,
          grantedAt: now,
          isActive: true,
        },
      });
      console.log("  ✓ User role assignment upserted");

      // 5. ClientAccount — SAME UUID as Workspace (private deployment convention).
      //    PrivateModeAccess.workspaceId is a FK to ClientAccount.id, so this record
      //    is required before PrivateModeAccess can be created.
      await tx.clientAccount.upsert({
        where: { id: OPSIQ_PRIVATE_WORKSPACE_ID },
        update: { status: "active", updatedAt: now },
        create: {
          id: OPSIQ_PRIVATE_WORKSPACE_ID,
          workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID, // FK to Workspace.id (same UUID)
          name: "Private Owner Account",
          status: "active",
          visibility: "internal",
          updatedAt: now,
        },
      });
      console.log("  ✓ Client account upserted");

      // 6. PrivateModeAccess — upsert by unique (workspaceId, userId).
      //    workspaceId here = ClientAccount.id = OPSIQ_PRIVATE_WORKSPACE_ID.
      await tx.privateModeAccess.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
            userId: OPSIQ_PRIVATE_OWNER_USER_ID,
          },
        },
        update: {
          role: "OWNER",
          revokedAt: null,
          revokedBy: null,
          revokeReason: null,
          approvalStatus: "approved",
          approvedBy: owner.id,
          approvedAt: now,
          updatedAt: now,
        },
        create: {
          workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
          userId: OPSIQ_PRIVATE_OWNER_USER_ID,
          role: "OWNER",
          grantedBy: owner.id,
          grantedAt: now,
          approvalStatus: "approved",
          approvedBy: owner.id,
          approvedAt: now,
          updatedAt: now,
        },
      });
      console.log("  ✓ Private mode access upserted (role=OWNER, status=approved)");

      // 7. Audit event — transactionally atomic with all mutations above.
      //    AuditEvent fields: id, eventName, actorId, actorType, entityType,
      //    entityId, payload, correlationId, visibility, workspaceId, occurredAt,
      //    previousHash (chain hash — omitted here as this is the seed origin event).
      const eventId = randomUUID();
      const hashInput = `${eventId}|${OPSIQ_PRIVATE_WORKSPACE_ID}|${AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED}|${now.toISOString()}`;
      const previousHash = createHash("sha256").update(hashInput).digest("hex");

      await tx.auditEvent.create({
        data: {
          id: eventId,
          eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
          workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
          actorId: owner.id,
          actorType: "user",
          entityType: "workspace",
          entityId: OPSIQ_PRIVATE_WORKSPACE_ID,
          payload: {
            userId: OPSIQ_PRIVATE_OWNER_USER_ID,
            email: PRIVATE_OWNER_EMAIL,
            role: "OWNER",
            action: "seed",
          },
          previousHash,
          visibility: "internal",
          occurredAt: now,
        },
      });
      console.log("  ✓ Audit event emitted (PRIVATE_OWNER_SEED_EXECUTED)");
    });

    console.log("");
    console.log("=== Seed Complete ===");
    console.log(`  Email        : ${PRIVATE_OWNER_EMAIL}`);
    console.log(`  User ID      : ${OPSIQ_PRIVATE_OWNER_USER_ID}`);
    console.log(`  Workspace ID : ${OPSIQ_PRIVATE_WORKSPACE_ID}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Set the following in your deployment environment:");
    console.log(`       OPSIQ_PRIVATE_WORKSPACE_ID=${OPSIQ_PRIVATE_WORKSPACE_ID}`);
    console.log(`       OPSIQ_PRIVATE_OWNER_USER_ID=${OPSIQ_PRIVATE_OWNER_USER_ID}`);
    console.log("  2. Start the server: npm run dev (or production equivalent)");
    console.log("  3. Log in with the email and password configured above.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  try {
    await confirm();
    await seed();
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
})();
