import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcryptjs";

// Deterministic test IDs (not random)
const TEST_USER_ID = "10000000-0000-0000-0000-000000000001";
const TEST_WORKSPACE_ID = "20000000-0000-0000-0000-000000000001";
const TEST_WORKSPACE_MEMBERSHIP_ID = "21000000-0000-0000-0000-000000000001";
const TEST_CLIENT_ID = "30000000-0000-0000-0000-000000000001";
const TEST_ENGAGEMENT_ID = "40000000-0000-0000-0000-000000000001";
const TEST_ENGAGEMENT_MEMBERSHIP_ID = "41000000-0000-0000-0000-000000000001";
const TEST_PASSWORD = "test-password-123";
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

// Validation: Ensure all required fields are provided
function validateSeedData() {
  const errors: string[] = [];

  // User: Required field is email
  if (!TEST_USER_ID) errors.push("User: id missing");

  // Workspace: Required fields are name, slug, createdBy
  if (!TEST_WORKSPACE_ID) errors.push("Workspace: id missing");
  if (!TEST_USER_ID) errors.push("Workspace: createdBy (userId) missing");

  // WorkspaceMembership: Required fields are workspaceId, userId, role
  if (!TEST_WORKSPACE_ID) errors.push("WorkspaceMembership: workspaceId missing");
  if (!TEST_USER_ID) errors.push("WorkspaceMembership: userId missing");

  // ClientAccount: Required field is name
  if (!TEST_CLIENT_ID) errors.push("ClientAccount: id missing");

  // Engagement: Required fields are code, title, clientId, workspaceId, serviceTier, engagementMode
  if (!TEST_ENGAGEMENT_ID) errors.push("Engagement: id missing");
  if (!TEST_CLIENT_ID) errors.push("Engagement: clientId missing");
  if (!TEST_WORKSPACE_ID) errors.push("Engagement: workspaceId missing");

  // EngagementMembership: Required fields are userId, engagementId, role
  if (!TEST_USER_ID) errors.push("EngagementMembership: userId missing");
  if (!TEST_ENGAGEMENT_ID) errors.push("EngagementMembership: engagementId missing");

  if (errors.length > 0) {
    throw new Error(`Seed validation failed:\n${errors.join("\n")}`);
  }
}

async function seedTestDb() {
  try {
    // Validate seed data before Prisma operations
    validateSeedData();

    // Dynamically import PrismaClient to avoid top-level await issues
    const { PrismaClient } = await import("../src/generated/prisma/client");

    const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL or TEST_DATABASE_URL environment variable is not set");
    }

    let prisma: InstanceType<typeof PrismaClient>;

    // Use appropriate adapter based on database URL
    if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
      // Local PostgreSQL - use native pg adapter
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: databaseUrl });
      const adapter = new PrismaPg(pool);
      prisma = new PrismaClient({ adapter });
    } else {
      // Remote (Neon or other) - use serverless adapter
      const { Pool, neonConfig } = await import("@neondatabase/serverless");
      const { PrismaNeon } = await import("@prisma/adapter-neon");
      const pool = new Pool({ connectionString: databaseUrl, ...neonConfig });
      // @ts-expect-error - Pool type mismatch between @neondatabase/serverless and @prisma/adapter-neon
      const adapter = new PrismaNeon(pool);
      prisma = new PrismaClient({ adapter });
    }

    console.log("🌱 Seeding test database...");

    // Create test user first (required for createdBy references)
    // Required: id, email, updatedAt
    const user = await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: "test-seed@example.com",
        name: "Test Seed User",
        hashedPassword: TEST_PASSWORD_HASH,
        updatedAt: new Date(),
      },
    });
    console.log(`  ✓ Created user: ${user.id} (${user.email})`);

    // Create test workspace with required fields
    // Required: name, slug, createdBy
    const workspace = await prisma.workspace.upsert({
      where: { slug: "test-seed-workspace" },
      update: {},
      create: {
        id: TEST_WORKSPACE_ID,
        name: "Test Seed Workspace",
        slug: "test-seed-workspace",
        createdBy: TEST_USER_ID,
        description: "Test workspace for seed verification",
      },
    });
    console.log(`  ✓ Created workspace: ${workspace.id} (${workspace.slug})`);

    // Create workspace membership
    // Required: workspaceId, userId, role
    const membership = await prisma.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: TEST_WORKSPACE_ID,
          userId: TEST_USER_ID,
        },
      },
      update: {},
      create: {
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        role: "owner",
      },
    });
    console.log(`  ✓ Created workspace membership: ${membership.id}`);

    // Create test client account
    // Required: id, name, updatedAt
    const client = await prisma.clientAccount.upsert({
      where: { id: TEST_CLIENT_ID },
      update: {},
      create: {
        id: TEST_CLIENT_ID,
        name: "Test Seed Client",
        industry: "Technology",
        status: "active",
        updatedAt: new Date(),
      },
    });
    console.log(`  ✓ Created client: ${client.id} (${client.name})`);

    // Create test engagement with all required fields
    // Required: code, title, clientId, workspaceId, serviceTier, engagementMode, updatedAt
    const engagement = await prisma.engagement.upsert({
      where: { code: "TEST-SEED-001" },
      update: {},
      create: {
        id: TEST_ENGAGEMENT_ID,
        code: "TEST-SEED-001",
        title: "Test Seed Engagement",
        clientId: TEST_CLIENT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        serviceTier: "standard",
        engagementMode: "expert",
        description: "Test engagement for seed verification",
        status: "draft",
        healthStatus: "healthy",
        updatedAt: new Date(),
      },
    });
    console.log(`  ✓ Created engagement: ${engagement.id} (${engagement.code})`);

    // Create engagement membership with required role
    // Required: id, userId, engagementId, role
    const engagementMembership = await prisma.engagementMembership.upsert({
      where: {
        userId_engagementId_role: {
          userId: TEST_USER_ID,
          engagementId: TEST_ENGAGEMENT_ID,
          role: "lead",
        },
      },
      update: {},
      create: {
        id: TEST_ENGAGEMENT_MEMBERSHIP_ID,
        userId: TEST_USER_ID,
        engagementId: TEST_ENGAGEMENT_ID,
        role: "lead",
      },
    });
    console.log(`  ✓ Created engagement membership: ${engagementMembership.id}`);

    await prisma.$disconnect();
    console.log("✓ Test database seeded successfully\n");
    return {
      userId: TEST_USER_ID,
      workspaceId: TEST_WORKSPACE_ID,
      clientId: TEST_CLIENT_ID,
      engagementId: TEST_ENGAGEMENT_ID,
    };
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
