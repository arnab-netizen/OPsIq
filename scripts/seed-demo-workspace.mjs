#!/usr/bin/env node
/**
 * Deterministic demo workspace seed script
 * Idempotent: safe to run multiple times
 * Requires: DATABASE_URL environment variable
 */

const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  console.error("\n✗ DATABASE_URL_REQUIRED_FOR_DEMO_SEED");
  console.error("  Set DATABASE_URL=postgresql://user:password@host/dbname");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

async function seedDemoWorkspace() {
  console.log("\n🌱 Seeding demo workspace...\n");

  try {
    // 1. Create or get demo workspace
    const workspace = await prisma.workspace.upsert({
      where: { name: "DEMO Workspace" },
      update: {},
      create: {
        name: "DEMO Workspace",
        status: "ACTIVE",
        // demo flag set if schema supports it, otherwise mark in name
      },
    });
    console.log(`✓ Demo workspace: ${workspace.id}`);

    // 2. Create or get demo engagement
    const engagement = await prisma.engagement.upsert({
      where: {
        workspaceId_externalId: {
          workspaceId: workspace.id,
          externalId: "demo-engagement-001",
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        externalId: "demo-engagement-001",
        name: "Tech Startup - Growth Stage",
        businessConditionProfile: {
          industry: "Software/SaaS",
          revenueStage: "Growth ($5M-$50M ARR)",
          teamSize: "25-50",
          operationalMaturity: "EMERGING",
          keyRisks: ["Cash runway pressure", "Scaling team", "Product-market fit"],
        },
        interventionMode: "ADVISORY",
        interventionPhase: "DISCOVERY",
        health: "AT_RISK",
        status: "ACTIVE",
      },
    });
    console.log(`✓ Demo engagement: ${engagement.id}`);

    // 3. Create demo findings (risks and opportunities)
    const demoRiskFinding = await prisma.finding.upsert({
      where: {
        engagementId_externalId: {
          engagementId: engagement.id,
          externalId: "demo-finding-risk-001",
        },
      },
      update: {},
      create: {
        engagementId: engagement.id,
        externalId: "demo-finding-risk-001",
        title: "Engineering bandwidth constraint blocking roadmap",
        description:
          "Current engineering team is at 90% capacity. New feature requests are accumulating at 2x velocity.",
        category: "OPERATIONAL_RISK",
        severity: "HIGH",
        confidence: "HIGH_CONFIDENCE",
        supportingEvidenceIds: ["demo-kpi-001", "demo-kpi-002"],
        contradictingEvidenceIds: [],
        source: "STAKEHOLDER_INTERVIEW",
        status: "ACTIVE",
      },
    });
    console.log(`✓ Risk finding: ${demoRiskFinding.id}`);

    const demoOpportunityFinding = await prisma.finding.upsert({
      where: {
        engagementId_externalId: {
          engagementId: engagement.id,
          externalId: "demo-finding-opportunity-001",
        },
      },
      update: {},
      create: {
        engagementId: engagement.id,
        externalId: "demo-finding-opportunity-001",
        title: "Automation potential in customer onboarding process",
        description:
          "Manual onboarding currently takes 3-4 hours per customer. Identified 6 repeatable steps that could be templated.",
        category: "OPERATIONAL_OPPORTUNITY",
        severity: "MEDIUM",
        confidence: "HIGH_CONFIDENCE",
        supportingEvidenceIds: ["demo-process-001"],
        contradictingEvidenceIds: [],
        source: "PROCESS_ANALYSIS",
        status: "ACTIVE",
      },
    });
    console.log(`✓ Opportunity finding: ${demoOpportunityFinding.id}`);

    // 4. Create demo action (first recommended action)
    const demoAction = await prisma.action.upsert({
      where: {
        engagementId_externalId: {
          engagementId: engagement.id,
          externalId: "demo-action-001",
        },
      },
      update: {},
      create: {
        engagementId: engagement.id,
        externalId: "demo-action-001",
        title: "Hire or contract engineering capacity",
        description:
          "Bring in 1-2 contractors or junior engineers to unblock the feature backlog within 4 weeks",
        actionType: "HIRING",
        priority: "HIGH",
        status: "RECOMMENDED",
        expectedOutcome:
          "Reduce engineering backlog from 8 weeks to 2 weeks; unblock at least 3 customer feature requests",
        effort: "MEDIUM",
        riskLevel: "MEDIUM",
        recommendedBy: "ADVISOR",
        createdAt: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    });
    console.log(`✓ Demo action: ${demoAction.id}`);

    // 5. Create or link KPI evidence
    const demoKPI = await prisma.kpi.upsert({
      where: {
        engagementId_externalId: {
          engagementId: engagement.id,
          externalId: "demo-kpi-001",
        },
      },
      update: {},
      create: {
        engagementId: engagement.id,
        externalId: "demo-kpi-001",
        name: "Engineering Capacity Utilization",
        metricType: "UTILIZATION_PERCENT",
        currentValue: 90,
        benchmarkValue: 75,
        trend: "INCREASING",
        lastMeasuredAt: new Date(),
        description: "% of engineering team hours committed to active work",
      },
    });
    console.log(`✓ Demo KPI: ${demoKPI.id}`);

    console.log("\n✓ Demo workspace seeded successfully\n");
    console.log(`Workspace ID: ${workspace.id}`);
    console.log(`Engagement ID: ${engagement.id}`);
    console.log(`Risk Finding: ${demoRiskFinding.id}`);
    console.log(`Opportunity Finding: ${demoOpportunityFinding.id}`);
    console.log(`Action: ${demoAction.id}`);
    console.log(`KPI: ${demoKPI.id}\n`);
  } catch (error) {
    console.error("\n✗ Seed failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDemoWorkspace();
