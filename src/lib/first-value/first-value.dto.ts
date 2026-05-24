export type ConfidenceState =
  | "HIGH_CONFIDENCE"
  | "MEDIUM_CONFIDENCE"
  | "LOW_CONFIDENCE"
  | "NEED_MORE_DATA"
  | "CANNOT_DETERMINE"
  | "DANGER_DO_NOT_ACT";

export type FirstValueState =
  | "NO_WORKSPACE"
  | "EMPTY_WORKSPACE"
  | "DEMO_WORKSPACE_ACTIVE"
  | "MINIMUM_DATA_PRESENT"
  | "NEED_MORE_DATA"
  | "FIRST_VALUE_READY"
  | "FIRST_ACTION_READY"
  | "CANNOT_DETERMINE";

export interface FirstValueEvidenceRefDTO {
  id: string;
  type: "supporting" | "contradicting";
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  sourceType: "finding" | "kpi" | "observation" | "client_feedback";
  createdAt: string;
}

export interface FirstValueRiskDTO {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  impact: string;
  evidenceRefs: FirstValueEvidenceRefDTO[];
  confidenceState: ConfidenceState;
  priority: number;
}

export interface FirstValueOpportunityDTO {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  expectedValue: string;
  evidenceRefs: FirstValueEvidenceRefDTO[];
  confidenceState: ConfidenceState;
  priority: number;
}

export interface FirstValueActionDTO {
  id: string;
  action: string;
  reason: string;
  expectedImpact: string;
  effort: "MINIMAL" | "SMALL" | "MEDIUM" | "LARGE";
  risk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  evidenceRefs: FirstValueEvidenceRefDTO[];
  firstStep: string;
  stopCondition: string;
  confidenceState: ConfidenceState;
  recommendedPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  createdAt: string;
}

export interface FirstValueBusinessSnapshotDTO {
  engagementId: string;
  consultingLifecycleStage: string;
  businessCondition: string;
  interventionMode: string;
  interventionPhase: string;
  healthStatus: "CRITICAL" | "AT_RISK" | "STABLE" | "THRIVING";
  blockedActionCount: number;
  overdueActionCount: number;
  activeEngagementCount: number;
  lastUpdated: string;
}

export interface FirstValueDTO {
  workspaceId: string;
  isDemo: boolean;
  state: FirstValueState;
  confidence: ConfidenceState;

  businessSnapshot: FirstValueBusinessSnapshotDTO | null;

  topRisks: FirstValueRiskDTO[];
  topOpportunities: FirstValueOpportunityDTO[];

  recommendedFirstAction: FirstValueActionDTO | null;
  recommendedFirstActionReason:
    | "NO_ACTION_EVIDENCE"
    | "INSUFFICIENT_EVIDENCE"
    | "MULTIPLE_ACTIONS_AVAILABLE"
    | "ACTION_READY_FOR_EXECUTION"
    | null;

  missingDataAreas: string[];
  safetyWarnings: string[];

  dataReadiness: {
    hasEngagement: boolean;
    hasFinding: boolean;
    hasAction: boolean;
    hasKPI: boolean;
    percentComplete: number;
  };

  generatedAt: string;
}

export interface FirstValueExportDTO {
  exportType: "PILOT_PROOF_PACKET" | "SUPPORT_HANDOFF" | "BUYER_VISIBILITY";
  workspaceId: string;
  workspaceName: string;
  isDemo: boolean;
  generatedAt: string;
  generatedBy: string;
  expiresAt: string;

  businessSnapshot: FirstValueBusinessSnapshotDTO | null;
  topRisks: FirstValueRiskDTO[];
  topOpportunities: FirstValueOpportunityDTO[];
  recommendedFirstAction: FirstValueActionDTO | null;
  missingDataAreas: string[];
  safetyWarnings: string[];

  executiveNarrative: string;
  nextSteps: string[];
  documentVersion: "1.0";
}
