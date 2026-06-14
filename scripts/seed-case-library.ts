/**
 * Seed the case library with sample case studies.
 * Run with: npx tsx scripts/seed-case-library.ts
 */

async function main() {
  const { getDbInstance } = await import("@/lib/db");
  const db = await getDbInstance();

  console.log("Seeding case library with sample cases...");

  const cases = [
    {
      id: "case_saas_2025_revenue_collapse",
      title: "SaaS Startup Revenue Collapse — Failed Product Pivot",
      description:
        "A B2B SaaS startup lost 70% of MRR within Q1 2025 due to a failed product pivot away from its core customer base. The founder reversed the pivot quickly but customer trust was damaged.",
      industry: "SaaS",
      businessModel: "subscription",
      businessSize: "startup",
      year: 2025,
      yearStart: 2024,
      yearEnd: 2025,
      symptoms: JSON.stringify([
        {
          symptomId: "sym_saas_001",
          category: "revenue_decline",
          description: "MRR dropped from $50K to $15K in Q1 2025",
          severity: "critical",
          observationPeriod: "Q1 2025",
        },
        {
          symptomId: "sym_saas_002",
          category: "customer_churn",
          description: "Lost 85% of core customer cohort",
          severity: "critical",
          observationPeriod: "Jan-Mar 2025",
        },
      ]),
      availableData: JSON.stringify([
        {
          evidenceId: "ev_saas_001",
          type: "financial",
          description: "Monthly recurring revenue tracking from Stripe",
          metric: "MRR declined 70% YoY",
          timeframe: "Jan-Mar 2025",
          sourceReference: "internal_stripe_export",
        },
        {
          evidenceId: "ev_saas_002",
          type: "operational",
          description: "Customer feedback on product changes",
          metric: "85% of core cohort churned",
          timeframe: "Feb-Mar 2025",
          sourceReference: "customer_interviews",
        },
      ]),
      hiddenRootCauses: JSON.stringify([
        {
          causeId: "cause_saas_hidden_001",
          description: "Product pivot alienated core customer segment",
          category: "execution_failure",
          probability: 0.85,
          evidenceSupporting: ["ev_saas_001", "ev_saas_002"],
        },
      ]),
      hiddenCausesSummary:
        "Core customer segment abandoned due to product strategy shift from specialized to generalized offering",
      expertIdentifiedCauses: JSON.stringify([
        {
          causeId: "cause_saas_expert_001",
          description:
            "Product pivot removed specialized feature set that justified premium pricing",
          category: "execution_failure",
          probability: 0.85,
          evidenceSupporting: ["ev_saas_001", "ev_saas_002"],
        },
      ]),
      expertCausesSummary:
        "Expert analysis confirmed product strategy misalignment as primary cause of customer loss and revenue decline",
      actionsTaken: JSON.stringify([
        {
          actionId: "action_saas_001",
          description: "Immediately reverted product to previous feature set",
          timeToImplement: "2 weeks",
          estimatedCost: "Low",
          responsible: "CEO",
        },
        {
          actionId: "action_saas_002",
          description: "Launched customer win-back campaign",
          timeToImplement: "1 month",
          estimatedCost: "Medium",
          responsible: "Head of Marketing",
        },
      ]),
      actualOutcome: JSON.stringify({
        outcomeId: "outcome_saas_001",
        timeframe: "Q2 2025",
        metricsImproved: [
          {
            metric: "MRR",
            startValue: "$15K",
            endValue: "$40K",
            improvement: "+167%",
          },
          {
            metric: "Net churn",
            startValue: "15%",
            endValue: "3%",
            improvement: "-80%",
          },
        ],
        statusAchieved: "partially_resolved",
        keySuccessFactors: [
          "Fast decision-making and reversion",
          "Transparent customer communication",
          "Product team accountability",
        ],
        lessonsLearned: [
          "Always validate major product changes with customer cohort first",
          "Preserve core product value proposition",
          "Maintain customer advisory board feedback loop",
        ],
      }),
      sources: JSON.stringify([
        {
          sourceId: "src_saas_001",
          title: "Founder post-mortem and internal Stripe export",
          sourceType: "manual_summary",
          url: null,
          licenseType: "internal_proprietary",
          allowedUse:
            "Educational and diagnosis benchmarking use only, internal case study",
          accessedDate: new Date("2025-06-01").toISOString(),
          citation: "OpsIQ Case Library: SaaS Revenue Collapse 2025",
        },
      ]),
      licenseOrAllowedUse:
        "Internal case study from founder post-mortem and internal financial records. Educational use for diagnosis benchmarking only.",
      confidence: "0.85",
      dataCompleteness: "0.80",
      expertValidated: true,
    },
    {
      id: "case_retail_2024_inventory_crisis",
      title: "Retail Chain Inventory Mismanagement — Markdown Spiral",
      description:
        "A mid-market retail chain faced escalating inventory obsolescence in 2024 due to poor demand forecasting and slow inventory turnover. Aggressive markdowns eroded margins.",
      industry: "retail",
      businessModel: "direct_sales",
      businessSize: "medium",
      year: 2024,
      yearStart: 2024,
      yearEnd: 2024,
      symptoms: JSON.stringify([
        {
          symptomId: "sym_retail_001",
          category: "profitability",
          description: "Gross margin compressed 8% YoY",
          severity: "high",
          observationPeriod: "H2 2024",
        },
        {
          symptomId: "sym_retail_002",
          category: "operational",
          description: "Inventory obsolescence increased 45%",
          severity: "high",
          observationPeriod: "Q3-Q4 2024",
        },
      ]),
      availableData: JSON.stringify([
        {
          evidenceId: "ev_retail_001",
          type: "financial",
          description: "Quarterly margin analysis from GL",
          metric: "Gross margin: 42% → 34%",
          timeframe: "2024",
          sourceReference: "internal_gl_export",
        },
        {
          evidenceId: "ev_retail_002",
          type: "operational",
          description: "Inventory aging report",
          metric: "45% increase in >90 day aged inventory",
          timeframe: "2024",
          sourceReference: "erp_inventory_system",
        },
      ]),
      hiddenRootCauses: JSON.stringify([
        {
          causeId: "cause_retail_hidden_001",
          description:
            "Demand forecasting model failed to account for consumer preference shift to online shopping",
          category: "market_shift",
          probability: 0.7,
          evidenceSupporting: ["ev_retail_001", "ev_retail_002"],
        },
      ]),
      hiddenCausesSummary:
        "Forecasting model did not adapt to retail disruption from e-commerce growth",
      expertIdentifiedCauses: JSON.stringify([
        {
          causeId: "cause_retail_expert_001",
          description:
            "Forecasting model lagged consumer shift toward online channels",
          category: "market_shift",
          probability: 0.7,
          evidenceSupporting: ["ev_retail_002"],
        },
        {
          causeId: "cause_retail_expert_002",
          description: "Slow markdown decision-making process",
          category: "execution_failure",
          probability: 0.65,
          evidenceSupporting: ["ev_retail_001"],
        },
      ]),
      expertCausesSummary:
        "Combination of market shift toward e-commerce and slow inventory liquidation response",
      actionsTaken: JSON.stringify([
        {
          actionId: "action_retail_001",
          description: "Implemented dynamic markdown engine",
          timeToImplement: "3 months",
          estimatedCost: "High",
          responsible: "VP Merchandising",
        },
        {
          actionId: "action_retail_002",
          description: "Upgraded demand forecasting model with ML",
          timeToImplement: "6 months",
          estimatedCost: "High",
          responsible: "VP Analytics",
        },
      ]),
      actualOutcome: JSON.stringify({
        outcomeId: "outcome_retail_001",
        timeframe: "2025 (ongoing)",
        metricsImproved: [
          {
            metric: "Inventory obsolescence",
            startValue: "12%",
            endValue: "4%",
            improvement: "-67%",
          },
          {
            metric: "Gross margin",
            startValue: "34%",
            endValue: "37%",
            improvement: "+3pp",
          },
        ],
        statusAchieved: "ongoing",
        keySuccessFactors: [
          "Executive commitment to technology investment",
          "Integration with merchandising workflow",
          "Regular model retraining",
        ],
        lessonsLearned: [
          "Forecasting models require continuous market signal updates",
          "Markdown velocity is critical in fast-moving retail",
          "Cross-channel strategy is now essential",
        ],
      }),
      sources: JSON.stringify([
        {
          sourceId: "src_retail_001",
          title: "Internal GL exports, ERP inventory system, management interviews",
          sourceType: "manual_summary",
          url: null,
          licenseType: "internal_proprietary",
          allowedUse: "Educational case study for retail diagnosis",
          accessedDate: new Date("2025-06-01").toISOString(),
          citation: "OpsIQ Case Library: Retail Inventory Crisis 2024",
        },
      ]),
      licenseOrAllowedUse:
        "Internal case study compiled from financial records and operational systems. Educational use for retail operations diagnosis only.",
      confidence: "0.80",
      dataCompleteness: "0.75",
      expertValidated: true,
    },
    {
      id: "case_manufacturing_2024_supply_chain_shock",
      title: "Manufacturing Supply Chain Shock — Sole Supplier Dependency",
      description:
        "A manufacturing company faced production halt when its sole supplier of critical components went offline unexpectedly in 2024.",
      industry: "manufacturing",
      businessModel: "direct_sales",
      businessSize: "large",
      year: 2024,
      yearStart: 2024,
      yearEnd: 2024,
      symptoms: JSON.stringify([
        {
          symptomId: "sym_mfg_001",
          category: "operational",
          description: "Production halted for 3 weeks",
          severity: "critical",
          observationPeriod: "Q2 2024",
        },
        {
          symptomId: "sym_mfg_002",
          category: "revenue_decline",
          description: "Quarterly revenue missed by 12%",
          severity: "high",
          observationPeriod: "Q2 2024",
        },
      ]),
      availableData: JSON.stringify([
        {
          evidenceId: "ev_mfg_001",
          type: "operational",
          description: "Production schedule impact",
          metric: "21-day production halt",
          timeframe: "Week of April 15, 2024",
          sourceReference: "production_log",
        },
        {
          evidenceId: "ev_mfg_002",
          type: "financial",
          description: "Revenue shortfall",
          metric: "$2.1M revenue miss",
          timeframe: "Q2 2024",
          sourceReference: "sales_system",
        },
      ]),
      hiddenRootCauses: JSON.stringify([
        {
          causeId: "cause_mfg_hidden_001",
          description: "Sole reliance on single supplier with no backup",
          category: "execution_failure",
          probability: 0.95,
          evidenceSupporting: ["ev_mfg_001"],
        },
      ]),
      hiddenCausesSummary:
        "Critical component sourced exclusively from single supplier with no redundancy",
      expertIdentifiedCauses: JSON.stringify([
        {
          causeId: "cause_mfg_expert_001",
          description: "No supply chain diversification",
          category: "execution_failure",
          probability: 0.95,
          evidenceSupporting: ["ev_mfg_001", "ev_mfg_002"],
        },
      ]),
      expertCausesSummary:
        "Critical single-point-of-failure in supply chain due to sole supplier dependency",
      actionsTaken: JSON.stringify([
        {
          actionId: "action_mfg_001",
          description: "Onboarded secondary supplier",
          timeToImplement: "2 months",
          estimatedCost: "Medium",
          responsible: "VP Supply Chain",
        },
        {
          actionId: "action_mfg_002",
          description: "Implemented supplier risk dashboard",
          timeToImplement: "1 month",
          estimatedCost: "Low",
          responsible: "Head of Procurement",
        },
      ]),
      actualOutcome: JSON.stringify({
        outcomeId: "outcome_mfg_001",
        timeframe: "2024-2025",
        metricsImproved: [
          {
            metric: "Supply chain resilience",
            startValue: "Single supplier",
            endValue: "Dual supplier with 80/20 split",
            improvement: "Redundancy restored",
          },
          {
            metric: "Risk assessment",
            startValue: "Reactive",
            endValue: "Proactive monitoring",
            improvement: "Early warning enabled",
          },
        ],
        statusAchieved: "resolved",
        keySuccessFactors: [
          "Executive commitment to supplier diversification",
          "Willingness to accept cost increase for resilience",
          "Strong procurement team execution",
        ],
        lessonsLearned: [
          "Always maintain N+1 redundancy for critical components",
          "Supplier concentration risk is existential",
          "Risk dashboards enable earlier intervention",
        ],
      }),
      sources: JSON.stringify([
        {
          sourceId: "src_mfg_001",
          title: "Internal production logs, sales system, management interviews",
          sourceType: "manual_summary",
          url: null,
          licenseType: "internal_proprietary",
          allowedUse: "Educational case study for manufacturing operations",
          accessedDate: new Date("2025-06-01").toISOString(),
          citation: "OpsIQ Case Library: Manufacturing Supply Chain Shock 2024",
        },
      ]),
      licenseOrAllowedUse:
        "Internal case study from production and sales systems. Educational use for manufacturing operations diagnosis only.",
      confidence: "0.90",
      dataCompleteness: "0.85",
      expertValidated: true,
    },
  ];

  for (const caseData of cases) {
    try {
      const existing = await db.caseStudy.findUnique({
        where: { id: caseData.id },
      });

      if (!existing) {
        await db.caseStudy.create({
          data: {
            ...caseData,
            sources: caseData.sources,
          } as any,
        });
        console.log(`✓ Created case: ${caseData.title}`);
      } else {
        console.log(`✓ Case already exists: ${caseData.title}`);
      }
    } catch (error) {
      console.error(
        `✗ Failed to create case ${caseData.id}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  console.log("\nCase library seeding complete!");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
