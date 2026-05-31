// @ts-nocheck - seed script uses data definitions that don't strictly match schema but are handled at runtime
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

const { Pool } = pg;
const DEMO_USER_EMAIL = "operator@demo.local";

async function createStagingSeedClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Fail if placeholder detected
  if (/REPLACE_|PLACEHOLDER|your_neon_url|example\.com/.test(databaseUrl)) {
    throw new Error("DATABASE_URL contains placeholder value");
  }

  console.log("DATABASE_URL present for staging seed");

  // Always use pg adapter for staging seed (not Neon serverless)
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return { prisma, pool };
}

async function seedDemoData(db: PrismaClient) {
  console.log("Seeding demo data...");

  // Create or find demo workspace
  let workspace = await db.workspace.findFirst({
    where: { name: "Demo Workspace" },
  });

  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        name: "Demo Workspace",
        slug: "demo-workspace-" + Date.now(),
      },
    });
    console.log("✓ Created demo workspace");
  }

  // Create demo user
  let user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });

  if (!user) {
    const hashedPassword = await bcrypt.hash("demo-password-123", 10);
    const userId = randomUUID();
    user = await db.user.create({
      data: {
        id: userId,
        email: DEMO_USER_EMAIL,
        name: "Demo Operator",
        hashedPassword,
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created demo user");
  }

  // Create workspace membership for demo user
  let membership = await db.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });

  if (!membership) {
    membership = await db.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
      },
    });
    console.log("✓ Created workspace membership");
  }

  // Create UserRoleAssignment for demo user with admin role
  // This is required for capability resolution in getPolicyContext
  let roleAssignment = await db.userRoleAssignment.findFirst({
    where: {
      userId: user.id,
      scope: "workspace",
      scopeId: workspace.id,
      role: "admin_or_portfolio_manager",
    },
  });

  if (!roleAssignment) {
    const roleAssignmentId = randomUUID();
    roleAssignment = await db.userRoleAssignment.create({
      data: {
        id: roleAssignmentId,
        userId: user.id,
        role: "admin_or_portfolio_manager",
        scope: "workspace",
        scopeId: workspace.id,
        grantedAt: new Date(),
        isActive: true,
      },
    });
    console.log("✓ Created admin role assignment");
  }

  // Create demo client
  let client = await db.clientAccount.findFirst({
    where: { name: "Demo Manufacturing Corp" },
  });

  if (!client) {
    const clientId = randomUUID();
    client = await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Demo Manufacturing Corp",
        legalName: "Demo Manufacturing Corporation",
        industry: "Manufacturing",
        size: "medium",
        status: "active",
        website: "https://demo-mfg.example.com",
        address: "123 Industrial Ave, Factory City, ST 12345",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created demo client");
  }

  // Create demo engagement
  let engagement = await db.engagement.findFirst({
    where: { code: "ENG-001" },
  });

  if (!engagement) {
    const engagementId = randomUUID();
    engagement = await db.engagement.create({
      data: {
        id: engagementId,
        code: "ENG-001",
        title: "Operational Excellence Initiative",
        clientId: client.id,
        workspaceId: workspace.id,
        serviceTier: "premium",
        engagementMode: "expert",
        status: "active",
        healthStatus: "at_risk",
        interventionMode: "recovery",
        interventionPhase: "implementation",
        description: "Comprehensive intervention to improve operational efficiency and profitability",
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        targetEndDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
        visibility: "client_visible",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created demo engagement");
  }

  // Create engagement membership for demo user (required by assertEngagementAccess)
  let engagementMembership = await db.engagementMembership.findFirst({
    where: {
      userId: user.id,
      engagementId: engagement.id,
      role: "lead",
    },
  });

  if (!engagementMembership) {
    const membershipId = randomUUID();
    engagementMembership = await db.engagementMembership.create({
      data: {
        id: membershipId,
        userId: user.id,
        engagementId: engagement.id,
        role: "lead",
        addedBy: user.id,
        addedAt: new Date(),
        isActive: true,
      },
    });
    console.log("✓ Created engagement membership");
  }

  // Create business condition profile
  let condition = await db.businessConditionProfile.findFirst({
    where: { engagementId: engagement.id, isCurrent: true },
  });

  if (!condition) {
    const conditionId = randomUUID();
    condition = await db.businessConditionProfile.create({
      data: {
        id: conditionId,
        engagementId: engagement.id,
        businessStatus: "challenged",
        severityScore: 7,
        urgencyLevel: "high",
        cashPressureLevel: "high",
        marginPressureLevel: "medium",
        clientConcentrationRisk: "high",
        ownerDependencyRisk: "critical",
        keyPersonDependencyRisk: "medium",
        processMaturityLevel: "low",
        managementMaturityLevel: "medium",
        executionCapacityLevel: "medium",
        moralFragilityLevel: "high",
        resilienceLevel: "low",
        growthReadinessLevel: "low",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created business condition profile");
  }

  // Create demo evidence (required for findings)
  let evidence = await db.evidence.findFirst({
    where: { engagementId: engagement.id, title: "Demo Evidence" },
  });

  if (!evidence) {
    const evidenceId = randomUUID();
    evidence = await db.evidence.create({
      data: {
        id: evidenceId,
        engagementId: engagement.id,
        title: "Demo Evidence",
        description: "Supporting evidence for demo findings",
        source: "demo",
        status: "validated",
        updatedAt: new Date(),
      },
    });
    console.log("✓ Created demo evidence");
  }

  // Create findings
  const findingData = [
    {
      title: "Critical cash flow deterioration",
      summary: "Cash position has declined 40% over 6 months with declining trend",
      severity: "critical",
      source: "Bank statements show operating cash flow negative for Q4",
    },
    {
      title: "Key person dependency",
      summary: "Owner is bottleneck for all major decisions",
      severity: "critical",
      source: "Organizational chart shows 8 direct reports to owner",
    },
    {
      title: "Outdated processes",
      summary: "Manual processes cause delays and errors",
      severity: "high",
      source: "Process audit found 15+ manual approval workflows",
    },
  ];

  for (const fd of findingData) {
    const exists = await db.finding.findFirst({
      where: { engagementId: engagement.id, title: fd.title },
    });

    if (!exists) {
      const findingId = randomUUID();
      await db.finding.create({
        data: {
          id: findingId,
          engagementId: engagement.id,
          primaryEvidenceId: evidence.id,
          title: fd.title,
          summary: fd.summary,
          severity: fd.severity,
          impactArea: fd.severity === "critical" ? "revenue" : "execution",
          status: "identified",
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log("✓ Created demo findings");

  // Get findings for linking recommendations
  const findings = await db.finding.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });

  // Create recommendations
  const recommendationData = [
    {
      title: "Implement cash management system",
      priority: "critical",
      description: "Deploy automated cash forecasting and management",
      expectedImpact: "Improve cash position by $200K within 90 days",
    },
    {
      title: "Delegate decision authority",
      priority: "critical",
      description: "Establish decision delegation framework",
      expectedImpact: "Reduce owner overhead by 30%",
    },
    {
      title: "Digitize core processes",
      priority: "high",
      description: "Automate manual workflows",
      expectedImpact: "Reduce operational costs by 15%",
    },
  ];

  for (let i = 0; i < recommendationData.length; i++) {
    const rd = recommendationData[i];
    const exists = await db.recommendation.findFirst({
      where: { engagementId: engagement.id, title: rd.title },
    });

    if (!exists) {
      const findingId = findings[i]?.id || findings[0]?.id;
      if (findingId) {
        await db.recommendation.create({
          data: {
            engagementId: engagement.id,
            workspaceId: workspace.id,
            findingId,
            title: rd.title,
            description: rd.description,
            priority: rd.priority,
            estimatedImpact: rd.expectedImpact,
            status: "pending",
          },
        });
      }
    }
  }
  console.log("✓ Created demo recommendations");

  // Get recommendations for linking actions
  const recommendations = await db.recommendation.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });

  // Create actions
  const actionData = [
    {
      title: "Implement cash forecasting tool",
      priority: "critical",
      description: "Select and deploy 13-week rolling cash forecast",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "open",
    },
    {
      title: "Create delegation framework",
      priority: "critical",
      description: "Document decision authority and escalation rules",
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: "open",
    },
    {
      title: "Conduct process audit",
      priority: "high",
      description: "Map and analyze all key operational processes",
      dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      status: "open",
    },
    {
      title: "Vendor evaluation",
      priority: "high",
      description: "Evaluate 3 automation platforms",
      dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      status: "blocked",
    },
  ];

  for (let i = 0; i < actionData.length; i++) {
    const ad = actionData[i];
    const exists = await db.action.findFirst({
      where: { engagementId: engagement.id, title: ad.title },
    });

    if (!exists) {
      const recommendationId = recommendations[i]?.id || recommendations[0]?.id;
      const actionId = randomUUID();
      await db.action.create({
        data: {
          id: actionId,
          engagementId: engagement.id,
          recommendationId,
          title: ad.title,
          description: ad.description,
          dueAt: ad.dueDate,
          status: ad.status,
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log("✓ Created demo actions");

  // Create KPIs
  const kpiData = [
    { name: "Cash Position", target: 600000 },
    { name: "Gross Margin", target: 40 },
    { name: "Owner Delegation Rate", target: 50 },
    { name: "Process Automation Coverage", target: 40 },
  ];

  for (const kd of kpiData) {
    const exists = await db.kPI.findFirst({
      where: { engagementId: engagement.id, name: kd.name },
    });

    if (!exists) {
      const kpiId = randomUUID();
      const kpi = await db.kPI.create({
        data: {
          id: kpiId,
          engagementId: engagement.id,
          name: kd.name,
          target: kd.target,
          createdBy: user.id,
          updatedAt: new Date(),
        },
      });

      // Create initial snapshot
      const snapshotId = randomUUID();
      await db.kPISnapshot.create({
        data: {
          id: snapshotId,
          kpiId: kpi.id,
          value: kd.target * 0.5,
          recordedBy: user.id,
        },
      });
    }
  }
  console.log("✓ Created demo KPIs");

  console.log("✅ Demo data seeding complete");
}

async function main() {
  const { prisma, pool } = await createStagingSeedClient();
  try {
    await seedDemoData(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .catch((error) => {
    console.error("Error seeding demo data:", error);
    process.exit(1);
  });
