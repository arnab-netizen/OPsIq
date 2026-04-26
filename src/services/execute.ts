import { createClient } from "./client-account.js";
import { createEngagement } from "./engagement.js";
import { createFinding } from "./findings.js";
import { diagnoseBusiness } from "./diagnosis.js";
import { ValidationError } from "../infra/errors.js";
import { logger } from "../infra/logger.js";

export interface ExecuteInput {
  clientName: string;
  problem: string;
  findings: string[];
  priority: "low" | "medium" | "high" | "critical";
}

export interface ExecuteOutput {
  engagementId: string;
  clientId: string;
  status: string;
  health: {
    status: string;
    reasons: string[];
  };
  findings: Array<{
    id: string;
    title: string;
  }>;
  actions: Array<{
    title: string;
    priority: string;
  }>;
  blockers: string[];
  risks: string[];
}

export async function executeWorkflow(
  input: ExecuteInput,
  actorId: string
): Promise<ExecuteOutput> {
  logger.info("Executing workflow", {
    clientName: input.clientName,
    findings: input.findings.length,
    priority: input.priority,
  });

  // Validate input
  if (!input.clientName?.trim()) {
    throw new ValidationError("Client name is required");
  }
  if (!input.problem?.trim()) {
    throw new ValidationError("Problem statement is required");
  }
  if (!Array.isArray(input.findings) || input.findings.length === 0) {
    throw new ValidationError("At least one finding is required");
  }

  // 1. Create client
  logger.info("Creating client", { clientName: input.clientName });
  const client = await createClient(
    {
      name: input.clientName,
      notes: `Problem: ${input.problem}`,
    },
    actorId
  );

  // 2. Create engagement
  logger.info("Creating engagement", { clientId: client.id });
  const engagement = await createEngagement(
    {
      title: input.problem,
      clientId: client.id,
      serviceTier: "standard",
      engagementMode: "expert",
      interventionMode: "recovery",
      description: input.problem,
    },
    actorId
  );

  // 3. Create findings
  const createdFindings = [];
  for (const findingTitle of input.findings) {
    logger.info("Creating finding", { title: findingTitle });
    const finding = await createFinding(
      {
        engagementId: engagement.id,
        title: findingTitle,
        summary: `Finding: ${findingTitle}`,
        severity: input.priority === "critical" ? "critical" : input.priority === "high" ? "high" : "medium",
        impactArea: "execution",
      },
      actorId
    );
    createdFindings.push(finding);
  }

  // 4. Run diagnosis
  logger.info("Running business diagnosis");
  const diagnosis = await diagnoseBusiness(
    {
      businessName: input.clientName,
      businessType: "consulting_client",
      problemStatement: input.problem,
      mainIssue: input.findings[0],
      monthlyRevenue: 100000,
      monthlyCosts: 75000,
      customerCount: 50,
    },
    actorId
  );

  // 5. Build output
  const recommendedActions = diagnosis.actionPlan.map((action) => ({
    title: action.action,
    priority: action.priority,
  }));

  const blockers: string[] = [];
  const risks: string[] = [];

  if (diagnosis.severity === "critical") {
    risks.push("Critical business risk detected - immediate intervention required");
  } else if (diagnosis.severity === "high") {
    risks.push("High business risk detected - urgent action needed");
  }

  if (diagnosis.executiveBrief.warnings.length > 0) {
    blockers.push(...diagnosis.executiveBrief.warnings);
  }

  const output: ExecuteOutput = {
    engagementId: engagement.id,
    clientId: client.id,
    status: "draft",
    health: {
      status: diagnosis.severity === "critical" ? "blocked" : diagnosis.severity === "high" ? "at_risk" : "healthy",
      reasons: diagnosis.executiveBrief.warnings,
    },
    findings: createdFindings.map((f) => ({
      id: f.id,
      title: f.title,
    })),
    actions: recommendedActions,
    blockers,
    risks,
  };

  logger.info("Workflow executed successfully", {
    engagementId: engagement.id,
    severity: diagnosis.severity,
  });

  return output;
}
