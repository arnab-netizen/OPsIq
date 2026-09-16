/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { requireServiceContext } from "@/lib/service-auth";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { humanizeSnakeCase } from "@/lib/metric-label";
import {
  FirstValueDTO,
  FirstValueState,
  ConfidenceState,
  FirstValueRiskDTO,
  FirstValueOpportunityDTO,
  FirstValueActionDTO,
} from "@/lib/first-value/first-value.dto";

// Finding.severity / Action.status are real lowercase columns (see
// domain/constants/statuses.ts RISK_SEVERITIES / ACTION_STATUSES); the DTO's severity field is
// an uppercase display enum. Previously this file compared them against invented uppercase
// literals ("CRITICAL"/"BLOCKED"/"ACTIVE"/"RECOMMENDED") that never matched the real stored
// values, so sorting/filtering/selection silently no-op'd. These map real values only.
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
function toSeverityDTO(severity: string | null | undefined): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const upper = (severity ?? "").toUpperCase();
  return upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW" ? upper : "MEDIUM";
}
function toHealthStatusDTO(healthStatus: string | null | undefined): "CRITICAL" | "AT_RISK" | "STABLE" | "THRIVING" {
  switch (healthStatus) {
    case "critical":
      return "CRITICAL";
    case "at_risk":
      return "AT_RISK";
    default:
      return "STABLE";
  }
}

async function getFirstValue(ctx: CanonicalAuthContext, workspaceId: string): Promise<FirstValueDTO> {
  requireServiceContext(ctx, workspaceId);

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  // Fetch engagement for this workspace. The Finding model has NO `category` column -- selecting
  // it (or reading it off an `any`-typed result) threw when findings existed, causing the
  // production 500 this fix closes. businessConditionProfiles (plural, filtered to the current
  // one) replaces a phantom singular `businessConditionProfile` access that never existed on the
  // Engagement model at all. No schema change, no fake fields -- same pattern findings.ts already
  // established for this identical bug class on the same Finding model.
  const engagement = await db.engagement.findFirst({
    where: { workspaceId },
    include: {
      findings: true,
      actions: true,
      kpis: true,
      businessConditionProfiles: { where: { isCurrent: true } },
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
  const currentBusinessConditionProfile = engagement?.businessConditionProfiles?.[0] ?? null;
  const businessSnapshot = engagement
    ? {
        engagementId: engagement.id,
        consultingLifecycleStage: engagement.interventionPhase || "UNKNOWN",
        businessCondition: currentBusinessConditionProfile
          ? humanizeSnakeCase(currentBusinessConditionProfile.businessStatus)
          : "Unknown",
        interventionMode: engagement.interventionMode || "UNKNOWN",
        interventionPhase: engagement.interventionPhase || "UNKNOWN",
        healthStatus: toHealthStatusDTO(engagement.healthStatus),
        blockedActionCount:
          engagement.actions?.filter((a: any) => a.status === "blocked").length ?? 0,
        overdueActionCount:
          engagement.actions?.filter((a: any) => a.status === "overdue").length ?? 0,
        activeEngagementCount: 1,
        lastUpdated: new Date().toISOString(),
      }
    : null;

  // Extract top risks from findings. Finding has no risk/opportunity polarity column anywhere in
  // the schema (checked Finding and Recommendation) -- in this domain a Finding is a diagnosed
  // problem, so every finding is honestly a risk signal and topOpportunities is intentionally
  // empty rather than invented from a nonexistent classification (see FIRST_VALUE_ROOT_CAUSE in
  // the PR description for the full investigation).
  const risks: FirstValueRiskDTO[] = (engagement?.findings ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        (SEVERITY_ORDER[(a.severity ?? "").toLowerCase()] ?? 999) -
        (SEVERITY_ORDER[(b.severity ?? "").toLowerCase()] ?? 999)
    )
    .slice(0, 3)
    .map((f: any) => ({
      id: f.id,
      severity: toSeverityDTO(f.severity),
      description: f.title,
      impact: f.summary,
      evidenceRefs: [
        {
          id: f.id,
          type: "supporting" as const,
          severity: toSeverityDTO(f.severity),
          description: "Finding",
          sourceType: "finding" as const,
          createdAt: f.createdAt.toISOString(),
        },
      ],
      confidenceState: "MEDIUM_CONFIDENCE" as ConfidenceState,
      priority: (f.severity ?? "").toLowerCase() === "critical" ? 1 : 2,
    }));

  const opportunities: FirstValueOpportunityDTO[] = [];

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
      // "assigned" (real Action status -- see domain/constants/statuses.ts ACTION_STATUSES) is
      // the closest real equivalent of the phantom "RECOMMENDED" status this previously compared
      // against, which never matched a stored value and always fell through to actionCandidates[0].
      const recommendedActionRecord =
        actionCandidates.find((a: any) => a.status === "assigned") || actionCandidates[0];

      if (recommendedActionRecord) {
        recommendedFirstAction = {
          id: recommendedActionRecord.id,
          action: recommendedActionRecord.title,
          reason: recommendedActionRecord.description,
          // Action has no expectedOutcome/effort/riskLevel/actionType/priority column -- these
          // stay as the same honest fallbacks the phantom-field reads always silently fell back
          // to (undefined || fallback), just without the dead property access.
          expectedImpact: "",
          effort: "MEDIUM",
          risk: "MEDIUM",
          evidenceRefs: risks[0]?.evidenceRefs || [],
          firstStep: "Identify owner and next steps",
          stopCondition:
            "Reassess if business condition changes or new risks emerge",
          confidenceState: "HIGH_CONFIDENCE",
          recommendedPriority: "HIGH",
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
