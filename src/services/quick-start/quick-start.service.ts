import { db } from "@/lib/db";
import { generateBusinessImpact } from "../business-impact/business-impact.service";
import { calculateExecutionCertainty } from "../execution-certainty";
import { detectExecutionDrift } from "../execution-drift/execution-drift.service";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { getFinancialDelta } from "../financial/financial-mapping.service";
import { logger } from "@/infra/logger";

export interface QuickStartInput {
  businessName: string;
  monthlyRevenueINR?: number;
  problems: string[];
}

export interface QuickStartResult {
  clientId: string;
  engagementId: string;
  primaryDecision: string;
  businessImpact: string;
  executionCertainty: number;
  valueAtRiskINR: number;
  nextAction: string;
}

export async function createQuickStartEngagement(
  input: QuickStartInput
): Promise<QuickStartResult> {
  const { businessName, monthlyRevenueINR, problems } = input;

  if (!businessName || problems.length === 0) {
    throw new Error("Business name and at least one problem are required");
  }

  // 1. Create client
  const client = await db.client.create({
    data: {
      name: businessName,
      status: "active",
    },
  });

  logger.debug("Created client for quick start", { clientId: client.id, businessName });

  // 2. Create engagement
  const engagement = await db.engagement.create({
    data: {
      code: `QUICK-START-${Date.now()}`,
      title: `${businessName} - Quick Start`,
      status: "active",
      clientId: client.id,
    },
  });

  logger.debug("Created engagement for quick start", { engagementId: engagement.id });

  // 3. Create business condition profile
  const condition = await db.businessConditionProfile.create({
    data: {
      engagementId: engagement.id,
      estimatedMonthlyRevenue: monthlyRevenueINR ?? 1000000,
      isCurrent: true,
      currentPerformanceLevel: "critical",
    },
  });

  // 4. Create findings from problems
  const findings = await Promise.all(
    problems.map((problem, index) =>
      db.finding.create({
        data: {
          engagementId: engagement.id,
          title: problem,
          description: problem,
          severity: index === 0 ? "critical" : index === 1 ? "high" : "medium",
          verified: false,
          stage: "identified",
        },
      })
    )
  );

  logger.debug("Created findings from problems", {
    engagementId: engagement.id,
    findingCount: findings.length,
  });

  // 5. Fetch findings for certainty calculation
  const findingsForCertainty = findings.map((f) => ({
    id: f.id,
    severity: (f.severity as "low" | "medium" | "high" | "critical") || "medium",
    resolved: false,
    verified: f.verified ?? false,
  }));

  // 6. Calculate execution certainty
  const certainty = calculateExecutionCertainty(
    engagement.id,
    findingsForCertainty,
    [],
    []
  );

  // 7. Generate business impact
  const impact = await generateBusinessImpact(engagement.id, "system");

  // 8. Detect execution drift
  const drift = await detectExecutionDrift(engagement.id);

  // 9. Compute decision confidence
  const confidence = await computeDecisionConfidence({
    engagementId: engagement.id,
  });

  // 10. Get financial delta
  const financial = getFinancialDelta(
    "medium",
    impact.impactLevel,
    monthlyRevenueINR ?? 1000000
  );

  // 11. Determine primary decision
  let primaryDecision = "Monitor";
  if (drift.severity === "critical" || impact.impactLevel === "existential") {
    primaryDecision = "Immediate intervention required";
  } else if (impact.impactLevel === "critical" || drift.severity === "high") {
    primaryDecision = "Intervention needed within 7 days";
  } else if (certainty.score < 60) {
    primaryDecision = "Clarify situation before intervention";
  }

  // 12. Determine next action
  let nextAction = "Review findings in detail";
  if (impact.impactLevel === "critical" || impact.impactLevel === "existential") {
    nextAction = "Schedule intervention planning session";
  } else if (problems.length > 0) {
    nextAction = `Address: ${problems[0]}`;
  }

  logger.debug("Quick start engagement created successfully", {
    engagementId: engagement.id,
    clientId: client.id,
    impactLevel: impact.impactLevel,
    certaintyScore: certainty.score,
  });

  return {
    clientId: client.id,
    engagementId: engagement.id,
    primaryDecision,
    businessImpact: impact.impactLevel,
    executionCertainty: certainty.score,
    valueAtRiskINR: financial.actualLoss ?? 0,
    nextAction,
  };
}
