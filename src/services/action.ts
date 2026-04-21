import { db } from "@/lib/db";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";
import type { ActionRecord } from "@/generated/prisma/client";
import { ActionStatus } from "@/generated/prisma/client";

export interface CreateActionInput {
  engagementId: string;
  title: string;
  description: string;
  phase: string;
  contingencyPlan?: string;
  fallbackOption?: string;
  criticalityLevel: number;
  executionRisk: number;
  ownerUserId?: string;
  dueDate?: Date;
  recommendationId?: string;
  createdByUserId?: string;
}

export async function createAction(input: CreateActionInput): Promise<ActionRecord> {
  const action = await db.actionRecord.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description,
      phase: input.phase,
      contingencyPlan: input.contingencyPlan,
      fallbackOption: input.fallbackOption,
      criticalityLevel: input.criticalityLevel,
      executionRisk: input.executionRisk,
      ownerUserId: input.ownerUserId,
      dueDate: input.dueDate,
      recommendationId: input.recommendationId,
      status: "DRAFT" as ActionStatus,
      createdByUserId: input.createdByUserId,
    },
  });

  return action;
}

export async function createActionsFromInterventions(
  engagementId: string,
  interventions: PrioritizedIntervention[],
  createdByUserId?: string
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];

  for (const item of interventions) {
    const intervention = item.intervention;

    for (const step of intervention.steps) {
      const action = await createAction({
        engagementId,
        title: `${intervention.title}: ${step.title}`,
        description: step.description,
        phase: step.sequence.toString(),
        contingencyPlan: intervention.fallbackPlan,
        fallbackOption: intervention.fallbackPlan,
        criticalityLevel: item.priorityScore > 70 ? 9 : item.priorityScore > 50 ? 7 : 5,
        executionRisk: Math.min(
          10,
          intervention.failureRisks.length + step.dependsOn?.length || 0
        ),
        dueDate: new Date(Date.now() + step.estimatedDays * 24 * 60 * 60 * 1000),
        createdByUserId,
      });

      actions.push(action);
    }
  }

  return actions;
}

export async function getActionsByEngagement(engagementId: string) {
  return db.actionRecord.findMany({
    where: { engagementId },
    orderBy: [{ phase: "asc" }, { createdAt: "asc" }],
  });
}

export async function getActionsByStatus(engagementId: string, status: ActionStatus) {
  return db.actionRecord.findMany({
    where: { engagementId, status },
    orderBy: { createdAt: "desc" },
  });
}
