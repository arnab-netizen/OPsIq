/**
 * Seed all 110 Unknown/OOD scenarios into the E2E owner workspace for the OOD desktop + mobile Playwright
 * lanes. Reuses the E2E owner identity + the deterministic `oodBusinessId`. Idempotent; does NOT touch the
 * chaos scenario businesses.
 */
// Fail closed unless DATABASE_URL is a guarded test database (see scripts/lib/assert-test-database.ts).
import "./lib/assert-test-database";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "../tests/browser/e2e-fixtures";
import { seedAllOodScenarios } from "./seed-ood-scenarios";
import type { PrismaClient } from "../src/generated/prisma/client";

const OWNER_ROLE = "admin_or_portfolio_manager";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;
  const now = new Date();
  const hashedPassword = bcrypt.hashSync(E2E_OWNER.password, 10);

  await prisma.user.upsert({ where: { id: E2E_OWNER.userId }, update: { hashedPassword }, create: { id: E2E_OWNER.userId, email: E2E_OWNER.email, name: "E2E Owner", hashedPassword, updatedAt: now } });
  await prisma.workspace.upsert({ where: { slug: "e2e-owner-workspace" }, update: {}, create: { id: E2E_WORKSPACE_ID, name: "E2E Owner Workspace", slug: "e2e-owner-workspace", createdBy: E2E_OWNER.userId, description: "E2E owner flow" } });
  await prisma.workspaceMembership.upsert({ where: { workspaceId_userId: { workspaceId: E2E_WORKSPACE_ID, userId: E2E_OWNER.userId } }, update: { role: "owner", isActive: true }, create: { workspaceId: E2E_WORKSPACE_ID, userId: E2E_OWNER.userId, role: "owner", addedBy: E2E_OWNER.userId, isActive: true } });
  await prisma.userRoleAssignment.upsert({ where: { userId_role_scope_scopeId: { userId: E2E_OWNER.userId, role: OWNER_ROLE, scope: "workspace", scopeId: E2E_WORKSPACE_ID } }, update: { isActive: true, revokedAt: null }, create: { id: randomUUID(), userId: E2E_OWNER.userId, role: OWNER_ROLE, scope: "workspace", scopeId: E2E_WORKSPACE_ID, isActive: true } });

  const n = await seedAllOodScenarios(prisma, E2E_WORKSPACE_ID, E2E_OWNER.userId, now);
  console.log(`[seed-ood-e2e] seeded ${n} OOD scenario businesses into the E2E workspace`);
  await pool.end();
}

if (process.argv[1] && process.argv[1].includes("seed-ood-e2e")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
