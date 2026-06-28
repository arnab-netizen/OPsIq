/**
 * E2E owner seed — creates the loginable owner the Playwright owner-flow spec uses
 * (test1@staging.local / password123, OWNER of a workspace) and seeds the laundry archetype
 * plus a finance diagnosis so the owner command center renders real backend data. Used only
 * by the owner-e2e CI lane.
 *
 * Mirrors the production signup path (src/app/api/auth/signup/route.ts): an owner is a workspace
 * member AND holds a workspace-scoped UserRoleAssignment (ADMIN_OR_PORTFOLIO_MANAGER) — that role
 * assignment is what grants OWNER_VIEW / OWNER_MANAGE. Membership alone does not grant capabilities,
 * so without the assignment every /api/owner/* call is correctly denied (403 owner:view).
 */
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const USER_ID = "10000000-0000-0000-0000-0000000000e2";
const WORKSPACE_ID = "20000000-0000-0000-0000-0000000000e2";
const EMAIL = "test1@staging.local";
const PASSWORD = "password123";
const OWNER_ROLE = "admin_or_portfolio_manager"; // ROLES.ADMIN_OR_PORTFOLIO_MANAGER — grants OWNER_VIEW/OWNER_MANAGE

// Poor finance metrics → guarantees findings + actions so a domain diagnosis exists and the
// command center reports hasData=true (the control center panel only renders with diagnosed data).
const LEAKY_SNAPSHOT = {
  periodStart: "2026-04-01",
  periodEnd: "2026-04-30",
  currency: "INR",
  revenue: 100000,
  fixedCosts: 40000,
  variableCosts: 40000,
  discountAmount: 15000,
  cashOnHand: 50000,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma: any = new PrismaClient({ adapter });

  const hashedPassword = bcrypt.hashSync(PASSWORD, 10);

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { hashedPassword },
    create: { id: USER_ID, email: EMAIL, name: "E2E Owner", hashedPassword, updatedAt: new Date() },
  });
  await prisma.workspace.upsert({
    where: { slug: "e2e-owner-workspace" },
    update: {},
    create: { id: WORKSPACE_ID, name: "E2E Owner Workspace", slug: "e2e-owner-workspace", createdBy: USER_ID, description: "E2E owner flow" },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: USER_ID } },
    update: { role: "owner", isActive: true },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "owner", addedBy: USER_ID, isActive: true },
  });

  // Capability grant: workspace-scoped role assignment (mirrors signup). Without this the owner
  // routes deny with 403 "Missing capabilities: owner:view".
  await prisma.userRoleAssignment.upsert({
    where: {
      userId_role_scope_scopeId: { userId: USER_ID, role: OWNER_ROLE, scope: "workspace", scopeId: WORKSPACE_ID },
    },
    update: { isActive: true, revokedAt: null },
    create: {
      id: randomUUID(),
      userId: USER_ID,
      role: OWNER_ROLE,
      scope: "workspace",
      scopeId: WORKSPACE_ID,
      isActive: true,
    },
  });
  console.log(`[seed-e2e] owner ${EMAIL} + workspace ${WORKSPACE_ID} + role ${OWNER_ROLE} ready`);

  // Seed the laundry archetype (business + operational data) so the control center renders rich data.
  const { seedLaundryArchetype } = await import("../src/services/owner-mode/archetype-seed.service");
  const archetype = await seedLaundryArchetype({ workspaceId: WORKSPACE_ID, actorId: USER_ID, env: "test" });
  console.log(`[seed-e2e] archetype seeded: business ${archetype.businessId}, equipment ${archetype.equipmentCount}`);

  // Run a finance diagnosis on the archetype business so a domain score exists → command center
  // hasData=true → the control center panel (the asserted surface) actually renders.
  const { createFinancialSnapshot } = await import("../src/services/owner-finance/snapshot.service");
  const { runFinanceDiagnosis } = await import("../src/services/owner-finance/diagnosis.service");
  const snap = await createFinancialSnapshot(archetype.businessId, LEAKY_SNAPSHOT, USER_ID, WORKSPACE_ID);
  const cycle = await runFinanceDiagnosis(archetype.businessId, snap.id, USER_ID, WORKSPACE_ID);
  console.log(`[seed-e2e] finance diagnosis: cycle ${cycle.id}, findings ${cycle.findings.length}, actions ${cycle.actions.length}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
