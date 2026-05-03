import { v4 as uuidv4 } from "uuid";

async function seedTestDb() {
  try {
    // Dynamically import PrismaClient and adapter to avoid top-level await issues
    const { PrismaClient } = await import("../src/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL or TEST_DATABASE_URL environment variable is not set");
    }

    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    });
    const prisma = new PrismaClient({ adapter });

    console.log("🌱 Seeding test database...");

    // Create test user first (required for createdBy references)
    const userId = uuidv4();
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `test-${Date.now()}@example.com`,
        name: "Test User",
      },
    });
    console.log(`  ✓ Created user: ${user.id}`);

    // Create test workspace with required slug and createdBy
    const workspaceId = uuidv4();
    const workspaceSlug = `test-workspace-${Date.now()}`;
    const workspace = await prisma.workspace.upsert({
      where: { slug: workspaceSlug },
      update: {},
      create: {
        id: workspaceId,
        name: "Test Workspace",
        slug: workspaceSlug,
        createdBy: user.id,
      },
    });
    console.log(`  ✓ Created workspace: ${workspace.id}`);

    // Create workspace membership
    const membership = await prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: workspace.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        role: "owner",
      },
    });
    console.log(`  ✓ Created membership: ${membership.id}`);

    // Create test client account (required for engagement)
    const clientId = uuidv4();
    const client = await prisma.clientAccount.upsert({
      where: { id: clientId },
      update: {},
      create: {
        id: clientId,
        name: "Test Client",
      },
    });
    console.log(`  ✓ Created client: ${client.id}`);

    // Create test engagement with all required fields
    const engagementId = uuidv4();
    const engagementCode = `ENG-${Date.now()}`;
    const engagement = await prisma.engagement.upsert({
      where: { code: engagementCode },
      update: {},
      create: {
        id: engagementId,
        code: engagementCode,
        title: "Test Engagement",
        workspaceId: workspace.id,
        clientId: client.id,
        serviceTier: "standard",
        engagementMode: "expert",
        description: "Test Engagement",
        startDate: new Date(),
      },
    });
    console.log(`  ✓ Created engagement: ${engagement.id}`);

    // Create engagement membership with required role
    const engagementMembership = await prisma.engagementMembership.upsert({
      where: {
        userId_engagementId_role: {
          userId: user.id,
          engagementId: engagement.id,
          role: "lead",
        },
      },
      update: {},
      create: {
        userId: user.id,
        engagementId: engagement.id,
        role: "lead",
      },
    });
    console.log(`  ✓ Created engagement membership: ${engagementMembership.id}`);

    await prisma.$disconnect();
    console.log("✓ Test database seeded\n");
    return { workspaceId, userId, engagementId, clientId };
  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  }
}

seedTestDb()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
