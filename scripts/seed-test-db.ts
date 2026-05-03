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

    // Create test workspace
    const workspaceId = uuidv4();
    const workspace = await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: {
        id: workspaceId,
        name: "Test Workspace",
      },
    });
    console.log(`  ✓ Created workspace: ${workspace.id}`);

    // Create test user
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

    // Create test engagement
    const engagementId = uuidv4();
    const engagement = await prisma.engagement.upsert({
      where: { id: engagementId },
      update: {},
      create: {
        id: engagementId,
        workspaceId: workspace.id,
        clientName: "Test Client",
        description: "Test Engagement",
        businessProblem: "Test Problem",
        condition: "healthy",
        interventionMode: "operational",
        interventionPhase: "assess",
        executionCertainty: 50,
        startDate: new Date(),
      },
    });
    console.log(`  ✓ Created engagement: ${engagement.id}`);

    // Create engagement membership
    const engagementMembership = await prisma.engagementMembership.upsert({
      where: {
        userId_engagementId: {
          userId: user.id,
          engagementId: engagement.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        engagementId: engagement.id,
        isActive: true,
      },
    });
    console.log(`  ✓ Created engagement membership: ${engagementMembership.id}`);

    await prisma.$disconnect();
    console.log("✓ Test database seeded\n");
    return { workspaceId, userId, engagementId };
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
