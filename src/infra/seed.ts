// @ts-nocheck - seed script uses data definitions that don't strictly match schema but are handled at runtime
import { PrismaClient } from "@/generated/prisma/client";
import * as bcrypt from "bcryptjs";

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

  // Detect if it's a Neon endpoint
  const isNeon = databaseUrl.includes("neon.tech") ||
                 databaseUrl.includes("neon.database") ||
                 (databaseUrl.includes("sslmode=require") && databaseUrl.includes("?"));

  let client;

  if (isNeon) {
    // Neon: Use WebSocket adapter
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { PrismaNeon } = await import("@prisma/adapter-neon");

    const pool = new Pool({ connectionString: databaseUrl, ...neonConfig });
    const adapter = new PrismaNeon(pool);
    client = new PrismaClient({ adapter });
  } else {
    // Standard PostgreSQL: Use PG adapter
    const pg = await import("pg");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const pool = new pg.Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    client = new PrismaClient({ adapter });
  }

  return client;
}

async function seedDemoData(db: PrismaClient) {
  console.log("Seeding demo data...");

  // Create demo user
  let user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });

  if (!user) {
    const hashedPassword = await bcrypt.hash("demo-password-123", 10);
    user = await db.user.create({
      data: {
        email: DEMO_USER_EMAIL,
        name: "Demo Operator",
        hashedPassword,
      },
    });
    console.log("✓ Created demo user");
  }

  // Create demo client
  let client = await db.clientAccount.findFirst({
    where: { name: "Demo Manufacturing Corp" },
  });

  if (!client) {
    client = await db.clientAccount.create({
      data: {
        name: "Demo Manufacturing Corp",
        legalName: "Demo Manufacturing Corporation",
        industry: "Manufacturing",
        size: "medium",
        status: "active",
        website: "https://demo-mfg.example.com",
        address: "123 Industrial Ave, Factory City, ST 12345",
      },
    });
    console.log("✓ Created demo client");
  }

  // Create demo engagement
  let engagement = await db.engagement.findFirst({
    where: { code: "ENG-001" },
  });

  if (!engagement) {
    engagement = await db.engagement.create({
      data: {
        code: "ENG-001",
        title: "Operational Excellence Initiative",
        clientId: client.id,
        serviceTier: "premium",
        engagementMode: "expert",
        status: "active",
        healthStatus: "at_risk",
        interventionMode: "recovery",
        description: "Comprehensive intervention to improve operational efficiency and profitability",
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        targetEndDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
      },
    });
    console.log("✓ Created demo engagement");
  }

  // Create business condition profile
  let condition = await db.businessConditionProfile.findFirst({
    where: { engagementId: engagement.id, isCurrent: true },
  });

  if (!condition) {
    condition = await db.businessConditionProfile.create({
      data: {
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
        moraleFragilityLevel: "high",
        resilienceLevel: "low",
        growthReadinessLevel: "low",
      },
    });
    console.log("✓ Created business condition profile");
  }

  // Create findings
  const findingData = [
    {
      title: "Critical cash flow deterioration",
      category: "finance",
      severity: "critical",
      description: "Cash position has declined 40% over 6 months with declining trend",
      evidence: "Bank statements show operating cash flow negative for Q4",
    },
    {
      title: "Key person dependency",
      category: "people",
      severity: "critical",
      description: "Owner is bottleneck for all major decisions",
      evidence: "Organizational chart shows 8 direct reports to owner",
    },
    {
      title: "Outdated processes",
      category: "operations",
      severity: "high",
      description: "Manual processes cause delays and errors",
      evidence: "Process audit found 15+ manual approval workflows",
    },
  ];

  for (const fd of findingData) {
    const exists = await db.finding.findFirst({
      where: { engagementId: engagement.id, title: fd.title },
    });

    if (!exists) {
      const categoryToType: Record<string, string> = {
        finance: "market",
        people: "operational",
        operations: "operational",
      };

      await db.finding.create({
        data: {
          engagementId: engagement.id,
          title: fd.title,
          description: `${fd.description}\n\nEvidence: ${fd.evidence}`,
          findingType: categoryToType[fd.category] || "technical",
          impactArea: fd.category === "finance" ? "revenue" : "execution",
          severity: fd.severity,
          linkedEvidence: [],
          createdBy: user.id,
        },
      });
    }
  }
  console.log("✓ Created demo findings");

  // Create recommendations
  const recommendationData = [
    {
      title: "Implement cash management system",
      priority: "critical",
      description: "Deploy automated cash forecasting and management",
      expectedImpact: "Improve cash position by $200K within 90 days",
      implementationPhase: "phase_1",
    },
    {
      title: "Delegate decision authority",
      priority: "critical",
      description: "Establish decision delegation framework",
      expectedImpact: "Reduce owner overhead by 30%",
      implementationPhase: "phase_1",
    },
    {
      title: "Digitize core processes",
      priority: "high",
      description: "Automate manual workflows",
      expectedImpact: "Reduce operational costs by 15%",
      implementationPhase: "phase_2",
    },
  ];

  // Get findings for linking recommendations
  const findings = await db.finding.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });

  for (let i = 0; i < recommendationData.length; i++) {
    const rd = recommendationData[i];
    const exists = await db.recommendation.findFirst({
      where: { engagementId: engagement.id, title: rd.title },
    });

    if (!exists) {
      // Link to corresponding finding if it exists, otherwise use first finding
      const findingId = findings[i]?.id || findings[0]?.id;
      if (!findingId) continue; // Skip if no findings exist

      await db.recommendation.create({
        data: {
          engagementId: engagement.id,
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
  console.log("✓ Created demo recommendations");

  // Create actions
  const actionData = [
    {
      title: "Implement cash forecasting tool",
      priority: "critical",
      description: "Select and deploy 13-week rolling cash forecast",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "in_progress",
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
      blockageReason: "Waiting for owner approval on vendor list",
    },
  ];

  // Get recommendations for linking actions
  const recommendations = await db.recommendation.findMany({
    where: { engagementId: engagement.id },
    select: { id: true },
  });

  for (let i = 0; i < actionData.length; i++) {
    const ad = actionData[i];
    const exists = await db.action.findFirst({
      where: { engagementId: engagement.id, title: ad.title },
    });

    if (!exists) {
      // Link to corresponding recommendation if it exists, otherwise use first
      const recommendationId = recommendations[i]?.id || recommendations[0]?.id;
      if (!recommendationId) continue; // Skip if no recommendations exist

      await db.action.create({
        data: {
          engagementId: engagement.id,
          recommendationId,
          title: ad.title,
          description: ad.description,
          dueDate: ad.dueDate,
          priority: ad.priority,
          status: ad.status,
          blockerReason: ad.blockageReason,
        },
      });
    }
  }
  console.log("✓ Created demo actions");

  // Create KPIs
  const kpiData = [
    {
      name: "Cash Position",
      baseline: 500000,
      currentValue: 300000,
      targetValue: 600000,
      unit: "$",
      direction: "up",
    },
    {
      name: "Gross Margin",
      baseline: 35,
      currentValue: 32,
      targetValue: 40,
      unit: "%",
      direction: "up",
    },
    {
      name: "Owner Delegation Rate",
      baseline: 10,
      currentValue: 15,
      targetValue: 50,
      unit: "%",
      direction: "up",
    },
    {
      name: "Process Automation Coverage",
      baseline: 5,
      currentValue: 5,
      targetValue: 40,
      unit: "%",
      direction: "up",
    },
  ];

  for (const kd of kpiData) {
    const exists = await db.kPI.findFirst({
      where: { engagementId: engagement.id, name: kd.name },
    });

    if (!exists) {
      const kpi = await db.kPI.create({
        data: {
          engagementId: engagement.id,
          name: kd.name,
          description: `${kd.unit} - Target: ${kd.targetValue}${kd.unit}`,
          target: kd.targetValue,
          createdBy: user.id,
        },
      });

      // Create initial snapshot with current value
      await db.kPISnapshot.create({
        data: {
          kpiId: kpi.id,
          value: kd.currentValue,
          recordedBy: user.id,
        },
      });
    }
  }
  console.log("✓ Created demo KPIs");

  console.log("✅ Demo data seeding complete");
}

async function main() {
  const prisma = await createStagingSeedClient();
  await seedDemoData(prisma);
  return prisma;
}

main()
  .then(async (prisma) => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error("Error seeding demo data:", error);
    process.exit(1);
  });
