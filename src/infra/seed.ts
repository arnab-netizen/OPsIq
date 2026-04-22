import { db } from "@/lib/db";

const DEMO_USER_EMAIL = "operator@demo.local";

async function seedDemoData() {
  console.log("Seeding demo data...");

  // Create demo user
  let user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        email: DEMO_USER_EMAIL,
        name: "Demo Operator",
        hashedPassword: "hashed_password_demo",
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
      await db.finding.create({
        data: {
          engagementId: engagement.id,
          ...fd,
          discoveredBy: user.id,
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

  for (const rd of recommendationData) {
    const exists = await db.recommendation.findFirst({
      where: { engagementId: engagement.id, title: rd.title },
    });

    if (!exists) {
      await db.recommendation.create({
        data: {
          engagementId: engagement.id,
          ...rd,
          recommendedBy: user.id,
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

  for (const ad of actionData) {
    const exists = await db.action.findFirst({
      where: { engagementId: engagement.id, title: ad.title },
    });

    if (!exists) {
      await db.action.create({
        data: {
          engagementId: engagement.id,
          ...ad,
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
      await db.kPI.create({
        data: {
          engagementId: engagement.id,
          ...kd,
          measurementDate: new Date(),
        },
      });
    }
  }
  console.log("✓ Created demo KPIs");

  // Create deliverable
  let deliverable = await db.deliverable.findFirst({
    where: { engagementId: engagement.id, title: "Initial Assessment Report" },
  });

  if (!deliverable) {
    deliverable = await db.deliverable.create({
      data: {
        engagementId: engagement.id,
        type: "assessment",
        title: "Initial Assessment Report",
        summary: "Comprehensive assessment of current state, root causes, and intervention roadmap",
        findings: JSON.stringify([
          { title: "Critical cash flow deterioration", severity: "critical" },
          { title: "Key person dependency", severity: "critical" },
        ]),
        recommendations: JSON.stringify([
          { title: "Implement cash management system", priority: "critical" },
          { title: "Delegate decision authority", priority: "critical" },
        ]),
        actions: JSON.stringify([
          { title: "Implement cash forecasting tool", status: "in_progress" },
          { title: "Create delegation framework", status: "open" },
        ]),
        kpis: JSON.stringify([
          { name: "Cash Position", baseline: 500000, current: 300000, target: 600000 },
          { name: "Gross Margin", baseline: 35, current: 32, target: 40 },
        ]),
        reviewStatus: "approved",
        reviewedBy: user.id,
        reviewedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        deliveredDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    console.log("✓ Created demo deliverable");
  }

  console.log("✅ Demo data seeding complete");
}

seedDemoData().catch((e) => {
  console.error("Error seeding demo data:", e);
  process.exit(1);
});
