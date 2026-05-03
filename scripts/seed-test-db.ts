import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

async function seedTestDb() {
  const db = await getDb();

  try {
    console.log("🌱 Seeding test database...");

    // Create test workspace
    const workspaceId = uuidv4();
    const workspace = await db.workspace.upsert({
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
    const user = await db.user.upsert({
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
    const membership = await db.workspaceMembership.upsert({
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
    const engagement = await db.engagement.upsert({
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
    const engagementMembership = await db.engagementMembership.upsert({
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

    console.log("✓ Test database seeded\n");
    return { workspaceId, userId, engagementId };
  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  }
}

seedTestDb().catch((e) => {
  console.error(e);
  process.exit(1);
});
