import { db } from "@/lib/db";
import { createClient } from "@/services/client-account";
import { createEngagement } from "@/services/engagement";
import { createFinding } from "@/services/findings";
import { createRecommendation } from "@/services/recommendation";
import { createAction } from "@/services/action";
import { transitionActionState } from "@/services/action-lifecycle";
import { computeEngagementHealth } from "@/services/engagement-health";
import { ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { AuthContext } from "@/lib/auth-guard";

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
    id: string;
    title: string;
    status: string;
    priority: string;
  }>;
  blockers: string[];
  risks: string[];
}

export async function executeWorkflow(
  input: ExecuteInput,
  actorId: string,
  workspaceId: string
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

  // Construct authContext for internal service-to-service calls
  const internalAuthContext: AuthContext = {
    session: {
      user: {
        id: actorId,
        email: "",
        name: "",
        isActive: true,
      },
      sessionId: "",
      expiresAt: new Date(),
    },
    policy: {
      userId: actorId,
      roles: [],
    },
  };

  // 1. Create client
  logger.info("Creating client", { clientName: input.clientName });
  const client = await createClient(
    {
      name: input.clientName,
      notes: `Problem: ${input.problem}`,
    },
    internalAuthContext,
    workspaceId
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
    internalAuthContext,
    workspaceId
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
      actorId,
      workspaceId
    );
    createdFindings.push(finding);
  }

  // 4. Create recommendations and actions
  const createdActions = [];
  for (const finding of createdFindings) {
    logger.info("Creating recommendation", { findingId: finding.id });
    const recommendation = await createRecommendation(
      {
        engagementId: engagement.id,
        findingId: finding.id,
        title: `Action for ${finding.engagementId}`,
        priority: input.priority,
      },
      actorId,
      workspaceId
    );

    logger.info("Creating action", { recommendationId: recommendation.id });
    // Construct authContext for internal service-to-service call
    const internalAuthContext: AuthContext = {
      session: {
        user: {
          id: actorId,
          email: "",
          name: "",
          isActive: true,
        },
        sessionId: "",
        expiresAt: new Date(),
      },
      policy: {
        userId: actorId,
        roles: [],
      },
    };
    const action = await createAction(
      {
        engagementId: engagement.id,
        recommendationId: recommendation.id,
        title: `Execute: ${finding.engagementId}`,
        priority: input.priority,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      internalAuthContext,
      workspaceId
    );

    // 5. Transition action to in_progress
    logger.info("Transitioning action to in_progress", { actionId: action.id });
    await transitionActionState(action.id, "in_progress", {
      actorId,
    });

    createdActions.push(action);
  }

  // 6. Compute engagement health
  logger.info("Computing engagement health", { engagementId: engagement.id });
  const health = await computeEngagementHealth(engagement.id);

  // 7. Build output
  const blockers = health.reasons;
  const risks: string[] = [];

  if (health.status === "blocked") {
    risks.push("Critical blockers detected - immediate action required");
  } else if (health.status === "at_risk") {
    risks.push("Risk factors detected - close monitoring recommended");
  }

  const output: ExecuteOutput = {
    engagementId: engagement.id,
    clientId: client.id,
    status: "draft",
    health: {
      status: health.status,
      reasons: health.reasons,
    },
    findings: createdFindings.map((f) => ({
      id: f.id,
      title: `Finding from ${f.engagementId}`,
    })),
    actions: createdActions.map((a) => ({
      id: a.id,
      title: a.title,
      status: "in_progress",
      priority: a.priority,
    })),
    blockers,
    risks,
  };

  logger.info("Workflow executed successfully", {
    engagementId: engagement.id,
    actionsCount: createdActions.length,
    health: health.status,
  });

  return output;
}
