/**
 * E2E owner seed — creates the loginable owner the Playwright owner-flow spec uses
 * (test1@staging.local / password123, OWNER of a workspace) and seeds the laundry archetype
 * so the owner command center renders real backend data. Used only by the owner-e2e CI lane.
 */
import * as bcrypt from "bcryptjs";

const USER_ID = "10000000-0000-0000-0000-0000000000e2";
const WORKSPACE_ID = "20000000-0000-0000-0000-0000000000e2";
const EMAIL = "test1@staging.local";
const PASSWORD = "password123";

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
    update: { role: "owner" },
    create: { workspaceId: WORKSPACE_ID, userId: USER_ID, role: "owner" },
  });
  console.log(`[seed-e2e] owner ${EMAIL} + workspace ${WORKSPACE_ID} ready`);

  // Best-effort: seed the laundry archetype so the control center renders rich owner data.
  try {
    const { seedLaundryArchetype } = await import("../src/services/owner-mode/archetype-seed.service");
    const r = await seedLaundryArchetype({ workspaceId: WORKSPACE_ID, actorId: USER_ID, env: "test" });
    console.log(`[seed-e2e] archetype seeded: business ${r.businessId}, equipment ${r.equipmentCount}`);
  } catch (e) {
    console.warn(`[seed-e2e] archetype seed skipped: ${(e as Error).message}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
