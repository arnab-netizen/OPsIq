/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { requireServiceContext } from "@/lib/service-auth";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import {
  FirstValueDTO,
  FirstValueState,
  ConfidenceState,
  FirstValueRiskDTO,
  FirstValueOpportunityDTO,
  FirstValueActionDTO,
} from "@/lib/first-value/first-value.dto";

async function getFirstValue(ctx: CanonicalAuthContext, workspaceId: string): Promise<FirstValueDTO> {
  requireServiceContext(ctx, workspaceId);

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  // Fetch engagement for this workspace
  const engagement = await db.engagement.findFirst({
    where: { workspaceId },
    include: {
      findings: true,
      actions: true,
      kpis: true,
    },
  });

  // Determine state machine
  let state: FirstValueState = "NO_WORKSPACE";
  let confidence: ConfidenceState = "CANNOT_DETERMINE";

  if (!engagement) {
    state = "EMPTY_WORKSPACE";
  } else {
    const findingCount = engagement.findings?.length ?? 0;
    const actionCount = engagement.actions?.length ?? 0;

    if (findingCount === 0 && actionCount === 0) {
      state = "EMPTY_WORKSPACE";
    } else if (findingCount > 0 && actionCount === 0) {
      state = "MINIMUM_DATA_PRESENT";
      confidence = "MEDIUM_CONFIDENCE";
    } else if (findingCount > 0 && actionCount > 0) {
      state = "FIRST_VALUE_READY";
      confidence = "HIGH_CONFIDENCE";
    } else {
      state = "CANNOT_DETERMINE";
    }
  }

  // Build business snapshot
  const businessSnapshot = engagement
    ? {
        engagementId: engagement.id,
        consultingLifecycleStage: engagement.interventionPhase || "UNKNOWN",
        businessCondition:
          typeof engagement.businessConditionProfile === "object" &&
          engagement.businessConditionProfile !== null
            ? (engagement.businessConditionProfile as Record<string, any>)
                .industry || "Unknown"
            : "Unknown",
        interventionMode: engagement.interventionMode || "UNKNOWN",
        interventionPhase: engagement.interventionPhase || "UNKNOWN",
        healthStatus: (engagement.health as any) || "STABLE",
        blockedActionCount:
          engagement.actions?.filter((a: any) => (a.status as string) === "BLOCKED")
            .length ?? 0,
        overdueActionCount:
          engagement.actions?.filter(
            (a: any) =>
              (a.status as string) === "ACTIVE" &&
              (a.dueDate as any) < new Date()
          ).length ?? 0,
        activeEngagementCount: 1,
        lastUpdated: new Date().toISOString(),
      }
    : null;

  // Extract risks and opportunities from findings
  const severityOrder: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };

  const risks: FirstValueRiskDTO[] = (engagement?.findings ?? [])
    .filter((f: any) =>
      (f.category as string).includes("RISK")
    )
    .sort((a: any, b: any) => {
      const aOrder = severityOrder[(a.severity as string)] ?? 999;
      const bOrder = severityOrder[(b.severity as string)] ?? 999;
      return aOrder - bOrder;
    })
    .slice(0, 3)
    .map((f: any) => ({
      id: f.id,
      severity: (f.severity as any) || "MEDIUM",
      description: f.title,
      impact: f.description,
      evidenceRefs: [
        {
          id: f.id,
          type: "supporting" as const,
          severity: (f.severity as any) || "MEDIUM",
          description: f.source || "Finding",
          sourceType: "finding" as const,
          createdAt: f.createdAt.toISOString(),
        },
      ],
      confidenceState: (f.confidence as any) || "MEDIUM_CONFIDENCE",
      priority: (f.severity as string) === "CRITICAL" ? 1 : 2,
    }));

  const opportunities: FirstValueOpportunityDTO[] = (engagement?.findings ?? [])
    .filter(
      (f: any) =>
        (f.category as string).includes("OPPORTUNITY")
    )
    .sort((a: any, b: any) => {
      const aOrder = severityOrder[(a.severity as string)] ?? 999;
      const bOrder = severityOrder[(b.severity as string)] ?? 999;
      return aOrder - bOrder;
    })
    .slice(0, 3)
    .map((f: any) => ({
      id: f.id,
      severity: (f.severity as any) || "MEDIUM",
      description: f.title,
      expectedValue: f.description,
      evidenceRefs: [
        {
          id: f.id,
          type: "supporting" as const,
          severity: (f.severity as any) || "MEDIUM",
          description: f.source || "Finding",
          sourceType: "finding" as const,
          createdAt: f.createdAt.toISOString(),
        },
      ],
      confidenceState: (f.confidence as any) || "MEDIUM_CONFIDENCE",
      priority: (f.severity as string) === "CRITICAL" ? 1 : 2,
    }));

  // Select recommended first action
  let recommendedFirstAction: FirstValueActionDTO | null = null;
  let recommendedFirstActionReason: string | null = null;

  if (!engagement || risks.length === 0) {
    recommendedFirstActionReason = "NO_ACTION_EVIDENCE";
  } else {
    const actionCandidates = engagement.actions ?? [];
    if (actionCandidates.length === 0) {
      recommendedFirstActionReason = "INSUFFICIENT_EVIDENCE";
    } else {
      const recommendedActionRecord = actionCandidates.find(
        (a: any) => (a.status as string) === "RECOMMENDED"
      ) || actionCandidates[0];

      if (recommendedActionRecord) {
        recommendedFirstAction = {
          id: recommendedActionRecord.id,
          action: recommendedActionRecord.title,
          reason: recommendedActionRecord.description,
          expectedImpact: recommendedActionRecord.expectedOutcome || "",
          effort: (recommendedActionRecord.effort as any) || "MEDIUM",
          risk: (recommendedActionRecord.riskLevel as any) || "MEDIUM",
          evidenceRefs: risks[0]?.evidenceRefs || [],
          firstStep:
            recommendedActionRecord.actionType ||
            "Identify owner and next steps",
          stopCondition:
            "Reassess if business condition changes or new risks emerge",
          confidenceState: "HIGH_CONFIDENCE",
          recommendedPriority: (recommendedActionRecord.priority as any) ||
            "HIGH",
          createdAt: recommendedActionRecord.createdAt.toISOString(),
        };
        recommendedFirstActionReason = "ACTION_READY_FOR_EXECUTION";
      }
    }
  }

  // Identify missing data
  const missingDataAreas: string[] = [];
  if (!engagement) {
    missingDataAreas.push("No engagement created yet");
  }
  if ((engagement?.findings ?? []).length === 0) {
    missingDataAreas.push("No findings or risk assessment");
  }
  if ((engagement?.kpis ?? []).length === 0) {
    missingDataAreas.push("No KPI baseline measurements");
  }
  if ((engagement?.actions ?? []).length === 0) {
    missingDataAreas.push("No actions defined");
  }

  // Safety warnings
  const safetyWarnings: string[] = [];
  if (state === "EMPTY_WORKSPACE") {
    safetyWarnings.push(
      "Demo workspace has minimal data. All recommendations are illustrative only."
    );
  }
  if (!recommendedFirstAction) {
    safetyWarnings.push(
      "No recommended action available. More evidence needed before action."
    );
  }

  return {
    workspaceId,
    isDemo: workspace.name.includes("DEMO"),
    state,
    confidence,
    businessSnapshot,
    topRisks: risks,
    topOpportunities: opportunities,
    recommendedFirstAction,
    recommendedFirstActionReason: (recommendedFirstActionReason as any) || null,
    missingDataAreas,
    safetyWarnings,
    dataReadiness: {
      hasEngagement: !!engagement,
      hasFinding: (engagement?.findings ?? []).length > 0,
      hasAction: (engagement?.actions ?? []).length > 0,
      hasKPI: (engagement?.kpis ?? []).length > 0,
      percentComplete: engagement ? 50 : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { getFirstValue };
